//go:build windows

package services

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"os/exec"
	"sync"
	"time"

	"golang.org/x/sys/windows/registry"
)

type windowsMonitor struct {
	mu sync.Mutex
	cb UpdateCallback

	cancel  context.CancelFunc
	running bool

	cachedIndex *int

	initialized bool
	last        URSnapshot
}

func NewUnderrunMonitor() UnderrunMonitor { return &windowsMonitor{} }

var regPathArray = []string{
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0001`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0002`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0003`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0004`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0005`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0006`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0007`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0008`,
	`SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0009`,
}

var nameArray = []string{
	"UnderRunCountPipeA", "UnderRunCountPipeB", "UnderRunCountPipeC", "UnderRunCountPipeD",
}

func (m *windowsMonitor) RegisterUpdateCallback(cb UpdateCallback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cb = cb
}

func (m *windowsMonitor) Start() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.running {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.running = true
	go m.monitorLoop(ctx)
}

func (m *windowsMonitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.running {
		return
	}
	if m.cancel != nil {
		m.cancel()
	}
	m.running = false
	m.cancel = nil
	m.initialized = false // Reset baseline so next Start() treats first read as new baseline
}

func (m *windowsMonitor) GetCurrentStatus() URSnapshot {
	idx := m.getURIndex()
	now := time.Now().Format(time.RFC3339)
	if idx < 0 {
		return URSnapshot{A: 0, B: 0, C: 0, D: 0, Valid: false, TS: now}
	}
	vals, ok := m.readUnderrunValues(idx)
	return URSnapshot{A: vals[0], B: vals[1], C: vals[2], D: vals[3], Valid: ok, TS: now}
}

func (m *windowsMonitor) monitorLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.tickOnce()
		}
	}
}

func (m *windowsMonitor) tickOnce() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[UnderRun] panic: %v", r)
			m.emit("error", map[string]any{
				"message": "panic in monitor loop",
				"detail":  r,
				"ts":      time.Now().Format(time.RFC3339),
			})
		}
	}()

	idx := m.getURIndex()
	now := time.Now().Format(time.RFC3339)

	// 找不到 index：仅 update（Valid=false），不触发 change
	if idx < 0 {
		m.emit("update", URSnapshot{A: 0, B: 0, C: 0, D: 0, Valid: false, TS: now})
		return
	}

	vals, ok := m.readUnderrunValues(idx)
	curr := URSnapshot{A: vals[0], B: vals[1], C: vals[2], D: vals[3], Valid: ok, TS: now}
	m.emit("update", curr)

	// 读取失败：不告警
	if !ok {
		return
	}

	m.mu.Lock()
	if !m.initialized {
		m.initialized = true
		m.last = curr
		m.mu.Unlock()
		return // 第一次基线不告警
	}

	prev := m.last
	diffs := make([]URDiff, 0, 4)
	if curr.A != prev.A {
		diffs = append(diffs, URDiff{Pipe: "A", Prev: prev.A, Curr: curr.A})
	}
	if curr.B != prev.B {
		diffs = append(diffs, URDiff{Pipe: "B", Prev: prev.B, Curr: curr.B})
	}
	if curr.C != prev.C {
		diffs = append(diffs, URDiff{Pipe: "C", Prev: prev.C, Curr: curr.C})
	}
	if curr.D != prev.D {
		diffs = append(diffs, URDiff{Pipe: "D", Prev: prev.D, Curr: curr.D})
	}

	// 更新 last
	m.last = curr
	m.mu.Unlock()

	if len(diffs) > 0 {
		m.emit("change", URChange{
			Prev:      prev,
			Curr:      curr,
			Diffs:     diffs,
			ChangedAt: now,
		})
	}
}

func (m *windowsMonitor) emit(typ string, payload interface{}) {
	m.mu.Lock()
	cb := m.cb
	m.mu.Unlock()
	if cb != nil {
		cb(UREvent{Type: typ, Payload: payload})
	}
}

