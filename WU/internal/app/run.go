package app

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"WU/internal/auth"
	"WU/internal/cli"
	"WU/internal/devcenter"
	"WU/internal/drivermeta"
	"WU/internal/format"
	"WU/internal/shippinglabel"
	"WU/internal/support"
	"WU/internal/tui"
	"WU/internal/ui"
	"WU/internal/validate"
)

const (
	baseAPI                   = "https://manage.devcenter.microsoft.com/v2.0/my/hardware"
	partnerShippingURLTemplate = "https://partner.microsoft.com/en-us/dashboard/hardware/driver/%s/submission/%s/ShippingLabel/%d"
)

func Run(opt *cli.CLIOptions) int {
	ui.Banner("WU", "1.0.0")
	fmt.Println("Hardware Dashboard API - Shipping Label Creator")
	ui.EndLine("Start")

	// ---- Step 1: Initialize & Auth ----
	ui.Section(ui.StepCtx{Title: "Initialize", Current: 1, Total: 4})
	ui.Item("Loading credentials", "credential.json")

	credPath := credentialPath()
	cred := auth.LoadCredential(credPath)

	// CLI/env override > credential.json
	opt.TenantID = support.FirstNonEmpty(cred.TenantID, opt.TenantID, os.Getenv("HW_TENANT_ID"))
	opt.ClientID = support.FirstNonEmpty(cred.ClientID, opt.ClientID, os.Getenv("HW_CLIENT_ID"))
	opt.ClientSecret = support.FirstNonEmpty(cred.ClientSecret, opt.ClientSecret, os.Getenv("HW_CLIENT_SECRET"))

	// Prompt if missing
	if support.IsBlank(opt.TenantID) {
		opt.TenantID = ui.Prompt("tenant_id", "")
	}
	if support.IsBlank(opt.ClientID) {
		opt.ClientID = ui.Prompt("client_id", "")
	}
	if support.IsBlank(opt.ClientSecret) {
		opt.ClientSecret = ui.PromptSecret("client_secret")
	}

	// Save back
	cred.TenantID = opt.TenantID
	cred.ClientID = opt.ClientID
	cred.ClientSecret = opt.ClientSecret
	auth.SaveCredential(credPath, cred)

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	httpClient := devcenter.NewClient(baseAPI)

	// Acquire Token (MOVED HERE per requirements)
	var token string
	err := ui.Spin("Acquiring token...", func() error {
		var err error
		token, err = auth.AcquireToken(ctx, httpClient.HTTP, opt.TenantID, opt.ClientID, opt.ClientSecret)
		return err
	})
	if err != nil {
		ui.Fail("Token acquisition failed")
		printErr(err)
		return exitCode(err)
	}
	ui.Ok("Token acquired")

	// ---- Step 2: Submission Selection ----
	ui.Section(ui.StepCtx{Title: "Submission Selection", Current: 2, Total: 4})

	if support.IsBlank(opt.ProductID) {
		raw := ui.Prompt("productId (or submission shortcut)", "")
		if p, s, ok := cli.TryParseSubmissionShortcut(raw); ok {
			opt.ProductID = p
			if support.IsBlank(opt.SubmissionID) {
				opt.SubmissionID = s
			}
		} else {
			opt.ProductID = raw
		}
	}
	if support.IsBlank(opt.SubmissionID) {
		opt.SubmissionID = ui.Prompt("submissionId", "")
	}

	if support.IsBlank(opt.TenantID) || support.IsBlank(opt.ClientID) || support.IsBlank(opt.ClientSecret) ||
		support.IsBlank(opt.ProductID) || support.IsBlank(opt.SubmissionID) {
		ui.Fail("tenant_id / client_id / client_secret / product_id / submission_id cannot be empty")
		return 2
	}

	var submission map[string]any
	err = ui.Spin("Fetching submission...", func() error {
		var err error
		submission, err = devcenter.GetSubmission(ctx, httpClient, token, opt.ProductID, opt.SubmissionID)
		return err
	})
	if err != nil {
		ui.Fail("Fetch submission failed")
		printErr(err)
		return exitCode(err)
	}
	ui.Ok("Submission fetched")

	// Print workflow status
	// devcenter.PrintWorkflowStatus expects map[string]any
	devcenter.PrintWorkflowStatus(submission)


	// ---- Step 3: Metadata & Target Selection ----
	ui.Section(ui.StepCtx{Title: "Metadata Analysis", Current: 3, Total: 4})

	var metaRoot map[string]any
	var driverMetadataURL string

	err = ui.Spin("Resolving metadata URL...", func() error {
		var err error
		driverMetadataURL, err = devcenter.FindDriverMetadataURL(submission)
		return err
	})
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	err = ui.Spin("Downloading driverMetadata...", func() error {
		var err error
		metaRoot, err = devcenter.DownloadDriverMetadata(ctx, httpClient, token, driverMetadataURL)
		return err
	})
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	var parsed *drivermeta.ParseResult
	err = ui.Spin("Parsing candidates...", func() error {
		var err error
		parsed, err = drivermeta.Parse(metaRoot)
		return err
	})
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	ui.Ok(fmt.Sprintf("Metadata OK: candidates=%d", len(parsed.Targets)))

	if len(parsed.Targets) == 0 {
		ui.Fail("No candidates found in metadata")
		return 1
	}

	// Selection
	ui.Section(ui.StepCtx{Title: "Selection", Current: 3, Total: 4})

	var selected []drivermeta.HardwareTarget
	if opt.SelectAll {
		selected = append(selected, parsed.Targets...)
		ui.Ok(fmt.Sprintf("--select-all: selected %d hardwareIds", len(selected)))
	} else {
		fmt.Println("")
		selected, err = selectTargets(parsed, opt)
		if err != nil {
			printErr(err)
			return exitCode(err)
		}
		if len(selected) == 0 {
			ui.Fail("No hardwareIds selected")
			return 1
		}
		ui.Ok(fmt.Sprintf("Selected %d hardwareIds", len(selected)))
	}
	ui.EndLine("Selected")


	// ---- Step 4: Create Label ----
	ui.Section(ui.StepCtx{Title: "Create Shipping Label", Current: 4, Total: 4})

	var chids []string
	if len(opt.Chids) > 0 {
		chids, err = validate.NormalizeCHIDsRequired(opt.Chids)
	} else {
		chids, err = validate.PromptCHIDsRequired()
	}
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	name := opt.Name
	if support.IsBlank(name) {
		name = ui.Prompt("Shipping label name", "{OEM Name}: {Project Name}")
		if name == "{OEM Name}: {Project Name}" {
			// handled by prompt returning default if user hits enter
		}
	}

	bodyObj, err := shippinglabel.BuildPayload(opt, name, selected, chids)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	outPath := opt.OutPath
	if support.IsBlank(outPath) {
		outPath = "shippinglabel.request.json"
	}
	if err := os.WriteFile(outPath, format.MustJSONIndent(bodyObj), 0644); err != nil {
		ui.Fail("Failed to write request body: " + err.Error())
		return 1
	}
	ui.Ok("Request saved: " + outPath)

	if opt.DryRun {
		ui.EndLine("--dry-run (no POST)")
		return 0
	}

	var respObj map[string]any
	err = ui.Spin("Creating shipping label...", func() error {
		var e error
		respObj, e = devcenter.CreateShippingLabel(ctx, httpClient, token, opt.ProductID, opt.SubmissionID, bodyObj)
		return e
	})

	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	if id, ok := support.TryGetInt64(respObj, "id"); ok {
		shippingURL := fmt.Sprintf(partnerShippingURLTemplate, opt.ProductID, opt.SubmissionID, id)
		ui.Ok("Created: " + shippingURL)
	} else {
		ui.Ok("Created (id not found in response)")
	}

	ui.EndLine("Complete")
	ui.Prompt("Press Enter to exit", "")
	return 0
}

