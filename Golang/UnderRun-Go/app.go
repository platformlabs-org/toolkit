package main

import (
	"context"
	"sync/atomic"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"UnderRun/pkg/settings"
	"UnderRun/services"
)

type App struct {
	ctx context.Context
	mon services.UnderrunMonitor

	running     atomic.Bool
	settings    settings.Settings
	isQuitting  bool
}

func NewApp() *App {
	return &App{
		mon: services.NewUnderrunMonitor(),
		settings: settings.NewSettings(),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// Apply initial settings
	runtime.WindowSetAlwaysOnTop(a.ctx, a.settings.AlwaysOnTop)

	// 注册回调
	a.mon.RegisterUpdateCallback(func(evt services.UREvent) {
		if a.ctx == nil {
			return
		}
		switch evt.Type {
		case "update":
			runtime.EventsEmit(a.ctx, "underrun:update", evt.Payload)
		case "change":
			// Alert is handled by frontend (sound)
			// Bring window to front
			runtime.WindowUnminimise(a.ctx)
			runtime.WindowShow(a.ctx)
			runtime.EventsEmit(a.ctx, "underrun:change", evt.Payload)
		case "error":
			runtime.EventsEmit(a.ctx, "underrun:error", evt.Payload)
		}
	})

	// ✅ 默认启动即开始监控
	if a.running.CompareAndSwap(false, true) {
		a.mon.Start()
	}
}

func (a *App) Shutdown() {
	a.mon.Stop()
}

func (a *App) Start() {
	if a.running.Swap(true) {
		return
	}
	a.mon.Start()
}

func (a *App) Stop() {
	if !a.running.Swap(false) {
		return
	}
	a.mon.Stop()
}

func (a *App) GetCurrentStatus() services.URSnapshot {
	return a.mon.GetCurrentStatus()
}

func (a *App) ResetPipe(pipe string) error {
	return a.mon.ResetPipe(pipe)
}

// Settings methods

func (a *App) GetSettings() settings.Settings {
	return a.settings
}

func (a *App) SetCloseToTray(enabled bool) {
	a.settings.CloseToTray = enabled
}

func (a *App) SetAlwaysOnTop(enabled bool) {
	a.settings.AlwaysOnTop = enabled
	if a.ctx != nil {
		runtime.WindowSetAlwaysOnTop(a.ctx, enabled)
	}
}

func (a *App) GetMonitoredPaths() []string {
	return a.mon.GetMonitoredPaths()
}
