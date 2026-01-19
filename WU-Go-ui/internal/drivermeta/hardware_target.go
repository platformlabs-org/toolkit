package drivermeta

type HardwareTarget struct {
	BundleID          string `json:"bundleId"`
	BundleTag         string `json:"bundleTag"`
	InfID             string `json:"infId"`
	OSCode            string `json:"osCode"`
	PnpID             string `json:"pnpId"`
	Manufacturer      string `json:"manufacturer"`
	DeviceDescription string `json:"deviceDescription"`
}
