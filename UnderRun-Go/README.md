# UnderRun-Go

*English | [中文](#中文)*

## English

### Overview
**UnderRun-Go** is a Wails-based desktop application (Go backend + Frontend) designed specifically for Windows to monitor audio/system pipe underrun events. It continuously observes specific Windows Registry keys for changes in underrun counts and provides real-time alerts, visual indicators, and a system tray presence.

### Features
- **Real-time Monitoring:** Continuously polls specific Windows Registry paths (`SYSTEM\ControlSet001\Control\Class\{...}`) to track `UnderRunCountPipeA` through `UnderRunCountPipeD`.
- **Alert System:** When an underrun count increases, the application triggers a real-time event, unminimizes the window (brings it to the front), and alerts the user (with sound and visual indicators handled by the frontend).
- **System Tray Integration:** Runs seamlessly in the background with a system tray icon. Users can configure the app to minimize to the tray on close to maintain background monitoring without cluttering the taskbar.
- **Pipe Reset:** Provides a mechanism to reset the underrun counters back to zero. If standard permissions are insufficient, the application automatically requests elevated privileges (via a UAC prompt using PowerShell `runas`) to perform the registry modification safely.
- **Single Instance:** Enforces a single running instance of the application using a named mutex.

### Prerequisites
- Windows OS (Requires registry access).
- [Wails v2](https://wails.io/) (for building from source).
- Go 1.22+ and Node.js.

### Building
To build the application, navigate to the `UnderRun-Go` directory and run:
```bash
wails build -m
```

---

## 中文

### 简介
**UnderRun-Go** 是一个基于 Wails 框架开发的桌面应用程序（Go 后端 + 前端），专为 Windows 系统设计，用于监控音频/系统管道底度运行 (Underrun) 事件。它会持续观察特定的 Windows 注册表键值，追踪 underrun 计数的变化，并提供实时警报、视觉指示和系统托盘功能。

### 功能特点
- **实时监控:** 持续轮询特定的 Windows 注册表路径 (`SYSTEM\ControlSet001\Control\Class\{...}`)，以跟踪 `UnderRunCountPipeA` 到 `UnderRunCountPipeD` 的计数。
- **警报系统:** 当检测到 underrun 计数增加时，应用程序会触发实时事件，将窗口取消最小化并置顶，同时向用户发出警报（前端处理声音和视觉提示）。
- **系统托盘集成:** 在后台无缝运行并显示系统托盘图标。用户可以配置在关闭窗口时最小化到托盘，以保持后台监控而不占用任务栏空间。
- **计数器重置 (Pipe Reset):** 提供一种将 underrun 计数器重置为零的机制。如果当前权限不足，应用程序会自动请求提升权限（通过 PowerShell `runas` 触发 UAC 提示），以安全地执行注册表修改。
- **单实例运行:** 使用命名互斥锁强制应用程序只能运行一个实例。

### 环境要求
- Windows 操作系统（需要访问系统注册表）。
- [Wails v2](https://wails.io/)（用于从源码构建）。
- Go 1.22+ 和 Node.js。

### 构建项目
要构建此应用程序，请导航到 `UnderRun-Go` 目录并运行：
```bash
wails build -m
```