func (m *windowsMonitor) readUnderrunValues(index int) ([4]int, bool) {
	var results [4]int
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, regPathArray[index], registry.QUERY_VALUE)
	if err != nil {
		return results, false
	}
	defer k.Close()

	for i := 0; i < len(nameArray); i++ {
		results[i] = readRegistryIntLikeCSharp(k, nameArray[i])
	}
	return results, true
}

func readRegistryIntLikeCSharp(k registry.Key, valueName string) int {
	if v, _, err := k.GetIntegerValue(valueName); err == nil {
		return int(v)
	}
	if b, _, err := k.GetBinaryValue(valueName); err == nil && len(b) >= 4 {
		rev := []byte{b[3], b[2], b[1], b[0]}
		u := binary.LittleEndian.Uint32(rev)
		return int(int32(u))
	}
	return 0
}

func (m *windowsMonitor) ResetPipe(pipe string) error {
	idx := m.getURIndex()
	if idx < 0 {
		return fmt.Errorf("registry key not found")
	}

	keyPath := regPathArray[idx]

	var valueName string
	switch pipe {
	case "A":
		valueName = "UnderRunCountPipeA"
	case "B":
		valueName = "UnderRunCountPipeB"
	case "C":
		valueName = "UnderRunCountPipeC"
	case "D":
		valueName = "UnderRunCountPipeD"
	default:
		return fmt.Errorf("invalid pipe name: %s", pipe)
	}

	// 尝试直接修改，如果成功（已是 admin）则直接返回
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, keyPath, registry.SET_VALUE)
	if err == nil {
		defer k.Close()
		// Change to REG_BINARY with 4 bytes of zeros
		zeros := []byte{0, 0, 0, 0}
		err2 := k.SetBinaryValue(valueName, zeros)
		if err2 == nil {
			return nil
		}
	}

	// 权限不足，尝试使用 runas 调用 reg add
	// 使用 PowerShell Start-Process -Verb RunAs -Wait 确保同步执行（等待 UAC 处理完毕）
	fullKey := `HKLM\` + keyPath

	// Command: reg.exe add "HKLM\..." /v ValueName /t REG_BINARY /d 00000000 /f
	// PowerShell arguments need careful escaping
	regArgs := fmt.Sprintf(`add "%s" /v %s /t REG_BINARY /d 00000000 /f`, fullKey, valueName)

	// PowerShell command: Start-Process -FilePath "reg.exe" -ArgumentList '...' -Verb RunAs -Wait -WindowStyle Hidden
	psCommand := fmt.Sprintf(`Start-Process -FilePath "reg.exe" -ArgumentList '%s' -Verb RunAs -Wait -WindowStyle Hidden`, regArgs)

	cmd := exec.Command("powershell.exe", "-WindowStyle", "Hidden", "-Command", psCommand)

	// 即使是 runas，Start-Process -Wait 也会阻塞直到子进程结束
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to execute elevated reset: %v, output: %s", err, string(output))
	}

	return nil
}

func (m *windowsMonitor) GetMonitoredPaths() []string {
	// Return a copy to be safe, though not strictly necessary for string slice constants if we treat them as immutable
	paths := make([]string, len(regPathArray))
	copy(paths, regPathArray)
	return paths
}

func (m *windowsMonitor) getURIndex() int {
	m.mu.Lock()
	if m.cachedIndex != nil {
		idx := *m.cachedIndex
		m.mu.Unlock()
		return idx
	}
	m.mu.Unlock()

	for i := 0; i < len(regPathArray); i++ {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, regPathArray[i], registry.QUERY_VALUE)
		if err != nil {
			continue
		}

		found := false
		for _, name := range nameArray {
			if _, _, err1 := k.GetIntegerValue(name); err1 == nil {
				found = true
				break
			}
			if _, _, err2 := k.GetBinaryValue(name); err2 == nil {
				found = true
				break
			}
		}
		k.Close()

		if found {
			m.mu.Lock()
			tmp := i
			m.cachedIndex = &tmp
			m.mu.Unlock()
			return i
		}
	}
	return -1
}
