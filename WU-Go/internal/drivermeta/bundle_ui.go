package drivermeta

type Color int

const (
	ColorCyan Color = iota
	ColorYellow
	ColorGreen
	ColorMagenta
	ColorBlue
	ColorWhite
	ColorDarkCyan
	ColorDarkYellow
	ColorDarkGreen
	ColorDarkMagenta
)

type BundleLegend struct {
	BundleID   string
	Tag        string
	Color      Color
	ItemCount  int
	SampleInfs []string
}

type BundleUIMapping struct {
	BundleColorByID map[string]Color
	BundleTagByID   map[string]string
	Legends         []BundleLegend
}
