# wu-cli

*English | [中文](#中文)*

## English

### Overview
**wu-cli** is a Command-Line Interface (CLI) npm package written in TypeScript (Node.js ≥ 18) designed to interact with the Microsoft Hardware Dev Center API. It streamlines the process of generating Windows Update (WU) Shipping Labels for driver submissions, providing an interactive, step-by-step workflow with a visual aesthetic inspired by Cloudflare Wrangler. It is a TypeScript rewrite of [WU-Go](../WU-Go).

### Features
- **Subcommand structure:** `wu` with no arguments opens an interactive command menu; `wu submit` runs the shipping-label workflow. New features are added as new subcommands. Includes global `--help`/`--version` and per-command `wu <command> --help`.
- **Interactive Workflow:** `wu submit` guides users through an intuitive sequence: Authentication → Product/Submission ID selection → Fetching Driver Metadata → Filtering → Creating the Shipping Label.
- **Hardware Dev Center Integration:** Communicates with Microsoft APIs to validate submissions, list OS types, fetch driver details (Bundle ID, Submission ID), and create the final shipping label.
- **CHID & OS Filtering:** Supports precise targeting of driver updates via Computer Hardware IDs (CHIDs) and OS-level flags.
- **TUI/UX:** Uses `@clack/prompts` and `picocolors` to provide clear, color-coded terminal output with interactive multi-select and spinner feedback.
- **Encrypted Credentials:** API credentials are stored AES-256-GCM encrypted and machine-bound in `~/.wu/credential.enc`.
- **Flexible Options:** Supports a full set of command-line flags for both interactive and scripted/CI execution.

### Prerequisites
- Node.js 18+
- Microsoft Hardware Dev Center credentials (Tenant ID, Client ID, Client Secret).

### Install
```bash
npm install -g wu-cli
# or run without installing
npx wu-cli
```

### Config & Credentials

**Business defaults** are stored in `~/.wu/config.json` and are created automatically on first run with the following built-in defaults:

| Key | Default |
|-----|---------|
| `msContact` | `feizh@microsoft.com` |
| `validationsPerformed` | `Product assurance team full range tested` |
| `affectedOems` | `["N/A"]` |
| `businessJustification` | `to meet MDA requirements` |
| `destination` | `windowsUpdate` |
| `goLiveImmediate` | `true` |
| `autoInstallDuringOSUpgrade` | `true` |
| `autoInstallOnApplicableSystems` | `true` |
| `isDisclosureRestricted` | `false` |
| `publishToWindows10s` | `false` |
| `isRebootRequired` | `false` |
| `isCoEngineered` | `false` |
| `isForUnreleasedHardware` | `false` |
| `hasUiSoftware` | `false` |
| `visibleToAccounts` | `[]` |

**Credentials** (Tenant ID, Client ID, Client Secret) are stored encrypted (AES-256-GCM, machine-bound key) in `~/.wu/credential.enc`.

**Precedence:** CLI flags > config file. There are no environment variable overrides.

### Commands

`wu` is organized into subcommands. Running `wu` with no command opens an interactive menu to pick one.

| Command | Description |
|---------|-------------|
| `submit` | Create a Windows Update shipping label for a driver submission |

Global options: `-h, --help` (list commands), `-v, --version`. Run `wu <command> --help` for a command's flags. If no command is given in a non-interactive context (pipe/CI), `wu` prints help and exits with code 2.

### Usage
```bash
# Pick a command from an interactive menu
wu

# Run the submit workflow interactively
wu submit

# Scripted / CI mode
wu submit --dry-run --chids 12345678-1234-1234-1234-123456789abc --publish-to-windows10s

# Help & version
wu --help
wu submit --help
wu --version
```

### `wu submit` options

These flags apply to the `submit` command (e.g. `wu submit --dry-run`).

#### Boolean flags
| Flag | Description |
|------|-------------|
| `--select-all` | Auto-select all available bundle entries (skip interactive UI) |
| `--dry-run` | Build the shipping label payload and write it to `--out` without submitting |
| `--schedule-go-live` | Schedule go-live instead of going live immediately |
| `--auto-install-os-upgrade` | Override config: enable auto-install during OS upgrade |
| `--no-auto-install-os-upgrade` | Override config: disable auto-install during OS upgrade |
| `--auto-install-applicable` | Override config: enable auto-install on applicable systems |
| `--no-auto-install-applicable` | Override config: disable auto-install on applicable systems |
| `--is-disclosure-restricted` | Mark the label as disclosure-restricted |
| `--publish-to-windows10s` | Publish to Windows 10 S |
| `--is-reboot-required` | Indicate a reboot is required after install |
| `--is-co-engineered` | Mark the driver as co-engineered |
| `--is-for-unreleased-hardware` | Mark the driver as targeting unreleased hardware |
| `--has-ui-software` | Indicate the package includes UI software |
| `--no-ui` | Skip the interactive TUI and use defaults / flags only |
| `--no-filter` | Disable the offer-filter step |

#### Value flags (single value)
| Flag | Description |
|------|-------------|
| `--tenant-id <id>` | Azure AD Tenant ID (overrides stored credential) |
| `--client-id <id>` | Azure AD Client ID (overrides stored credential) |
| `--client-secret <secret>` | Azure AD Client Secret (overrides stored credential) |
| `--product-id <id>` | Hardware Dev Center Product ID |
| `--submission-id <id>` | Hardware Dev Center Submission ID |
| `--name <label-name>` | Shipping label name |
| `--destination <dest>` | Shipping destination (default: `windowsUpdate`) |
| `--out <path>` | Output path for the dry-run JSON payload (default: `shippinglabel.request.json`) |
| `--go-live-date <date>` | Scheduled go-live date (implies `--schedule-go-live`) |
| `--ms-contact <email>` | Microsoft contact email |
| `--validations-performed <text>` | Description of validations performed |
| `--business-justification <text>` | Business justification for the label |

#### Multi-value flags (space-separated, repeatable)
| Flag | Description |
|------|-------------|
| `--visible-to-accounts <id...>` | Restrict visibility to these account IDs (integers) |
| `--affected-oems <name...>` | List of affected OEM names |
| `--chids <guid...>` | Computer Hardware IDs to target |

---

## 中文

### 简介
**wu-cli** 是一个使用 TypeScript（Node.js ≥ 18）编写的命令行界面（CLI）npm 包，旨在与 Microsoft Hardware Dev Center API 进行交互。它简化了为驱动程序提交生成 Windows Update（WU）Shipping Labels（发布标签）的流程，提供了一个交互式的逐步工作流，视觉风格受到 Cloudflare Wrangler 的启发。本项目是 [WU-Go](../WU-Go) 的 TypeScript 重写版本。

### 功能特点
- **子命令结构：** 直接运行 `wu`（无参数）会打开交互式命令菜单；`wu submit` 运行发布标签工作流。新功能以新子命令的形式扩展。内置全局 `--help`/`--version` 以及每个子命令的 `wu <命令> --help`。
- **交互式工作流：** `wu submit` 引导用户完成直观的操作序列：身份验证 → 选择 Product/Submission ID → 获取驱动元数据 → 筛选 → 创建 Shipping Label。
- **Hardware Dev Center 集成：** 与 Microsoft API 通信以验证提交内容、列出支持的操作系统类型、获取驱动详细信息（Bundle ID、Submission ID），并最终创建发布标签。
- **CHID 与操作系统过滤：** 支持通过 Computer Hardware IDs（CHID）和操作系统级别标志精准定位驱动更新受众。
- **终端用户体验（TUI/UX）：** 使用 `@clack/prompts` 和 `picocolors` 提供清晰、带颜色的终端输出，支持交互式多选和进度指示器。
- **加密凭据：** API 凭据使用 AES-256-GCM 加密，并以机器绑定的密钥存储于 `~/.wu/credential.enc`。
- **灵活的选项：** 支持完整的命令行标志集，可用于交互式或脚本化/CI 执行场景。

### 环境要求
- Node.js 18+
- Microsoft Hardware Dev Center 凭据（Tenant ID、Client ID、Client Secret）。

### 安装
```bash
npm install -g wu-cli
# 或无需安装直接运行
npx wu-cli
```

### 配置与凭据

**业务默认值**存储在 `~/.wu/config.json` 中，首次运行时自动创建，内置默认值如下：

| 键名 | 默认值 |
|------|--------|
| `msContact` | `feizh@microsoft.com` |
| `validationsPerformed` | `Product assurance team full range tested` |
| `affectedOems` | `["N/A"]` |
| `businessJustification` | `to meet MDA requirements` |
| `destination` | `windowsUpdate` |
| `goLiveImmediate` | `true` |
| `autoInstallDuringOSUpgrade` | `true` |
| `autoInstallOnApplicableSystems` | `true` |
| `isDisclosureRestricted` | `false` |
| `publishToWindows10s` | `false` |
| `isRebootRequired` | `false` |
| `isCoEngineered` | `false` |
| `isForUnreleasedHardware` | `false` |
| `hasUiSoftware` | `false` |
| `visibleToAccounts` | `[]` |

**凭据**（Tenant ID、Client ID、Client Secret）使用 AES-256-GCM 加密（机器绑定密钥）存储于 `~/.wu/credential.enc`。

**优先级：** 命令行标志 > 配置文件，不支持环境变量覆盖。

### 命令

`wu` 按子命令组织。不带命令直接运行 `wu` 会打开交互式菜单来选择一个子命令。

| 命令 | 说明 |
|------|------|
| `submit` | 为驱动提交创建 Windows Update 发布标签 |

全局选项：`-h, --help`（列出子命令）、`-v, --version`。运行 `wu <命令> --help` 查看该命令的标志。在非交互环境（管道/CI）下未提供命令时，`wu` 会打印帮助并以退出码 2 结束。

### 使用方法
```bash
# 从交互菜单选择子命令
wu

# 交互式运行 submit 工作流
wu submit

# 脚本化 / CI 模式
wu submit --dry-run --chids 12345678-1234-1234-1234-123456789abc --publish-to-windows10s

# 帮助与版本
wu --help
wu submit --help
wu --version
```

### `wu submit` 选项

以下标志适用于 `submit` 命令（例如 `wu submit --dry-run`）。

#### 布尔标志
| 标志 | 说明 |
|------|------|
| `--select-all` | 自动选中所有可用 bundle 条目（跳过交互界面） |
| `--dry-run` | 构建 Shipping Label 载荷并写入 `--out`，但不实际提交 |
| `--schedule-go-live` | 计划上线，而非立即生效 |
| `--auto-install-os-upgrade` | 覆盖配置：启用操作系统升级时自动安装 |
| `--no-auto-install-os-upgrade` | 覆盖配置：禁用操作系统升级时自动安装 |
| `--auto-install-applicable` | 覆盖配置：在适用系统上启用自动安装 |
| `--no-auto-install-applicable` | 覆盖配置：在适用系统上禁用自动安装 |
| `--is-disclosure-restricted` | 将标签标记为披露受限 |
| `--publish-to-windows10s` | 发布到 Windows 10 S |
| `--is-reboot-required` | 指示安装后需要重启 |
| `--is-co-engineered` | 将驱动标记为联合工程 |
| `--is-for-unreleased-hardware` | 将驱动标记为面向未发布硬件 |
| `--has-ui-software` | 指示软件包包含 UI 软件 |
| `--no-ui` | 跳过交互 TUI，仅使用默认值和命令行标志 |
| `--no-filter` | 禁用 offer 过滤步骤 |

#### 单值标志
| 标志 | 说明 |
|------|------|
| `--tenant-id <id>` | Azure AD Tenant ID（覆盖已存储的凭据） |
| `--client-id <id>` | Azure AD Client ID（覆盖已存储的凭据） |
| `--client-secret <secret>` | Azure AD Client Secret（覆盖已存储的凭据） |
| `--product-id <id>` | Hardware Dev Center 产品 ID |
| `--submission-id <id>` | Hardware Dev Center 提交 ID |
| `--name <label-name>` | Shipping Label 名称 |
| `--destination <dest>` | 发布目标（默认：`windowsUpdate`） |
| `--out <path>` | 演练模式 JSON 载荷的输出路径（默认：`shippinglabel.request.json`） |
| `--go-live-date <date>` | 计划上线日期（隐含 `--schedule-go-live`） |
| `--ms-contact <email>` | Microsoft 联系人邮箱 |
| `--validations-performed <text>` | 已执行验证的描述 |
| `--business-justification <text>` | 标签的业务合理性说明 |

#### 多值标志（空格分隔，可重复）
| 标志 | 说明 |
|------|------|
| `--visible-to-accounts <id...>` | 将可见性限制到指定账户 ID（整数） |
| `--affected-oems <name...>` | 受影响的 OEM 名称列表 |
| `--chids <guid...>` | 目标 Computer Hardware ID 列表 |
