package sysdriver

type DriverInfo struct {
	DeviceName               string            `json:"deviceName"`
	Version                  string            `json:"version"`
	Manufacturer             string            `json:"manufacturer"`
	InfName                  string            `json:"infName"`
	CatalogPath              string            `json:"catalogPath"`
	PnpDeviceId              string            `json:"pnpDeviceId"`
	SignedDriverHardwareId   string            `json:"signedDriverHardwareId"`
	HardwareIds              []string          `json:"hardwareIds"`
	CompatibleIds            []string          `json:"compatibleIds"`
	RawMatchedHardwareId     string            `json:"rawMatchedHardwareId"`
	DisplayMatchedHardwareId string            `json:"displayMatchedHardwareId"`
	Metadata                 map[string]string `json:"metadata"`
}
