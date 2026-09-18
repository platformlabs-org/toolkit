# @platformtools/spms

Lenovo SPMS(NG SPMS)命令行工具 —— 浏览 / 查询 / 下载 root deliverable、release 包与模块文件,并解析 driver 包 `.cat` 元数据。零依赖安装即用(Node.js ≥ 18),认证走 CAS SSO,下载走 FTPS。

## 功能

- **search / info / versions**:搜索 root deliverable、查看详情与全部版本
- **download**:按 rootId + 版本号(或 releaseId)下载 release 包,省略版本则下载全部
- **module / pkg**:按模块名下载模块文件,或下载该模块所属 release 的原始包
- **metadata**:下载 driver 包 → 7-Zip 递归解压 → 解析 `.cat` 文件 ASN.1 元数据(Submission ID / Bundle ID / OS / Universal / Declarative)
- **dl-token**:仅凭页面上的下载 token 直接下载,无需登录
- **交互 REPL**:直接运行 `spms` 进入会话模式,记忆上次访问的 rootId,`info`/`versions`/`download` 可省略参数
- **凭据与会话加密持久化**:AES-256-GCM(机器绑定密钥)保存于 `~/.spms/`,会话 cookie 跨次复用,失效自动重登

## 安装

```bash
npm install -g @platformtools/spms
# 或免安装运行
npx @platformtools/spms <命令>
```

## 凭据

首次运行时交互输入用户名/密码,加密保存到 `~/.spms/credential.enc`,后续自动复用;也可用环境变量覆盖(适合 CI):

```bash
export SPMS_USER=xxx
export SPMS_PASSWORD=xxx
```

更新凭据:`spms auth`。

## 命令

| 命令 | 说明 |
|------|------|
| `search <关键词>` | 搜索 root deliverable |
| `info <rootId>` | 查看 root deliverable 详情 |
| `versions <rootId>` | 查看所有版本 |
| `download <rootId> [版本] [目录]` | 下载指定版本(内部版本号或 releaseId,省略 = 全部) |
| `module <模块名> [目录]` | 下载模块文件 |
| `pkg <模块名> [目录]` | 模块 → 所属 release 原始包 |
| `metadata <releaseId\|模块名> [--keep] [--all]` | 下载 driver 包并解析 `.cat` 元数据 |
| `dl-token <token> [目录]` | 仅凭 token 下载(无需 Web) |
| `auth` | 录入/更新凭据 |

`--keep` 保留解压临时目录,`--all` 显示 `.cat` 全部元数据条目(默认只显示 5 个关键字段)。

## 用法

```bash
# 单命令模式
spms search "Intel GFX"
spms versions 123456
spms download 123456 31.0.101.5333
spms metadata 778899 --all

# 交互模式(记忆上次 rootId, 后续命令可省略)
spms
✔ 登录
spms search Realtek
spms versions        # 自动使用上次 rootId
spms download 1.0.8  # 第一参数非纯数字时自动视为版本号

# 批处理 / CI:管道喂入命令(非 TTY 自动降级为纯文本输出)
echo "search Realtek
versions 123456
exit" | spms
```

## 说明

- 下载目录缺省为 `~/spms-downloads/`,可在命令中指定
- `.cat` 元数据解析为纯 JS ASN.1 实现(OID `1.3.6.1.4.1.311.12.2.1`),不依赖系统证书工具
- 解压使用内置 `7zip-bin`,无需本机安装 7-Zip

## License

MIT
