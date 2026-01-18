package sysdriver

import (
	"strings"

	"DriverMetadata-GO/internal/matcher"
	"github.com/yusufpapurcu/wmi"
)

type Win32_PnPSignedDriver struct {
	DeviceName    *string
	DriverVersion *string
	Manufacturer  *string
	InfName       *string
	DeviceID      *string
	HardWareID    *string
}

type Win32_PnPEntity struct {
	HardwareID   []string
	CompatibleID []string
}

func GetLenovoDrivers() ([]DriverInfo, error) {
	var dst []Win32_PnPSignedDriver
	q := "SELECT DeviceName, DriverVersion, Manufacturer, InfName, DeviceID, HardWareID FROM Win32_PnPSignedDriver WHERE Manufacturer LIKE '%Lenovo%'"

	err := wmi.Query(q, &dst)
	if err != nil {
		return nil, err
	}

	var results []DriverInfo

	for _, d := range dst {
		info := DriverInfo{
			DeviceName:             strVal(d.DeviceName),
			Version:                strVal(d.DriverVersion),
			Manufacturer:           strVal(d.Manufacturer),
			InfName:                strVal(d.InfName),
			PnpDeviceId:            strVal(d.DeviceID),
			SignedDriverHardwareId: strVal(d.HardWareID),
			Metadata:               make(map[string]string),
		}

		if info.PnpDeviceId != "" {
			ids := GetIdsFromPnPEntity(info.PnpDeviceId)
			info.HardwareIds = ids.HardwareIds
			info.CompatibleIds = ids.CompatibleIds
		}

		info.RawMatchedHardwareId = matcher.PickRawMatchedHardwareId(info.SignedDriverHardwareId, info.HardwareIds)
		info.DisplayMatchedHardwareId = matcher.PickDisplayMatchedHardwareId(info.RawMatchedHardwareId, info.HardwareIds)

		// Catalog path finding is done later or here?
		// In C#, it does:
		// item.CatalogPath = catPath;
        // item.Metadata = ...
        // So I should populate CatalogPath here to save time? Or keep it separate?
        // Let's populate it here to be complete.
        info.CatalogPath = matcher.FindCatPath(info.InfName)

        // Metadata extraction is heavy, maybe do it on demand?
        // C# does it in the loop. I'll leave it empty here and let the caller handle it if needed
        // or just do it here. The prompt says "scans all installed...".
        // I will let the Service layer handle metadata extraction to keep this function clean WMI wrapper.

		results = append(results, info)
	}

	return results, nil
}

func GetIdsFromPnPEntity(deviceId string) IdQueryResult {
	var result IdQueryResult
	result.HardwareIds = []string{}
	result.CompatibleIds = []string{}

	if strings.TrimSpace(deviceId) == "" {
		return result
	}

	// Escape WQL string
	escaped := strings.ReplaceAll(deviceId, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `'`, `''`)

	q := "SELECT HardwareID, CompatibleID FROM Win32_PnPEntity WHERE DeviceID='" + escaped + "'"
	var dst []Win32_PnPEntity

	err := wmi.Query(q, &dst)
	if err == nil && len(dst) > 0 {
		// Use the first match (DeviceID is unique)
		for _, h := range dst[0].HardwareID {
			if strings.TrimSpace(h) != "" {
				result.HardwareIds = append(result.HardwareIds, h)
			}
		}
		for _, c := range dst[0].CompatibleID {
			if strings.TrimSpace(c) != "" {
				result.CompatibleIds = append(result.CompatibleIds, c)
			}
		}
	}

	// Distinct
	result.HardwareIds = unique(result.HardwareIds)
	result.CompatibleIds = unique(result.CompatibleIds)

	return result
}

type IdQueryResult struct {
	HardwareIds   []string
	CompatibleIds []string
}

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func unique(slice []string) []string {
	keys := make(map[string]bool)
	list := []string{}
	for _, entry := range slice {
		if _, value := keys[entry]; !value {
			keys[entry] = true
			list = append(list, entry)
		}
	}
	return list
}
