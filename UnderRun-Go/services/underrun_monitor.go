package services

type UnderrunMonitor interface {
	RegisterUpdateCallback(cb UpdateCallback)
	Start()
	Stop()
	GetCurrentStatus() URSnapshot
	ResetPipe(pipe string) error
	GetMonitoredPaths() []string
}
