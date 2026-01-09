package drivermeta

import (
	"sort"
	"strings"

	"WU/internal/format"
	"WU/internal/support"
	"WU/internal/tui"
)

type ParseResult struct {
	Targets []HardwareTarget
	UI      BundleUIMapping
}

func Parse(metaRoot map[string]any) (*ParseResult, error) {
	bundleInfoMap, ok := metaRoot["BundleInfoMap"].(map[string]any)
	if !ok || bundleInfoMap == nil {
		return nil, support.NewAPIError("driverMetadata 缺少 BundleInfoMap（结构不符合示例）")
	}

	bundleIDs := make([]string, 0, len(bundleInfoMap))
	for k := range bundleInfoMap {
		bundleIDs = append(bundleIDs, k)
	}
	sort.Slice(bundleIDs, func(i, j int) bool {
		return strings.ToLower(bundleIDs[i]) < strings.ToLower(bundleIDs[j])
	})

	palette := []Color{
		ColorCyan, ColorYellow, ColorGreen, ColorMagenta, ColorBlue,
		ColorWhite, ColorDarkCyan, ColorDarkYellow, ColorDarkGreen, ColorDarkMagenta,
	}

	ui := BundleUIMapping{
		BundleColorByID: map[string]Color{},
		BundleTagByID:   map[string]string{},
		Legends:         []BundleLegend{},
	}

	for i, id := range bundleIDs {
		ui.BundleTagByID[id] = "B" + support.Itoa(i+1)
		ui.BundleColorByID[id] = palette[i%len(palette)]
	}

	all := make([]HardwareTarget, 0, 512)
	seen := map[string]bool{}

	infSetByBundle := map[string]map[string]bool{}
	countByBundle := map[string]int{}

	for bundleID, bundleVal := range bundleInfoMap {
		bundleTag := ui.BundleTagByID[bundleID]
		bundleObj, _ := bundleVal.(map[string]any)
		if bundleObj == nil {
			continue
		}

		infInfoMap, _ := bundleObj["InfInfoMap"].(map[string]any)
		if infInfoMap == nil {
			continue
		}

		if _, ok := infSetByBundle[bundleID]; !ok {
			infSetByBundle[bundleID] = map[string]bool{}
		}

		for infID, infVal := range infInfoMap {
			infSetByBundle[bundleID][infID] = true

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
						BundleID: bundleID,
						BundleTag: bundleTag,
						InfID: infID,
						OSCode: osCode,
						PnpID: pnpID,
						Manufacturer: manufacturer,
						DeviceDescription: deviceDesc,
					})
					countByBundle[bundleID]++
				}
			}
		}
	}

	for _, bundleID := range bundleIDs {
		cnt := countByBundle[bundleID]
		tag := ui.BundleTagByID[bundleID]
		color := ui.BundleColorByID[bundleID]

		var sample []string
		if set := infSetByBundle[bundleID]; set != nil {
			tmp := make([]string, 0, len(set))
			for inf := range set {
				tmp = append(tmp, inf)
			}
			sort.Slice(tmp, func(i, j int) bool { return strings.ToLower(tmp[i]) < strings.ToLower(tmp[j]) })
			if len(tmp) > 3 {
				tmp = tmp[:3]
			}
			sample = tmp
		}

		ui.Legends = append(ui.Legends, BundleLegend{
			BundleID: bundleID,
			Tag: tag,
			Color: color,
			ItemCount: cnt,
			SampleInfs: sample,
		})
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

	return &ParseResult{Targets: all, UI: ui}, nil
}

func BuildListItems(items []HardwareTarget, ui BundleUIMapping) []tui.ListItem {
	width := format.ConsoleWidthBestEffort(80)

	infW, osW, pnpW := 28, 28, 28
	minInf, minOs, minPnp := 16, 18, 18

	contentBudget := width - 20
	need := (3 + 1 + infW + 3 + osW + 3 + pnpW + 3 + 10)
	if contentBudget < need {
		reduce := need - contentBudget
		for reduce > 0 && (infW > minInf || osW > minOs || pnpW > minPnp) {
			if pnpW > minPnp { pnpW--; reduce--; if reduce == 0 { break } }
			if osW > minOs { osW--; reduce--; if reduce == 0 { break } }
			if infW > minInf { infW--; reduce--; if reduce == 0 { break } }
		}
	}

	out := make([]tui.ListItem, 0, len(items))
	for _, c := range items {
		color := ui.BundleColorByID[c.BundleID]
		b := support.PadRight(support.Or(c.BundleTag, ""), 3)
		inf := format.Fit(c.InfID, infW)
		os := format.Fit(c.OSCode, osW)
		pnp := format.Fit(c.PnpID, pnpW)

		extraParts := []string{}
		if !support.IsBlank(c.Manufacturer) {
			extraParts = append(extraParts, strings.TrimSpace(c.Manufacturer))
		}
		if !support.IsBlank(c.DeviceDescription) {
			extraParts = append(extraParts, strings.TrimSpace(c.DeviceDescription))
		}
		extra := ""
		if len(extraParts) > 0 {
			extra = strings.Join(extraParts, " | ")
		}

		text := ""
		if support.IsBlank(extra) {
			text = b + " " + inf + " | " + os + " | " + pnp
		} else {
			text = b + " " + inf + " | " + os + " | " + pnp + " | " + extra
		}

		out = append(out, tui.ListItem{
			Text:  text,
			Color: tui.Color(color),
		})
	}
	return out
}
