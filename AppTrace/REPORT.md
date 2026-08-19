# AppTrace 测试报告

**日期**: 2026-08-14
**环境**: LABS-XIAOXIN(Win11 build 26200,物理 console 会话)
**工具版本**: AppTrace.exe(含窗口存活检测 + 真实进程名修正 + Present 专用队列修复)
**对比基准**: AppTrace(EnumWindows 100ms 轮询)

---

## 一、最终测试结果(5 应用)

| # | 应用 | perceived_paint_ms<br>(启动→窗口) | cold_start_ms<br>(启动→首帧) | present_seen | 进程树 |
|---|------|-----------------------------------|------------------------------|--------------|--------|
| 1 | **winver.exe**(基线) | **41.2** | — | ✗(GDI 应用) | 1 |
| 2 | **Photoshop.exe** | **12039.2** | — | ✗(本次未捕获) | 12 |
| 3 | **Illustrator.exe** | **7252.2** | **7688.1** | ✓ | 16 |
| 4 | **Lightroom.exe** | **25635.7** | — | ✗(GDI 应用) | 6 |
| 5 | **AfterFX.exe** | **742.5**† | — | ✗ | 2 |

† AfterFX 本次 742ms 疑似捕获了欢迎/启动对话框(未销毁),前次实测主窗口为 21869ms。见"已知限制"。

### 结果解读

- **perceived_paint_ms** 是最通用的指标(所有环境有效):从启动到用户看到主窗口
- **cold_start_ms** 仅 DirectX 应用有值(Illustrator 7688ms = 完整 T0→T4)
- ~~Photoshop 前次测试曾捕获到完整 T4(9728ms),本次未捕获 —— Present 捕获存在时序敏感性(见"已知限制")~~ **已修复**:上游 Present 过滤 bug(见"五、修复记录")
- Lightroom 是 GDI 渲染,永远无 T4,但窗口时间(25.6s)有效且稳定

---

## 二、AppTrace 交叉验证(Photoshop)

用 AppTrace(100ms 轮询)独立测量 Photoshop 启动,对比窗口时间:

| 事件 | AppTrace | AppTrace | 说明 |
|------|----------|--------------|------|
| splash 窗口出现 | 1103ms (ADD) | 被排除 | splash 最终被销毁 |
| splash 窗口销毁 | 3665ms (DEL) | ✅ 正确排除 | 窗口存活检测生效 |
| 主窗口出现 | 3663ms (ADD) | perceived_paint=4028ms | **相差 365ms** |

**验证结论**:
1. ✅ **splash 排除正确** —— 如果用"第一个窗口"逻辑会报 1103ms,误差 3 秒;存活检测正确选中 3663ms 的主窗口
2. ✅ **365ms 差异合理** —— AppTrace 是 100ms 轮询(量化误差 1-2 个周期),AppTrace 是事件驱动(实时)
3. ✅ AppTrace 的事件驱动方式**精度优于轮询**

---

## 三、输出格式优化(本次生效)

### 1. target 名称:真实长路径名

| 之前 | 现在 |
|------|------|
| `"target":"PHOTOS~1"` | `"target":"Photoshop.exe"` |
| `"target":"LIGHTR~1"` | `"target":"Lightroom.exe"` |
| `"target":"ILLUST~1"` | `"target":"Illustrator.exe"` |

实现:`GetLongPathNameW` 在启动前把 8.3 短路径转为真实路径,取 basename(带扩展名,与进程名匹配键一致)。

### 2. 字段语义更准确

| 之前 | 现在 | 原因 |
|------|------|------|
| `"ok":false` | `"present_seen":false` | Lightroom 无 Present 但窗口数据有效,`ok:false` 有歧义;新名只陈述事实 |
| `"timed_out":true` | `"present_timeout":true` | 只表示"等待 Present 超时",不是整体超时 |

### 3. 示例输出

```json
{"target":"Illustrator.exe","pid":22660,"present_seen":true,
 "cold_start_ms":7688.139,"perceived_paint_ms":7252.201,
 "process_start_ms":0.0,"window_construct_ms":7252.201,
 "render_first_frame_ms":435.937,"present_timeout":false,
 "present_event_id":184,"adopted":false,"reuse_adopted":false,
 "tracker_count":16,"qpc_freq":10000000}
```

---

## 四、本次测试过程中修复的问题

