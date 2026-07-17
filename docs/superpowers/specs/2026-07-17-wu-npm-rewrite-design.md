# WU-npm 设计文档：将 WU-Go 重构为 npm 包（wu-cli）

- 日期：2026-07-17
- 状态：已确认，待写实现计划
- 来源项目：`toolkit/WU-Go`（Go CLI，与 Microsoft Hardware Dev Center API 交互，生成 Windows Update Shipping Label）

## 1. 目标与范围

将 WU-Go 用 **TypeScript 完全重写**为一个 npm 包，功能与 Go 版 1:1 对齐，同时：

- 以 **CLI** 形式分发使用（`npx wu` / 全局安装后 `wu`），不导出编程库 API。
- 把 Go 版硬编码在源码里的业务默认值（个人邮箱、文案等）抽到**用户主目录的配置文件**，源码不再残留硬编码个人数据。
- 凭据（`tenantId`/`clientId`/`clientSecret`）合并到主目录并**加密存储**。

**非目标**：不导出可 import 的库；不做 Web/WASM；不改变 Microsoft API 的请求契约。

## 2. 落位与技术栈

- **目录**：`toolkit/WU-npm/`（新建，`WU-Go` 原封保留用于行为对照）。
- **包名 / 命令**：package name `wu-cli`，bin 命令 `wu`。
- **语言/模块**：TypeScript + **ESM**，目标 Node ≥ 18（`@clack/*` 要求，且可用原生 `fetch`，无需 axios/node-fetch）。
- **构建**：`tsup`（打包到 `dist/`，自动注入 shebang、bundle 依赖）。
- **测试**：`vitest`。
- **运行依赖**：`@clack/prompts`、`@clack/core`（自定义多选用）、`picocolors`。零原生依赖。

## 3. 目录结构（镜像 Go 的 internal 分层）

```
WU-npm/
  package.json  tsconfig.json  tsup.config.ts  vitest.config.ts
  README.md
  src/
    index.ts              # bin 入口：解析 argv → app.run()，设置 exit code
    cli/
      args.ts             # 参数解析器（复刻 ArgSet 多值 flag 逻辑）
      options.ts          # CLIOptions 类型 + 默认值装配（默认值来自 config）
    config/
      paths.ts            # ~/.wu 目录与文件路径解析
      store.ts            # config.json 业务默认值读写（明文）
      credentials.ts      # 凭据读写（调用 crypto）
      crypto.ts           # AES-256-GCM 机器绑定密钥加解密
    auth/token.ts         # acquireToken（fetch client_credentials）
    devcenter/
      client.ts           # 基础 URL + fetch 封装（超时 180s）
      submission.ts       # getSubmission / findDriverMetadataURL / printWorkflowStatus
      metadata.ts         # downloadDriverMetadata
      shippingLabel.ts    # createShippingLabel
    drivermeta/
      types.ts            # HardwareTarget / BundleLegend / BundleUIMapping / Color
      parse.ts            # BundleInfoMap → targets + legend + 配色
      listItems.ts        # 构建列表显示行（列宽自适应）
    shippinglabel/payload.ts   # 构建 POST body
    validate/chid.ts      # GUID 规范化
    ui/
      index.ts            # clack 封装：banner/section/item/prompt/secret/confirm/spinner/ok/fail
      multiselect.ts      # 基于 @clack/core 的自定义多选（热键+legend+配色+分页）
      fallbackSelect.ts   # --no-ui 序号选择（复刻 PromptIndexSelection）
    support/
      strings.ts          # firstNonEmpty / isBlank / or / padRight / containsLower ...
      errors.ts           # APIError / CanceledError + 判定
      submissionShortcut.ts   # 下划线 token + 数字启发式解析
      terminal.ts         # 终端宽高探测（best-effort）
  test/                   # 纯逻辑单测 + fetch mock
```

## 4. 配置与凭据

### 4.1 位置

- 目录：`~/.wu/`（跨平台用 `os.homedir()`）。
- `~/.wu/config.json`：业务默认值，**明文**。
- `~/.wu/credential.enc`：凭据密文（JSON 序列化后 AES-GCM 加密）。

### 4.2 config.json —— 内置固定默认值

源码不再硬编码个人业务数据；改为首次运行时若 `config.json` 不存在则生成，**默认值直接采用 Go 版当前的固定值**（不是空占位）：

