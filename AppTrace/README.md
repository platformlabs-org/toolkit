# AppTrace

精准测量 Windows 桌面应用**从启动到用户看到窗口**的时间。覆盖所有桌面应用类型:原生 Win32/WPF/Qt、Chromium/Electron 多进程、launcher/stub 间接启动、UWP/MSIX、复用已有实例、以及「只给文件路径走默认程序」的文档打开。

组合 **ETW**(NT Kernel Logger Process/Start + DxgKrnl PresentHistory)与 **WinEvent**(窗口 create/show/foreground/destroy),以**实时进程树 + 孤儿认领 + 事件缓存追溯**作为关联核心,所有锚点统一在 `QueryPerformanceCounter` 时基。

- **单 exe,零依赖**:静态链接 CRT,~285KB,拷贝即用
- **全路径覆盖**:exe / .lnk / 文档(默认关联程序)/ UWP / 复用实例,自动识别
- **低开销**:real-time buffer 模式,不写盘,ETW 回调零阻塞
- **自愈**:孤儿 ETW 会话自动清扫;被测应用三阶段优雅退出(WM_CLOSE → WM_QUIT → 强杀),不触发「上次非法退出」提示

---

## 编译

```cmd
build.cmd
```

输出 `build\AppTrace.exe`。自动探测 vcvars,支持 MSVC / clang-cl / clang / g++。

单元测试(28 项,零框架):

```cmd
test\build_tests.cmd && test\test_core.exe
```

## 使用

**必须以管理员身份运行**(NT Kernel Logger 需要 SeSystemProfilePrivilege)。

```cmd
:: 指定程序
AppTrace.exe -- winver.exe
AppTrace.exe -- "C:\Path\MyApp.exe"

:: 桌面快捷方式(.lnk 自动解析到目标 exe + 参数)
AppTrace.exe -- "C:\Users\Me\Desktop\GitHub Desktop.lnk"

:: 只给文件路径 —— 模拟用户双击:自动解析系统默认关联程序并启动
AppTrace.exe -- "C:\Users\Me\Desktop\report.xlsx"

:: UWP / Packaged app(需要 AUMID)
AppTrace.exe --uwp Microsoft.WindowsNotepad_8wekyb3d8bbwe!App -- notepad.exe

:: 严谨测量:预热 1 次 + 测 3 次取中位数
AppTrace.exe --warmup 1 --runs 3 -- "C:\Path\MyApp.exe"
```

### 命令行参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `-o, --output <file>` | (无) | 追加 JSONL 记录到文件(含关联诊断字段) |
| `--uwp <aumid>` | (无) | 用 AUMID 通过 IApplicationActivationManager 启动 UWP/MSIX |
| `--pname <name>` | 自动 | 覆盖进程名关联键(主窗口进程名与目标 exe 不同时用) |
| `--batch <file>` | (无) | 批量测量文件中列出的应用(每行一条命令行,`#` 注释),输出汇总表 |
| `--csv` | off | stdout 输出 CSV(默认单行 JSON) |
| `--no-winevent` | off | 跳过 WinEvent 通道(只测 T0/T1/T4) |
| `--timeout <sec>` | 30 | 整体采集超时 |
| `--grace <sec>` | 3 | 首帧之后继续抓取的秒数(等 splash 销毁、主窗口事件到齐) |
| `--runs <n>` | 1 | 测量次数 |
| `--warmup <n>` | 0 | 预热次数(不计入结果) |
| `--debug` | off | 输出各通道诊断 + 窗口时间线(`[win]` 行,含标题)到 stderr |
| `--keep` | off | 测完后保留被测应用(默认自动终止) |
| `--cleanup` | - | 清扫残留 ETW 会话(NT Kernel Logger + AppTrace/StartupTime 前缀)后退出 |

完整字段释义与时间线图:`AppTrace.exe --help`。

---

## 时间线与输出字段

```
T0 启动调用          T1 首个目标进程启动    T2 主窗口创建    T3 主窗口显示    T4 首帧提交 GPU
```

```
                          T0        T1        T2        T3        T4
                          |         |         |         |         |
time_to_process_ms        +---------+         |         |         |
process_to_window_ms                +---------+         |         |
time_to_window_ms (*)     +-----------------------------+         |
window_to_frame_ms                            +---------+---------+
time_to_first_frame_ms    +---------------------------------------+
```

命名规则:`time_to_X_ms` = 从启动到里程碑 X;`X_to_Y_ms` = 区间段。`(*)` 为主指标。

```json
{"target":"winver.exe","main_pid":8988,"time_to_window_ms":42.036,
 "first_frame_seen":false,"time_to_first_frame_ms":0.0,
 "time_to_process_ms":3.009,"process_to_window_ms":22.077,
 "window_to_frame_ms":0.0,"first_frame_timeout":true,"first_frame_event_id":0}
```

**注意**:`time_to_window_ms` 的终点是 T3(显示),因此不等于 `time_to_process_ms + process_to_window_ms`(其终点是 T2);差值即 T2→T3 的「窗口已创建但未显示」阶段。`window_to_frame_ms` 在应用先渲染后建窗时(T4 早于 T2)为 0。

### `time_to_first_frame_ms` 的适用范围

只有**翻转模型 DirectX** 应用有值(Chromium/Electron 的 GPU 进程、D3D 游戏)。两类应用恒为 0,属预期而非故障:

- **GDI 应用**(记事本、winver):不走 Present
- **DWM 合成应用**(Office、Qt6):Present 事件以 dwm.exe 名义发出,无法归属到应用进程

`time_to_window_ms` 对**所有** GUI 应用有效,是通用主指标。

---

## 工作原理

```
T0 = qpc_now()
launch(exe / lnk / 默认关联程序 / UWP 激活)

ETW NT Kernel Logger ──► 所有 Process/Start ──► 实时构建进程树:
    ① 父子链:parent ∈ 树 → 加入(Electron 多进程)
    ② 孤儿认领(名字):name == target && start ≥ T0(stub→真实 exe)
    ③ 孤儿认领(目录):镜像在目标安装目录树下(版本子目录 + 改名,如汽水音乐)
    ④ 复用认领:无窗口无首帧时定期扫描同名活进程(Edge 启动加速实例)

WinEvent(全量顶层窗口)──► 树内 pid 的 CREATE/SHOW/FG 入账;
    树外的先缓存,树生长/认领后追溯(窗口与 Present 同机制)

DxgKrnl PresentHistory ──► 专用队列全量转发(上游不过滤),
    树内最早 Present = T4;DWM 洪流下缓存 16K 条防冲刷

采集结束 → finalize_windows() 选主窗口(错误/欢迎标题排除;
    存活候选中:最大面积 → 最早 FOREGROUND → 最晚 CREATE)
```

### 测后自动终止

三阶段优雅退出:WM_CLOSE 每 500ms 重发(对话框逐层关闭)→ WM_QUIT(无窗口后台进程走消息泵退出)→ TerminateProcess 幸存者。**只杀本次运行启动的进程**;复用场景认领的预存实例只关窗不强杀(`spared` 计数)。

### 会话与环境影响

- GPU 密集应用只在**物理 console 会话**创建窗口;RDP/网络会话会告警。远程测试用 `schtasks /RL HIGHEST /IT` 在 console 会话执行
- RDP 下 T4 不可用(Present 归 DWM);T0–T3 正常(无 SHOW 时 T3 回退 CREATE)

---

## 常见问题

**Failed to start NT Kernel Logger (err=183)** — 残留会话占用。`AppTrace.exe --cleanup`。

**被强杀后 DxgKrnl 零事件** — 上次强杀留下的孤儿会话持有 provider。已内置启动时前缀清扫(`AppTrace-DxgKrnl*` + 旧 `StartupTime-DxgKrnl*`)。

**关联失败(Note: target process not found)** — 用 `--debug` 看窗口 PID 与注册表进程名;主窗口进程名与目标不同时用 `--pname` 覆盖。

**冷/暖差异巨大** — 正常现象(可达 20 倍)。对比测试固定协议:`--warmup 1 --runs 3`。

---

## 项目结构

```
src/
├── main.cpp            # CLI 解析 + capture_once 编排 + 批量模式
├── Config.hpp          # 集中可调常量(队列/缓存容量、超时、teardown)
├── Options.hpp         # CLI 选项 + RunResult 字段 + 退出码
├── Launcher.hpp        # 启动策略(exe/lnk/UWP/文档关联)+ 三阶段 teardown
├── KernelSession.hpp   # NT Kernel Logger:所有 Process/Start → 注册表 + 队列
├── DxgKrnlSession.hpp  # DxgKrnl PresentHistory 全量转发(专用队列)
├── WinEventHook.hpp    # 顶层窗口 CREATE/SHOW/FG/DESTROY 捕获
├── ProcessRegistry.hpp # 全局 pid → 镜像名注册表(无锁 seq-counter)
├── PidTracker.hpp      # 实时进程树(父子链 + 三类认领)
├── Timeline.hpp        # 关联核心:树生长 + 事件缓存追溯 + 主窗口裁决
├── EtwSession.hpp      # ETW session RAII + 孤儿会话清扫
├── EventQueue.hpp      # MPSC 环形队列(自旋锁 push,无锁 pop)
├── Output.hpp          # JSON/CSV/JSONL 输出 + 多次运行汇总
├── JsonWriter.hpp      # 零依赖 JSON 构造器
├── Utf8.hpp            # UTF-8 输出 + 字符串助手(to_wide/lowered/basename)
└── QpcClock.hpp        # 统一 QPC 时基
test/
├── test_core.cpp       # 28 项单元测试(队列/树/注册表/时间线/主窗口裁决)
├── build_tests.cmd     # 测试构建脚本
└── remote_*.ps1        # 远程(LABS-XIAOXIN)批量/重测/文件测试脚本
```

测试报告见 [REPORT.md](REPORT.md) 与 [REPORT-2026-08-18.md](REPORT-2026-08-18.md)(17 桌面应用 + Office 大文件,含 AppTrace 交叉验证与历轮修复记录)。

## 参考

- [Process_TypeGroup1 class](https://learn.microsoft.com/en-us/windows/win32/etw/process-typegroup1)
- [IApplicationActivationManager::ActivateApplication](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationactivationmanager-activateapplication)
- [PresentMon](https://github.com/GameTechDev/PresentMon)
- [Windows Execution Aliases](https://www.tiraniddo.dev/2019/09/overview-of-windows-execution-aliases.html)