func selectTargets(parsed *drivermeta.ParseResult, opt *cli.CLIOptions) ([]drivermeta.HardwareTarget, error) {
	working := parsed.Targets

	// offer filter if too many (same behavior)
	if len(working) > 300 && opt.OfferFilter {
		if ui.PromptYesNo(fmt.Sprintf("Too many candidates (%d). Filter by keyword?", len(working)), true) {
			kw := ui.Prompt("Filter keyword (INF/OS/PNP...)", "")
			if !support.IsBlank(kw) {
				low := support.ToLower(kw)
				tmp := make([]drivermeta.HardwareTarget, 0, len(working))
				for _, t := range working {
					if support.ContainsLower(t.InfID, low) ||
						support.ContainsLower(t.OSCode, low) ||
						support.ContainsLower(t.PnpID, low) ||
						support.ContainsLower(t.Manufacturer, low) ||
						support.ContainsLower(t.DeviceDescription, low) {
						tmp = append(tmp, t)
					}
				}
				working = tmp
			}
		}
	}

	if len(working) == 0 {
		return nil, support.NewAPIError("No candidates after filter.")
	}

	items := drivermeta.BuildListItems(working, parsed.UI)

	var idxs []int
	var err error
	if opt.NoUI {
		texts := make([]string, 0, len(items))
		for _, it := range items {
			texts = append(texts, it.Text)
		}
		idxs, err = cli.PromptIndexSelection("Select targets", texts, false, true)
	} else {
		idxs, err = tui.RunMultiSelectLegend(
			"Select targets (Space to toggle, Enter to confirm)",
			drivermeta.ToTUILegends(parsed.UI.Legends),
			items,
		)
	}
	if err != nil {
		return nil, err
	}

	out := make([]drivermeta.HardwareTarget, 0, len(idxs))
	for _, i := range idxs {
		out = append(out, working[i])
	}
	return out, nil
}

func credentialPath() string {
	exe, err := os.Executable()
	if err != nil {
		return "credential.json"
	}
	return filepath.Join(filepath.Dir(exe), "credential.json")
}

func exitCode(err error) int {
	if support.IsCanceled(err) || support.IsCanceledLike(err) {
		ui.Fail("User canceled or timeout.")
		return 130
	}
	if support.IsAPIError(err) {
		return 1
	}
	return 1
}

func printErr(err error) {
	fmt.Fprintln(os.Stderr, err.Error())
}
