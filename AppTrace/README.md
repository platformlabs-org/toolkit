# AppTrace

*English | [中文](#中文)*

## English

### Overview
**AppTrace** is a tool designed to measure application cold start times across system reboots. It consists of a .NET Framework 4.8 console application (`AppTrace.exe`) that continuously tracks window creation, destruction, and title changes, alongside a batch script (`run.cmd`) that automates application testing through a reboot loop using the Windows Registry `RunOnce` key.

### Project Structure
- `AppTrace.exe`: The core console application that monitors a specified process and logs window events (ADD, DEL, CHG) to the console and a CSV file. It runs indefinitely until interrupted (Ctrl+C).
- `run.cmd`: A batch script that orchestrates the automated reboot testing workflow. It reads target applications from `AppList.txt`, executes them using `AppTrace.exe`, and schedules the next reboot.
- `AppList.txt` *(Expected)*: A text file containing a list of application commands or paths to be tested line by line.

### Features
- **Window Event Monitoring:** Tracks when an application's windows are created, closed, or when their titles change.
- **CSV Logging:** Generates a structured CSV file containing detailed timestamps, elapsed time, PIDs, window handles (HWND), and titles.
- **Automated Reboot Loop:** Automatically configures power settings (disables sleep/hibernate), sets up `RunOnce` registry keys, and reboots the PC to test the next application in the list.
- **Hardware Integration:** Integrates with an external `AutoCharge.exe` tool to manage DC battery state during tests.

### Prerequisites
- Windows OS
- .NET Framework 4.8
- Appropriate permissions to modify registry keys (`HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce`) and power configurations (`powercfg`).

### Usage

#### 1. Standalone Usage (`AppTrace.exe`)
You can use the console application directly to monitor any process:
```cmd
:: Monitor notepad and log to events.csv
AppTrace.exe --app="notepad" --csv="events.csv"

:: Monitor a specific path
AppTrace.exe --app="C:\Windows\System32\notepad.exe" --csv

:: Monitor with a custom polling interval (e.g., 200ms)
AppTrace.exe "notepad" --csv --poll=200ms
```
*Note: The program runs indefinitely. Press `Ctrl+C` to stop monitoring and save the final `RUN_END` event to the CSV.*

#### 2. Automated Reboot Testing (`run.cmd`)
To use the automated reboot loop:
1. Place all necessary files (`AppTrace.exe`, `run.cmd`, `AppList.txt`) in the specific directory: `%USERPROFILE%\Desktop\AppTrace`.
2. Populate `AppList.txt` with the applications you want to test (one per line).
3. Execute `run.cmd`.
4. The script will initialize the counter (`Count.txt`), set the `RunOnce` registry key, and reboot the PC.
5. After each reboot, it will read the next line from `AppList.txt`, run it with `AppTrace.exe`, wait, kill the process, and reboot again until the list is exhausted.

### Notes & Hardcoded Dependencies
The `run.cmd` script contains specific hardcoded paths and network dependencies that must be adapted if used outside the original environment:
- **Base Directory:** The script expects to run from `%USERPROFILE%\Desktop\AppTrace`.
- **Network Tool:** It relies on `\\VM-SERVER\lnvpe-share\TOOL\AutoCharge.exe` for battery management.
- **Process Termination:** It explicitly kills specific processes (`EXCEL.EXE`, `POWERPNT.EXE`, `ML_Scenario.exe`) after testing.

---

## 中文

### 简介
**AppTrace** 是一个用于测量应用程序在系统重启后冷启动时间的工具。它包含一个 .NET Framework 4.8 控制台应用程序（`AppTrace.exe`），用于持续跟踪窗口的创建、销毁和标题更改；以及一个批处理脚本（`run.cmd`），通过 Windows 注册表的 `RunOnce` 键实现重启循环，从而自动化应用程序测试流程。

### 项目结构
- `AppTrace.exe`: 核心控制台应用程序，监控指定的进程并将窗口事件（ADD, DEL, CHG）记录到控制台和 CSV 文件中。它会无限期运行，直到被手动中断（Ctrl+C）。
- `run.cmd`: 协调自动化重启测试工作流的批处理脚本。它从 `AppList.txt` 中读取目标应用程序，使用 `AppTrace.exe` 执行它们，并安排下一次重启。
- `AppList.txt` *（需手动创建）*: 包含要测试的应用程序命令或路径的文本文件（每行一个）。

### 功能特点
- **窗口事件监控:** 跟踪应用程序窗口的创建、关闭或标题更改。
- **CSV 日志记录:** 生成结构化的 CSV 文件，包含详细的时间戳、耗时、PID、窗口句柄（HWND）和标题信息。
- **自动化重启循环:** 自动配置电源设置（禁用睡眠/休眠），设置 `RunOnce` 注册表键，并重启电脑以测试列表中的下一个应用程序。
- **硬件集成:** 集成了外部的 `AutoCharge.exe` 工具，用于在测试期间管理直流电池状态。

### 环境要求
- Windows 操作系统
- .NET Framework 4.8
- 修改注册表键（`HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce`）和电源配置（`powercfg`）的相应权限。

### 使用说明

#### 1. 独立使用 (`AppTrace.exe`)
您可以直接使用该控制台应用程序来监控任何进程：
```cmd
:: 监控 notepad 并记录到 events.csv
AppTrace.exe --app="notepad" --csv="events.csv"

:: 监控指定路径的程序
AppTrace.exe --app="C:\Windows\System32\notepad.exe" --csv

:: 自定义轮询间隔（例如 200ms）
AppTrace.exe "notepad" --csv --poll=200ms
```
*注意：程序会无限期运行。按 `Ctrl+C` 停止监控并将最终的 `RUN_END` 事件保存到 CSV 文件中。*

#### 2. 自动化重启测试 (`run.cmd`)
要使用自动化重启循环：
1. 将所有必要文件（`AppTrace.exe`, `run.cmd`, `AppList.txt`）放置在指定目录：`%USERPROFILE%\Desktop\AppTrace`。
2. 在 `AppList.txt` 中填入您想要测试的应用程序（每行一个）。
3. 执行 `run.cmd`。
4. 脚本将初始化计数器（`Count.txt`），设置 `RunOnce` 注册表键，并重启电脑。
5. 每次重启后，它会从 `AppList.txt` 中读取下一行，使用 `AppTrace.exe` 运行它，等待，终止进程，并再次重启，直到列表测试完毕。

### 注意事项与硬编码路径
`run.cmd` 脚本包含特定的硬编码路径和网络依赖项，如果在原始环境之外使用，必须进行相应调整：
- **基础目录:** 脚本预期在 `%USERPROFILE%\Desktop\AppTrace` 目录下运行。
- **网络工具:** 依赖于 `\\VM-SERVER\lnvpe-share\TOOL\AutoCharge.exe` 进行电池状态管理。
- **进程终止:** 测试后显式终止特定进程（例如 `EXCEL.EXE`, `POWERPNT.EXE`, `ML_Scenario.exe`）。
