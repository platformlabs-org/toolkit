package tray

import (
	"context"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type TrayApp interface {
	Quit()
	Show()
}

func Setup(iconBytes []byte, onShow func(), onQuit func()) {
	systray.SetIcon(iconBytes)
	systray.SetTitle("UnderRun Monitor")
	systray.SetTooltip("UnderRun Monitor")

	systray.SetOnDClick(func(menu systray.IMenu) {
		onShow()
	})

	mShow := systray.AddMenuItem("Show", "Show the window")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit the application")

	mShow.Click(func() {
		onShow()
	})

	mQuit.Click(func() {
		onQuit()
	})
}

// Helper to standard Wails behavior
func DefaultOnShow(ctx context.Context) {
	if ctx != nil {
		runtime.WindowShow(ctx)
		runtime.WindowUnminimise(ctx)
	}
}

func DefaultOnQuit(ctx context.Context, setQuitting func()) {
	if ctx != nil {
		setQuitting()
		runtime.Quit(ctx)
	} else {
		systray.Quit()
	}
}
