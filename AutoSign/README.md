# AutoSign

自动识别Token密码弹出框并自动输入密码的自动系统。

## 概述

AutoSign 系统由 **服务端（Service）+ 桌面代理（Agent）** 两个组件组成，用于在 Windows 桌面环境中自动处理密码弹出框。

### 1. AutoSignService（Windows 服务）

* 运行于 **Session 0**（后台）
* 以 **LocalSystem** 权限运行
* 持续监控并确保 Agent 在用户桌面 Session 内运行
* 使用以下 Win32 API 将 Agent 启动到用户桌面：

  * `WTSGetActiveConsoleSessionId`
  * `WTSQueryUserToken`
  * `CreateProcessAsUser`
* 当 Agent 意外挂掉时，服务会自动重新启动它
* 日志写入 **Windows 事件日志（Application）**

### 2. AutoSignAgent（控制台程序）

* 运行在 **交互式用户桌面 Session**
* 使用 Win32 API 持续扫描桌面窗口：

  * 标题：**"Token Logon"**
  * 类名：**"#32770"**
* 自动向密码框发送密码并模拟回车按键
* 密码从以下文件读取（命令行参数优先）：

  ```
  C:\ops\secrets\token.pin
  ```
* 日志直接打印在控制台（若通过服务启动，则可写入文件）

服务托管 Agent，实现：

* 服务级可靠性（Agent 自动拉起）
* 桌面级 UI 操作能力
* 统一部署与升级方式

---

## 目录结构（C:\ops 布局）

```
C:\ops\
│
├── AutoSign\               （本工具安装目录）
│   ├── AutoSign.exe        （Agent）
│   ├── AutoSignService.exe （Windows 服务）
│   └── install.cmd         （安装/卸载脚本，支持 /install /uninstall 非交互模式）
│
└── secrets\
    └── token.pin           （eToken PIN，仅 Administrator/SYSTEM 可读）
```

安装源（编译产物）可以是任意目录：本仓库 `AutoSign\bin\Release\`、
`AutoSignService\bin\Release\` 与 `install.cmd` 放在一起即可。

---

## 安装方式

1. 将 `AutoSign.exe`、`AutoSignService.exe`、`install.cmd` 放到同一目录；

2. 以管理员身份运行：

```
install.cmd            （交互模式）
install.cmd /install   （非交互：复制文件 + 创建并启动服务）
install.cmd /uninstall （非交互：停止并删除服务 + 删除 C:\ops\AutoSign）
install.cmd /install   （服务已存在时 = 升级：刷新文件并重启服务）
```

3. 确保 PIN 文件已就位：`C:\ops\secrets\token.pin`（Agent 自动读取）。

---

## 卸载方式

再次运行：

```
install.cmd
```

脚本会检测到服务已经存在，然后提示：

* 是否停止并删除服务
* 是否删除整个 `C:\AutoSign` 安装目录

---

## 运行机制

### AutoSignService.exe

* 后台服务，持续运行
* 每隔 5 秒检查一次 Agent 是否存在
* 如果 Agent 未运行：
  → 在当前活动用户 Session 中启动 `AutoSign.exe`
* 日志写到 **事件查看器 → Application**

### AutoSign.exe（Agent）

* 在桌面 Session 内运行，可访问 UI
* 每秒扫描窗口是否出现 “Token Logon”
* 匹配到窗口即自动输入密码
* 日志直接输出到控制台

---

## 系统要求

* Windows 10 / Windows 11 / Windows Server 2016 及以上
* 服务需以 **LocalSystem** 账号运行
* 目标机必须存在交互用户会话（例如已登录的桌面或 RDP）
* PIN 文件路径有效：

```
C:\ops\secrets\token.pin
```
