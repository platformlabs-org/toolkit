package main

import (
	"context"
	"embed"
	stdruntime "runtime"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"UnderRun/pkg/singleinstance"
	"UnderRun/pkg/tray"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/windows/icon.ico
var iconBytes []byte

func main() {
	// Single Instance Check
	if singleinstance.CheckAndActivate("UnderRunMonitorMutex", "UnderRun Monitor") {
		return
	}

	app := NewApp()

	// System Tray logic in a goroutine
	go func() {
		stdruntime.LockOSThread()
		systray.Run(func() {
			tray.Setup(
				iconBytes,
				func() { go tray.DefaultOnShow(app.ctx) },
				func() {
					// Async quit handling to avoid blocking tray loop
					go tray.DefaultOnQuit(app.ctx, func() { app.isQuitting.Store(true) })
				},
			)
		}, func() {
			// Cleanup if needed
		})
	}()

	err := wails.Run(&options.App{
		Title:     "UnderRun Monitor",
		Width:     600,
		Height:    600,
		MinWidth:  520,
		MinHeight: 400,
		Frameless: true,
		Assets:    assets,
		OnStartup: func(ctx context.Context) { app.Startup(ctx) },
		OnShutdown: func(ctx context.Context) {
			app.Shutdown()
			systray.Quit()
		},
		OnBeforeClose: func(ctx context.Context) bool {
			if app.isQuitting.Load() {
				return false
			}
			if app.settings.CloseToTray {
				runtime.WindowHide(ctx)
				return true
			}
			return false
		},
		Bind: []interface{}{app},
		Windows: &windows.Options{},
	})
	if err != nil {
		panic(err)
	}
}
