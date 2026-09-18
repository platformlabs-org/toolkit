# AutoCharge

通过智能 PDU 插座自动控制设备充电的命令行工具。

## 概述

AutoCharge 读取本机电池电量（WMI `Win32_Battery`），配合 SNMP 智能插排
（PDUSPAPI.dll，默认 PDU 地址 `192.168.1.111`，可在 `Program.cs` 的
`sDevIp` 中修改）自动控制充电：

* **bench 模式**（自动充电）：电量 ≤ 35% 时接通指定插口开始充电，
  每分钟检测一次，充至 ≥ 85% 自动断开。
* **control 模式**（手动控制）：直接开/关指定插口。

## 使用

```cmd
AutoCharge.exe <插口号>          :: bench 模式：自动充电至 85%
AutoCharge.exe <插口号> <0|1>    :: control 模式：0 = 断开，1 = 接通
```

插口号范围 1–8。

## 构建

Visual Studio 打开 `AutoCharge.sln`（.NET Framework 4.x）。
依赖的 `PDUSPAPI.dll`、`SnmpSharpNet.dll` 已随源码提供。