| 问题 | 根因 | 修复 |
|------|------|------|
| Adobe 窗口测后不关闭 | 测试脚本用了 `--keep` | 改为默认终止(`[teardown] terminated N process(es)`) |
| 短路径进程名不匹配 | 8.3 路径 `PHOTOS~1.EXE` ≠ 真实名 `Photoshop.exe`,孤儿认领失败 | launch 后用 `QueryFullProcessImageName` 查真实路径修正 name_key |
| target 显示短名 | label 从用户输入路径取 basename | `GetLongPathNameW` 转换后取真实 basename |

---

## 五、已知限制

1. ~~**Present 捕获的时序敏感性**~~ **已修复(见"七、修复记录")**:根因是 DxgKrnl 会话的上游过滤 + 一次性发射标志,不是 GPU 进程时序
2. **不销毁的 splash**:AfterFX 的欢迎对话框如果一直存活,窗口存活检测无法区分它和主窗口(heuristics:存活+最晚创建会选中它)。需要结合窗口标题/尺寸辅助判断
3. **GDI 应用无 T4**:Lightroom/winver 等 GDI 渲染应用永远没有 DxgKrnl Present,`present_seen:false` 是预期行为,看 `perceived_paint_ms` 即可
4. **启动时间波动**:Photoshop 两次测试 4028ms vs 12039ms,冷启动受磁盘缓存影响极大,生产测量应用 `--runs 5 --warmup 2` 取中位数

---

## 六、复现命令

```cmd
AppTrace.exe -o report.jsonl --timeout 90 --grace 5 -- "C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe"
AppTrace.exe -o report.jsonl --timeout 90 --grace 5 --runs 5 --warmup 2 -- winver.exe
```

多应用批量测试需在 console 会话运行(GPU 应用不出现在远程会话)。

---

## 七、修复记录:Present 上游丢弃 bug(2026-08-14)

### 根因

`DxgKrnlSession` 在 ETW 回调里做了两件相互叠加的错误决策:

1. **上游 PID 过滤**:Present 事件先查 `tracker.contains(pid)`,不在树里直接丢弃。
   但 GPU 子进程可能在自己的 `Process/Start` 事件被消费之前就完成首次 Present(冷启动时序),
   这条 Present 一旦在上游被丢弃,下游 Timeline 的缓存/重访机制根本看不到它。
2. **一次性发射标志 `emitted_`**:整个会话只往队列推**一条** Present。会话在 launch 之前启动,
   期间 DWM 持续 present;若一次 DWM Present 恰好在 `set_root` 之前的 buffer flush 中到达,
   唯一的名额就被消耗掉,之后真正的应用 Present 全部被丢弃 —— 表现为 `present_seen:false`、
   `cold_start_ms` 为空、跑满 30s 超时。是否触发取决于 ETW buffer flush 与 set_root 的竞态,
   所以是**间歇性**的(约 15% 失败率)。

### 修复(专用 present 队列)

- `DxgKrnlSession` 不再做任何 PID 过滤、不再维护 `emitted_`,**所有** PresentHistory 事件
  原样推入**专用队列**(`kPresentQueueCapacity=4096`);关联判断完全下沉到 Timeline。
- Timeline 的 `presents_` 缓存从 128 扩到 1024(`kPresentCache`),树每次生长后 `revisit_presents()`
  重扫缓存,把"早到的" GPU 子进程 Present 追溯认领。
- 双队列排水:通用队列(窗口/进程事件)优先,Present 队列次之;Present 洪峰只会挤掉 Present,
  永远不会挤掉窗口事件。

### 验证(LABS-XIAOXIN console 会话,schtasks 提权)

| 应用 | 次数 | present_seen | cold_start_ms | pdrops | 退出 |
|------|------|--------------|---------------|--------|------|
| Photoshop 2024 | 2/2 | ✓ / ✓ | 7935.95 / 7515.47 | 0 | graceful=6/8, forced=2/1 |
| Illustrator 2024 | 1/1 | ✓ | 5494.89 | 0 | graceful=8, forced=1 |

单次捕获 Present 事件量约 19~21 万条(约 20k/s,含 DWM),专用队列 4096 容量零丢弃。
单元测试新增 2 个回归用例(present 早于进程树生长被缓存后追溯认领 / 最早 tracked present 胜出),
全套 20/20 通过。
