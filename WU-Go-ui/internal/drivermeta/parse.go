package drivermeta

import (
	"sort"
	"strings"

	"WU-Go-ui/internal/support"
)

type ParseResult struct {
	Targets []HardwareTarget `json:"targets"`
}

func Parse(metaRoot map[string]any) (*ParseResult, error) {
	bundleInfoMap, ok := metaRoot["BundleInfoMap"].(map[string]any)
	if !ok || bundleInfoMap == nil {
		return nil, support.NewAPIError("driverMetadata missing BundleInfoMap")
	}

	bundleIDs := make([]string, 0, len(bundleInfoMap))
	for k := range bundleInfoMap {
		bundleIDs = append(bundleIDs, k)
	}
	sort.Slice(bundleIDs, func(i, j int) bool {
		return strings.ToLower(bundleIDs[i]) < strings.ToLower(bundleIDs[j])
	})

	bundleTagByID := map[string]string{}
	for i, id := range bundleIDs {
		bundleTagByID[id] = "B" + support.Itoa(i+1)
	}

	all := make([]HardwareTarget, 0, 512)
	seen := map[string]bool{}

	for bundleID, bundleVal := range bundleInfoMap {
		bundleTag := bundleTagByID[bundleID]
		bundleObj, _ := bundleVal.(map[string]any)
		if bundleObj == nil {
			continue
		}

		infInfoMap, _ := bundleObj["InfInfoMap"].(map[string]any)
		if infInfoMap == nil {
			continue
		}

		for infID, infVal := range infInfoMap {
			infObj, _ := infVal.(map[string]any)
			if infObj == nil {
				continue
			}

			osPnpInfoMap, _ := infObj["OSPnPInfoMap"].(map[string]any)
			if osPnpInfoMap == nil {
				continue
			}

			for osCode, osVal := range osPnpInfoMap {
				pnpDict, _ := osVal.(map[string]any)
				if pnpDict == nil {
					continue
				}

				for pnpID, pnpVal := range pnpDict {
					var manufacturer, deviceDesc string
					if detail, _ := pnpVal.(map[string]any); detail != nil {
						manufacturer, _ = detail["Manufacturer"].(string)
						deviceDesc, _ = detail["DeviceDescription"].(string)
					}

					dedupeKey := bundleID + "|" + infID + "|" + osCode + "|" + pnpID
					if seen[dedupeKey] {
						continue
					}
					seen[dedupeKey] = true

					all = append(all, HardwareTarget{
						BundleID:          bundleID,
						BundleTag:         bundleTag,
						InfID:             infID,
						OSCode:            osCode,
						PnpID:             pnpID,
						Manufacturer:      manufacturer,
						DeviceDescription: deviceDesc,
					})
				}
			}
		}
	}

	sort.Slice(all, func(i, j int) bool {
		a, b := all[i], all[j]
		if strings.ToLower(a.BundleTag) != strings.ToLower(b.BundleTag) {
			return strings.ToLower(a.BundleTag) < strings.ToLower(b.BundleTag)
		}
		if strings.ToLower(a.InfID) != strings.ToLower(b.InfID) {
			return strings.ToLower(a.InfID) < strings.ToLower(b.InfID)
		}
		if strings.ToLower(a.OSCode) != strings.ToLower(b.OSCode) {
			return strings.ToLower(a.OSCode) < strings.ToLower(b.OSCode)
		}
		return strings.ToLower(a.PnpID) < strings.ToLower(b.PnpID)
	})

	return &ParseResult{Targets: all}, nil
}
