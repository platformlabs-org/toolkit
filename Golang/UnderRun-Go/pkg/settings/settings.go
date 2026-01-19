package settings

type Settings struct {
	CloseToTray bool `json:"closeToTray"`
	AlwaysOnTop bool `json:"alwaysOnTop"`
}

func NewSettings() Settings {
	return Settings{
		CloseToTray: true,
		AlwaysOnTop: false,
	}
}
