# HlkxTool

*English | [中文](#中文)*

## English

### Overview
**HlkxTool** is a .NET Framework 4.8 command-line utility designed for parsing, modifying, and signing Windows Hardware Lab Kit (`.hlkx`) packages. It provides an automated way to interact with HLK packages, enabling tasks such as extracting metadata, injecting drivers into WHQL or DUA packages, and applying digital signatures.

### Features
- **Parse (`parse`):** Analyzes `.hlkx` packages and extracts signature status, device metadata categories, selected product types, and requested signatures, outputting the results as structured JSON.
- **WHQL Mode (`whql`):** Merges a driver folder into an existing `.hlkx` package and applies a digital signature to create a new, signed WHQL package.
- **DUA Mode (`dua`):** Replaces the driver in a Driver Update Acceptable (DUA) `.hlkx` package (or folder) and applies a digital signature.
- **Sign Only (`sign`):** Applies a digital signature directly to an existing `.hlkx` package.

### Prerequisites
- Windows OS
- .NET Framework 4.8
- Appropriate certificates/tools for digital signing (if using `whql`, `dua`, or `sign` commands).

### Usage

**Parse an HLKX file (Outputs JSON):**
```cmd
HlkxTool parse --hlkx <file_path.hlkx> [--verify]
```
*(The `--verify` flag attempts to verify the digital signatures within the package).*

**Merge and sign a WHQL package:**
```cmd
HlkxTool whql --package <package_folder> --driver <driver_folder> --out <output_file.hlkx>
```

**Replace driver and sign a DUA package:**
```cmd
HlkxTool dua --package <package_file_or_folder> --driver <driver_folder> --out <output_file.hlkx>
```

**Sign an existing HLKX package:**
```cmd
HlkxTool sign --package <package_file.hlkx> --out <output_file.hlkx>
```

### Exit Codes
- `0`: Success (`Ok`)
- `2`: Invalid Arguments (`BadArguments`)
- `3`: File Not Found (`FileNotFound`)
- `10`: Not Signed (`NotSigned`)
- `11`: Signature Verification Failed (`SignatureVerifyFailed`)
- `20`: Package Info Missing (`PackageInfoMissing`)
- `50`: Package Operation Failed (`PackageOpFailed`)
- `99`: Unhandled Exception (`Unhandled`)

---

## 中文

### 简介
**HlkxTool** 是一个基于 .NET Framework 4.8 的命令行实用工具，专为解析、修改和签名 Windows 硬件实验室套件 (`.hlkx`) 封包而设计。它提供了一种自动化的方式来处理 HLK 封包，支持提取元数据、将驱动程序注入 WHQL 或 DUA 封包以及应用数字签名等任务。

### 功能特点
- **解析 (`parse`):** 分析 `.hlkx` 封包并提取签名状态、设备元数据类别、选择的产品类型以及请求的签名，并将结果输出为结构化的 JSON 格式。
- **WHQL 模式 (`whql`):** 将驱动程序文件夹合并到现有的 `.hlkx` 封包中并应用数字签名，以创建一个新的已签名 WHQL 封包。
- **DUA 模式 (`dua`):** 替换 DUA (Driver Update Acceptable) `.hlkx` 封包（或文件夹）中的驱动程序并应用数字签名。
- **仅签名 (`sign`):** 直接为现有的 `.hlkx` 封包应用数字签名。

### 环境要求
- Windows 操作系统
- .NET Framework 4.8
- 适用于数字签名的证书/工具（如果使用 `whql`, `dua`, 或 `sign` 命令）。

### 使用说明

**解析 HLKX 文件（输出 JSON）:**
```cmd
HlkxTool parse --hlkx <文件路径.hlkx> [--verify]
```
*(`--verify` 标志会尝试验证封包内的数字签名)。*

**合并并签名 WHQL 封包:**
```cmd
HlkxTool whql --package <封包文件夹> --driver <驱动文件夹> --out <输出文件.hlkx>
```

**替换驱动并签名 DUA 封包:**
```cmd
HlkxTool dua --package <封包文件或文件夹> --driver <驱动文件夹> --out <输出文件.hlkx>
```

**对现有 HLKX 封包进行签名:**
```cmd
HlkxTool sign --package <封包文件.hlkx> --out <输出文件.hlkx>
```

### 退出代码说明
- `0`: 成功 (`Ok`)
- `2`: 参数错误 (`BadArguments`)
- `3`: 找不到文件 (`FileNotFound`)
- `10`: 未签名 (`NotSigned`)
- `11`: 签名验证失败 (`SignatureVerifyFailed`)
- `20`: 缺失封包信息 (`PackageInfoMissing`)
- `50`: 封包操作失败 (`PackageOpFailed`)
- `99`: 未处理异常 (`Unhandled`)