```json
{
  "msContact": "feizh@microsoft.com",
  "validationsPerformed": "Product assurance team full range tested",
  "affectedOems": ["N/A"],
  "businessJustification": "to meet MDA requirements",
  "destination": "windowsUpdate",
  "goLiveImmediate": true,
  "autoInstallDuringOSUpgrade": true,
  "autoInstallOnApplicableSystems": true,
  "isDisclosureRestricted": false,
  "publishToWindows10s": false,
  "isRebootRequired": false,
  "isCoEngineered": false,
  "isForUnreleasedHardware": false,
  "hasUiSoftware": false,
  "visibleToAccounts": []
}
```

生成后用户可自行编辑；缺失字段回落到上述内置常量（常量定义在 `config/store.ts`，是唯一保留这些值的地方）。

### 4.3 凭据加密（机器绑定 AES-256-GCM）

- 密钥派生：`crypto.scryptSync(material, salt, 32)`，其中 `material = os.hostname() + '\0' + os.userInfo().username + '\0' + os.platform()`。
- `salt`（16B）、`iv`（12B）随机生成，与 `authTag`（16B）、`ciphertext` 一并以 base64 存入 `credential.enc`：
  ```json
  { "v": 1, "salt": "...", "iv": "...", "tag": "...", "data": "..." }
  ```
- 解密失败（换机器 / 文件损坏）→ 视为无凭据，回落到交互式提示重新录入并覆盖保存。
- 明文凭据仅在内存中存在；写盘一律加密。

### 4.4 取值优先级

**CLI 参数 > 配置文件**。移除 Go 版的 `HW_TENANT_ID` / `HW_CLIENT_ID` / `HW_CLIENT_SECRET` 环境变量支持。

装配顺序（`cli/options.ts`）：读 config → 用 config 值作为默认 → CLI 显式提供的字段覆盖 → 仍缺失的凭据字段进入交互提示。

## 5. 交互层（UI）

用 `@clack/prompts` + `picocolors` 复刻 Wrangler 风格，映射如下：

| Go 版能力 | TS 实现 |
|---|---|
| Banner（`⛅️ WU`、分隔线、副标题） | `ui.banner()`：picocolors 复刻，保留 `⛅️`、`────` 线、副标题两行 |
| Section `╭ Title Step x of y` + `│` | `ui.section()`：picocolors 打印，保留引导线 |
| `Prompt` / `PromptSecret` | clack `text` / `password` |
| `PromptYesNo` | clack `confirm` |
| `Spin` | clack `spinner` |
| `Ok/Warn/Fail/Info/ErrorInside` | picocolors 前缀（✅/⚠️/❌/ℹ + `│ ❌` 内嵌错误） |
| raw-terminal 多选 | **自定义组件（见 5.1）** |
| `--no-ui` 序号选择 | `ui/fallbackSelect.ts` 复刻 |

### 5.1 自定义多选（保留全选热键）

`@clack/prompts` 内置 `multiselect` 不支持 `a`/`n` 热键、legend 高亮与分页，因此基于 **`@clack/core` 的 `Prompt` 基类**自建组件 `ui/multiselect.ts`，**必须保留** Go 版全部交互：

- 键位：`↑↓` 移动、`PgUp/PgDn` 跳 10、`Home/End`、`Space` 勾选、**`a` 全选**、**`n` 清空**、`Enter` 确认（空选时忽略）、`q`/`Esc` 取消。
- 顶部渲染 legend：`Bundles: B1:count (inf...) B2:...`，按 bundle 配色。
- 列表按 bundle 颜色渲染，光标行高亮（反色背景），显示 `[x] 序号 文本`。
- 分页滚动：按终端高度计算可视窗口 `viewH`，光标越界时滚动 `top`。
- 底部状态：`已选 m/n | 当前 i/n`。
- 取消 → 抛 `CanceledError`，退出码 130。

10 色轮盘沿用 Go 版顺序（Cyan/Yellow/Green/Magenta/Blue/White/DarkCyan/DarkYellow/DarkGreen/DarkMagenta），映射到 picocolors 近似色。

## 6. 业务逻辑保真（纯函数，1:1 复刻 + 单测）

