package drivermeta

import (
	"encoding/json"
	"testing"
)

func TestParse(t *testing.T) {
	// Minimal mock JSON structure
	mockJSON := `
	{
		"BundleInfoMap": {
			"bundle_1": {
				"InfInfoMap": {
					"inf_1.inf": {
						"OSPnPInfoMap": {
							"Windows10": {
								"PCI\\VEN_8086&DEV_1234": {
									"Manufacturer": "TestMfg",
									"DeviceDescription": "TestDevice"
								}
							}
						}
					}
				}
			},
			"bundle_2": {
				"InfInfoMap": {}
			}
		}
	}
	`
	var meta map[string]any
	if err := json.Unmarshal([]byte(mockJSON), &meta); err != nil {
		t.Fatalf("Failed to unmarshal mock: %v", err)
	}

	result, err := Parse(meta)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if len(result.Targets) != 1 {
		t.Errorf("Expected 1 target, got %d", len(result.Targets))
	}

	target := result.Targets[0]
	if target.BundleID != "bundle_1" {
		t.Errorf("Expected bundle_1, got %s", target.BundleID)
	}
	// bundle_1 should be B1 because bundle_1 < bundle_2
	if target.BundleTag != "B1" {
		t.Errorf("Expected B1, got %s", target.BundleTag)
	}
	if target.InfID != "inf_1.inf" {
		t.Errorf("Expected inf_1.inf, got %s", target.InfID)
	}
	if target.OSCode != "Windows10" {
		t.Errorf("Expected Windows10, got %s", target.OSCode)
	}
	if target.PnpID != "PCI\\VEN_8086&DEV_1234" {
		t.Errorf("Expected PCI..., got %s", target.PnpID)
	}
}
