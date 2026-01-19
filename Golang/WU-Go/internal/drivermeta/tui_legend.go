package drivermeta

import "WU/internal/tui"

func ToTUILegends(legends []BundleLegend) []tui.Legend {
	out := make([]tui.Legend, 0, len(legends))
	for _, l := range legends {
		out = append(out, tui.Legend{
			Tag:        l.Tag,
			Color:      tui.Color(l.Color),
			ItemCount:  l.ItemCount,
			SampleInfs: l.SampleInfs,
		})
	}
	return out
}