- **`cli/args`**：`--chids` / `--visible-to-accounts` / `--affected-oems` 连续多值收集直到下一个 `--`；其余布尔 flag 白名单同 Go；`--out` 默认 `shippinglabel.request.json`。
- **`validate/chid`**：正则 `^\{?[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}\}?$`；去花括号、转小写、去重；空则报错。
- **`support/submissionShortcut`**：下划线拆分取 token[1]/token[2]；否则数字启发式（尾 19 位=submission，其前 17 位=product）。
- **`drivermeta/parse`**：遍历 `BundleInfoMap → InfInfoMap → OSPnPInfoMap → pnp`；dedupe key = `bundle|inf|os|pnp`；bundle 排序（小写）后分配 `B{i}` tag 与配色；legend 采样每 bundle 前 3 个 inf；targets 按 `bundleTag→inf→os→pnp`（均小写）排序。
- **`drivermeta/listItems`**：列宽自适应（inf/os/pnp 各 28，最小 16/18/18，按终端宽度收缩），拼 `manufacturer | deviceDescription` 额外信息。
- **`shippinglabel/payload`**：
  - `publishingSpecifications`：`goLiveDate`（immediate 时为 `""`）、`visibleToAccounts`、两个 autoInstall、`manualAcquisition = !osUpgrade && !applicable`、`isDisclosureRestricted`、`publishToWindows10s`。
  - 当任一 autoInstall 为真时加 `additionalInfoForMsApproval`（microsoftContact/validationsPerformed/affectedOems/isRebootRequired/isCoEngineered/isForUnreleasedHardware/hasUiSoftware/businessJustification）。
  - `targeting.hardwareIds[]`：`{bundleId, infId, operatingSystemCode, pnpString}`；`targeting.chids[]`：`{chid, distributionState:"pendingAdd"}`。
  - 顶层 `name`、`destination`。

## 7. 编排流程（`app/run.ts`，复刻 4 步）

1. **Initialize & Auth**：加载 config 与加密凭据 → 缺失则提示 → 保存（凭据加密回写）→ `acquireToken`（spinner）。
2. **Submission Selection**：提示 `productId`（支持 submission shortcut）与 `submissionId` → `getSubmission` → 打印 workflow 状态。
3. **Metadata Analysis & Selection**：`findDriverMetadataURL` → `downloadDriverMetadata` → `parse` → `--select-all` 或多选（>300 项且 offerFilter 时先问关键字过滤）。
4. **Create Shipping Label**：提示 name 与 CHIDs（校验循环）→ `buildPayload` → 写 `shippinglabel.request.json` → `--dry-run` 则止步；否则 `createShippingLabel` → 打印 partner 门户 URL。

API 常量沿用：
- baseAPI `https://manage.devcenter.microsoft.com/v2.0/my/hardware`
- token endpoint `https://login.microsoftonline.com/{tenant}/oauth2/token`，`resource=https://manage.devcenter.microsoft.com`
- partner URL 模板 `https://partner.microsoft.com/en-us/dashboard/hardware/driver/{product}/submission/{submission}/ShippingLabel/{id}`
- driverMetadata 下载：仅当 URL 含 `manage.devcenter.microsoft.com` 时附 Bearer。

退出码：成功 0；参数缺失 2；取消/超时 130；API/其它错误 1。

## 8. 网络层

- 用原生 `fetch` + `AbortController`（180s 超时）替代 Go 的 `http.Client`。
- 非 2xx → 抛 `APIError`，消息含状态码与响应体（与 Go 版一致）。
- token 表单用 `application/x-www-form-urlencoded`；devcenter 用 `application/json`。

## 9. 测试策略（TDD）

vitest 单测覆盖：
- `cli/args` 各类参数组合；`validate/chid`；`support/submissionShortcut`；`drivermeta/parse`（用 Go 版示例结构构造样例）；`drivermeta/listItems` 列宽；`shippinglabel/payload` 各分支；`config/store` 默认回落与优先级；`config/crypto` 加解密往返 + 换 material 解密失败。
- `auth/token`、`devcenter/*`：mock `fetch` 覆盖成功/非 2xx/非法 JSON。
- UI 组件不做端到端自动化（交互式），逻辑部分（分页窗口计算、legend 构建）抽纯函数单测。

## 10. 交付物

- `WU-npm/` 完整可 `npm install && npm run build` 的包，`wu` 命令可运行。
- 双语 README（对齐仓库现有 README 风格）。
- 全部单测通过。

## 11. 与 Go 版的已知差异（有意为之）

1. 业务默认值来源从源码硬编码改为 `~/.wu/config.json`（首次生成即带 Go 版原值）。
2. 凭据从明文 `credential.json` 改为加密 `~/.wu/credential.enc`。
3. 移除 `HW_*` 环境变量覆盖；优先级为 CLI > 配置文件。
4. 凭据/配置位置从"可执行文件旁"改为用户主目录 `~/.wu/`。

其余行为（参数、交互、输出、payload、多选热键）均保持一致。
