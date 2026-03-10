# WU-Go

*English | [中文](#中文)*

## English

### Overview
**WU-Go** is a Command-Line Interface (CLI) tool written in Go (v1.22+) designed to interact with the Microsoft Hardware Dev Center API. It streamlines the process of generating Windows Update (WU) Shipping Labels for driver submissions, providing an interactive, step-by-step workflow with a visual aesthetic inspired by Cloudflare Wrangler.

### Features
- **Interactive Workflow:** The CLI guides users through an intuitive sequence: Authentication -> Product/Submission ID selection -> Fetching Driver Metadata -> Filtering -> Creating the Shipping Label.
- **Hardware Dev Center Integration:** Communicates with Microsoft APIs to validate submissions, list OS types, fetch driver details (Bundle ID, Submission ID), and create the final shipping label.
- **CHID & OS Filtering:** Enforces input order for Shipping Label names and Computer Hardware IDs (CHIDs), allowing precise targeting of driver updates.
- **TUI/UX:** Uses `github.com/briandowns/spinner` and `github.com/fatih/color` to provide clear, color-coded terminal output. Error messages maintain visual continuity within prompting loops by prefixing a vertical guide line (`│`).
- **Flexible Options:** Supports various command-line arguments (e.g., `--select-all`, `--dry-run`, `--schedule-go-live`, `--publish-to-windows10s`) for both interactive and scripted execution.

### Prerequisites
- Go 1.22+
- Microsoft Hardware Dev Center credentials/configuration.

### Usage / Build
To build the CLI tool:
```bash
go build -o wu ./main.go
# or
go build -o wu ./cmd/wu
```

Run the application:
```bash
./wu
# With options:
./wu --dry-run --chids 12345 --publish-to-windows10s
```

---

## 中文

### 简介
**WU-Go** 是一个使用 Go (v1.22+) 编写的命令行界面 (CLI) 工具，旨在与 Microsoft Hardware Dev Center API 进行交互。它简化了为驱动程序提交生成 Windows Update (WU) Shipping Labels（发布标签）的流程，提供了一个交互式的逐步工作流，其视觉美学受到 Cloudflare Wrangler 的启发。

### 功能特点
- **交互式工作流:** 该 CLI 引导用户完成直观的操作序列：身份验证 -> 选择 Product/Submission ID -> 获取驱动元数据 -> 筛选 -> 创建 Shipping Label。
- **Hardware Dev Center 集成:** 与 Microsoft API 通信以验证提交内容、列出支持的操作系统类型、获取驱动详细信息（Bundle ID, Submission ID），并最终创建发布标签。
- **CHID 与 操作系统过滤:** 强制要求先输入 Shipping Label 名称，再输入 CHID (Computer Hardware IDs)，从而允许精准定位驱动更新的受众。
- **终端用户体验 (TUI/UX):** 借助 `github.com/briandowns/spinner` 和 `github.com/fatih/color` 提供清晰、带颜色的终端输出。在提示循环中，错误消息前会添加垂直引导线 (`│`)，以保持视觉连贯性。
- **灵活的选项:** 支持各种命令行参数（如 `--select-all`, `--dry-run`, `--schedule-go-live`, `--publish-to-windows10s`），以满足交互式或脚本化执行需求。

### 环境要求
- Go 1.22+
- Microsoft Hardware Dev Center 的凭据/配置。

### 使用/构建说明
构建此 CLI 工具：
```bash
go build -o wu ./main.go
# 或
go build -o wu ./cmd/wu
```

运行应用程序：
```bash
./wu
# 附带参数：
./wu --dry-run --chids 12345 --publish-to-windows10s
```
