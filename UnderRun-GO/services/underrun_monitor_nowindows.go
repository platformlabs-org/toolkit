//go:build !windows

package services

import "time"

type noopMonitor struct {
	cb UpdateCallback
}

func NewUnderrunMonitor() UnderrunMonitor { return &noopMonitor{} }

func (n *noopMonitor) RegisterUpdateCallback(cb UpdateCallback) { n.cb = cb }
func (n *noopMonitor) Start() {
	if n.cb != nil {
		n.cb(UREvent{
			Type: "error",
			Payload: map[string]any{
				"message": "UnderRun: non-windows build; registry monitor disabled.",
				"ts":      time.Now().Format(time.RFC3339),
			},
		})
	}
}
func (n *noopMonitor) Stop() {}

func (n *noopMonitor) GetCurrentStatus() URSnapshot {
	return URSnapshot{A: 0, B: 0, C: 0, D: 0, Valid: false, TS: time.Now().Format(time.RFC3339)}
}

func (n *noopMonitor) ResetPipe(pipe string) error {
	return nil
}

func (n *noopMonitor) GetMonitoredPaths() []string {
	return []string{"(Not Windows - Monitor Disabled)"}
}
