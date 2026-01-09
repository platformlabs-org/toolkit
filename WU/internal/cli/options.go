package cli

import (
	"fmt"
	"os"

	"WU/internal/support"
)

type CLIOptions struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	ProductID    string
	SubmissionID string

	SelectAll bool
	DryRun    bool
	OutPath   string

	Destination string
	Name        string

	GoLiveImmediate bool
	GoLiveDate      string

	VisibleToAccounts []int

	AutoInstallDuringOSUpgrade     bool
	AutoInstallOnApplicableSystems bool

	IsDisclosureRestricted bool
	PublishToWindows10s    bool

	MsContact             string
	ValidationsPerformed  string
	AffectedOems          []string
	IsRebootRequired      bool
	IsCoEngineered        bool
	IsForUnreleasedHardware bool
	HasUiSoftware         bool
	BusinessJustification string

	Chids []string

	NoUI       bool
	OfferFilter bool
}

func defaultCLIOptions() *CLIOptions {
	return &CLIOptions{
		Destination: "windowsUpdate",
		GoLiveImmediate: true,
		VisibleToAccounts: []int{},

		AutoInstallDuringOSUpgrade:     true,
		AutoInstallOnApplicableSystems: true,

		MsContact:            "feizh@microsoft.com",
		ValidationsPerformed: "Product assurance team full range tested",
		AffectedOems:         []string{"Lenovo"},
		IsRebootRequired:     false,
		IsCoEngineered:       false,
		IsForUnreleasedHardware: false,
		HasUiSoftware:        false,
		BusinessJustification: "to meet MDA requirements",

		Chids:       []string{},
		OfferFilter: true,
	}
}

func ParseCLIOptions(argv []string) (*CLIOptions, error) {
	o := defaultCLIOptions()
	m := ParseArgs(argv)

	o.TenantID = m.GetSingle("--tenant-id")
	o.ClientID = m.GetSingle("--client-id")
	o.ClientSecret = m.GetSingle("--client-secret")
	o.ProductID = m.GetSingle("--product-id")
	o.SubmissionID = m.GetSingle("--submission-id")

	o.SelectAll = m.HasFlag("--select-all")
	o.DryRun = m.HasFlag("--dry-run")
	o.OutPath = support.FirstNonEmpty(m.GetSingle("--out"), "shippinglabel.request.json")

	o.Destination = support.FirstNonEmpty(m.GetSingle("--destination"), o.Destination)
	o.Name = m.GetSingle("--name")

	o.GoLiveImmediate = !m.HasFlag("--schedule-go-live")
	if v := m.GetSingle("--go-live-date"); !support.IsBlank(v) {
		o.GoLiveDate = v
		o.GoLiveImmediate = false
	}

	for _, s := range m.GetMany("--visible-to-accounts") {
		n, err := support.ParseIntStrict(s)
		if err != nil {
			return nil, support.NewAPIError("--visible-to-accounts 需要整数，但输入为: " + s)
		}
		o.VisibleToAccounts = append(o.VisibleToAccounts, n)
	}

	if m.HasFlag("--auto-install-os-upgrade") {
		o.AutoInstallDuringOSUpgrade = true
	}
	if m.HasFlag("--no-auto-install-os-upgrade") {
		o.AutoInstallDuringOSUpgrade = false
	}
	if m.HasFlag("--auto-install-applicable") {
		o.AutoInstallOnApplicableSystems = true
	}
	if m.HasFlag("--no-auto-install-applicable") {
		o.AutoInstallOnApplicableSystems = false
	}

	o.IsDisclosureRestricted = m.HasFlag("--is-disclosure-restricted")
	o.PublishToWindows10s = m.HasFlag("--publish-to-windows10s")

	if v := m.GetSingle("--ms-contact"); !support.IsBlank(v) {
		o.MsContact = v
	}
	if v := m.GetSingle("--validations-performed"); !support.IsBlank(v) {
		o.ValidationsPerformed = v
	}

	if a := m.GetMany("--affected-oems"); len(a) > 0 {
		o.AffectedOems = append([]string{}, a...)
	}

	o.IsRebootRequired = m.HasFlag("--is-reboot-required")
	o.IsCoEngineered = m.HasFlag("--is-co-engineered")
	o.IsForUnreleasedHardware = m.HasFlag("--is-for-unreleased-hardware")
	o.HasUiSoftware = m.HasFlag("--has-ui-software")

	if v := m.GetSingle("--business-justification"); !support.IsBlank(v) {
		o.BusinessJustification = v
	}

	o.Chids = append([]string{}, m.GetMany("--chids")...)

	o.NoUI = m.HasFlag("--no-ui")
	if m.HasFlag("--no-filter") {
		o.OfferFilter = false
	}

	return o, nil
}

func PrintErr(err error) {
	fmt.Fprintln(os.Stderr, "\n❌ 错误：")
	fmt.Fprintln(os.Stderr, err.Error())
}
