package shippinglabel

import (
	"WU/internal/cli"
	"WU/internal/drivermeta"
	"WU/internal/support"
)

func BuildPayload(opt *cli.CLIOptions, name string, targets []drivermeta.HardwareTarget, chids []string) (map[string]any, error) {
	if len(chids) == 0 {
		return nil, support.NewAPIError("CHIDs 必须至少提供 1 个（必填）。")
	}

	publishing := map[string]any{
		"goLiveDate": func() string {
			if opt.GoLiveImmediate {
				return ""
			}
			return support.Or(opt.GoLiveDate, "")
		}(),
		"visibleToAccounts":             opt.VisibleToAccounts,
		"isAutoInstallDuringOSUpgrade":  opt.AutoInstallDuringOSUpgrade,
		"isAutoInstallOnApplicableSystems": opt.AutoInstallOnApplicableSystems,
		"manualAcquisition":             (!opt.AutoInstallDuringOSUpgrade && !opt.AutoInstallOnApplicableSystems),
		"isDisclosureRestricted":        opt.IsDisclosureRestricted,
		"publishToWindows10s":           opt.PublishToWindows10s,
	}

	if opt.AutoInstallDuringOSUpgrade || opt.AutoInstallOnApplicableSystems {
		publishing["additionalInfoForMsApproval"] = map[string]any{
			"microsoftContact":        opt.MsContact,
			"validationsPerformed":    opt.ValidationsPerformed,
			"affectedOems":            opt.AffectedOems,
			"isRebootRequired":        opt.IsRebootRequired,
			"isCoEngineered":          opt.IsCoEngineered,
			"isForUnreleasedHardware": opt.IsForUnreleasedHardware,
			"hasUiSoftware":           opt.HasUiSoftware,
			"businessJustification":   opt.BusinessJustification,
		}
	}

	hwids := make([]any, 0, len(targets))
	for _, t := range targets {
		hwids = append(hwids, map[string]any{
			"bundleId":            t.BundleID,
			"infId":               t.InfID,
			"operatingSystemCode": t.OSCode,
			"pnpString":           t.PnpID,
		})
	}

	chidArr := make([]any, 0, len(chids))
	for _, c := range chids {
		chidArr = append(chidArr, map[string]any{
			"chid":              c,
			"distributionState": "pendingAdd",
		})
	}

	return map[string]any{
		"publishingSpecifications": publishing,
		"targeting": map[string]any{
			"hardwareIds": hwids,
			"chids":       chidArr,
		},
		"name":        name,
		"destination": opt.Destination,
	}, nil
}
