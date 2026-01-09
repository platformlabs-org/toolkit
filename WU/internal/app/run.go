package app

import (
	"context"
	"encoding/json"
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
	"WU/internal/validate"
)

const (
	baseAPI                   = "https://manage.devcenter.microsoft.com/v2.0/my/hardware"
	partnerShippingURLTemplate = "https://partner.microsoft.com/en-us/dashboard/hardware/driver/%s/submission/%s/ShippingLabel/%d"
)

func Run(opt *cli.CLIOptions) int {
	fmt.Println("Hardware Dashboard API - Shipping Label Creator (Go) [WU]")
	fmt.Println(support.Repeat("=", 100))

	// ---- credential store/load ----
	credPath := credentialPath()
	cred := auth.LoadCredential(credPath)

	// CLI/env override > credential.json (prompt if missing)
	opt.TenantID = support.FirstNonEmpty(cred.TenantID, opt.TenantID, os.Getenv("HW_TENANT_ID"))
	opt.ClientID = support.FirstNonEmpty(cred.ClientID, opt.ClientID, os.Getenv("HW_CLIENT_ID"))
	opt.ClientSecret = support.FirstNonEmpty(cred.ClientSecret, opt.ClientSecret, os.Getenv("HW_CLIENT_SECRET"))

	if support.IsBlank(opt.TenantID) {
		opt.TenantID = cli.Prompt("tenant_id")
	}
	if support.IsBlank(opt.ClientID) {
		opt.ClientID = cli.Prompt("client_id")
	}
	if support.IsBlank(opt.ClientSecret) {
		opt.ClientSecret = cli.PromptSecret("client_secret")
	}

	cred.TenantID = opt.TenantID
	cred.ClientID = opt.ClientID
	cred.ClientSecret = opt.ClientSecret
	auth.SaveCredential(credPath, cred)

	// ---- submission shortcut parsing ----
	if support.IsBlank(opt.ProductID) {
		raw := cli.Prompt("productId")
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
		opt.SubmissionID = cli.Prompt("submissionId")
	}

	if support.IsBlank(opt.TenantID) || support.IsBlank(opt.ClientID) || support.IsBlank(opt.ClientSecret) ||
		support.IsBlank(opt.ProductID) || support.IsBlank(opt.SubmissionID) {
		fmt.Fprintln(os.Stderr, "❌ tenant_id / client_id / client_secret / product_id / submission_id 不能为空")
		return 2
	}

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	httpClient := devcenter.NewClient(baseAPI)

	fmt.Println("\n[1/4] 获取 token ...")
	token, err := auth.AcquireToken(ctx, httpClient.HTTP, opt.TenantID, opt.ClientID, opt.ClientSecret)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}
	fmt.Println("✅ token OK")

	fmt.Println("\n[2/4] 获取 submission ...")
	submission, err := devcenter.GetSubmission(ctx, httpClient, token, opt.ProductID, opt.SubmissionID)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}
	fmt.Println("✅ submission OK")
	devcenter.PrintWorkflowStatus(submission)

	fmt.Println("\n[3/4] 下载并解析 driverMetadata ...")
	driverMetadataURL, err := devcenter.FindDriverMetadataURL(submission)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	metaRoot, err := devcenter.DownloadDriverMetadata(ctx, httpClient, token, driverMetadataURL)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	parsed, err := drivermeta.Parse(metaRoot)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}
	fmt.Println("✅ metadata OK: candidates=" + support.Itoa(len(parsed.Targets)))
	if len(parsed.Targets) == 0 {
		printErr(support.NewAPIError("metadata 中没有任何 (bundle,inf,os,pnp) 候选，无法继续"))
		return 1
	}

	// ---- select targets ----
	var selected []drivermeta.HardwareTarget
	if opt.SelectAll {
		selected = append(selected, parsed.Targets...)
		fmt.Println("✅ --select-all：已选择全部 hardwareIds = " + support.Itoa(len(selected)))
	} else {
		selected, err = selectTargets(parsed, opt)
		if err != nil {
			printErr(err)
			return exitCode(err)
		}
		if len(selected) == 0 {
			printErr(support.NewAPIError("未选择任何 hardwareIds，终止。"))
			return 1
		}
		fmt.Println("✅ 已选择 hardwareIds = " + support.Itoa(len(selected)))
	}

	// ---- CHIDs ----
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

	// ---- name ----
	name := opt.Name
	if support.IsBlank(name) {
		name = cli.PromptWithDefault("Shipping label name", "{OEM Name}: {Project Name}")
	}

	// ---- payload build ----
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
		printErr(support.NewAPIError("写入请求体失败: " + err.Error()))
		return 1
	}
	fmt.Println("\n✅ 已生成请求体：" + outPath)

	if opt.DryRun {
		fmt.Println("\n--dry-run：不发送 POST。")
		return 0
	}

	fmt.Println("\n[4/4] 创建 shipping label (POST /shippingLabels) ...")
	respObj, err := devcenter.CreateShippingLabel(ctx, httpClient, token, opt.ProductID, opt.SubmissionID, bodyObj)
	if err != nil {
		printErr(err)
		return exitCode(err)
	}

	if b, e := json.MarshalIndent(respObj, "", "  "); e == nil {
		fmt.Println("\nResponse:")
		fmt.Println(string(b))
	}

	if id, ok := support.TryGetInt64(respObj, "id"); ok {
		shippingURL := fmt.Sprintf(partnerShippingURLTemplate, opt.ProductID, opt.SubmissionID, id)
		fmt.Println("\n✅ 创建成功，Shipping URL: " + shippingURL)
	} else {
		fmt.Println("\n✅ 创建成功（返回中未找到 id）")
	}

	return 0
}

func selectTargets(parsed *drivermeta.ParseResult, opt *cli.CLIOptions) ([]drivermeta.HardwareTarget, error) {
	working := parsed.Targets

	// offer filter if too many (same behavior)
	if len(working) > 300 && opt.OfferFilter {
		if cli.PromptYesNo(fmt.Sprintf("候选组合很多（%d），是否先用关键字过滤？", len(working)), true) {
			kw := cli.PromptWithDefault("过滤关键字（匹配 INF/OS/PNP/描述；留空=不筛选）", "")
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
		return nil, support.NewAPIError("过滤后没有任何候选项。")
	}

	items := drivermeta.BuildListItems(working, parsed.UI)

	var idxs []int
	var err error
	if opt.NoUI {
		texts := make([]string, 0, len(items))
		for _, it := range items {
			texts = append(texts, it.Text)
		}
		idxs, err = cli.PromptIndexSelection("选择硬件目标（单页：B# | INF | OS | PNP | 描述）", texts, false, true)
	} else {
		idxs, err = tui.RunMultiSelectLegend(
			"选择硬件目标（单页：B# | INF | OS | PNP | 描述）",
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
		fmt.Fprintln(os.Stderr, "\n用户取消或超时。")
		return 130
	}
	if support.IsAPIError(err) {
		return 1
	}
	return 1
}

func printErr(err error) {
	fmt.Fprintln(os.Stderr, "\n❌ 错误：")
	fmt.Fprintln(os.Stderr, err.Error())
}
