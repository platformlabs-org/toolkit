package matcher

import (
	"testing"
)

func TestPickRawMatchedHardwareId(t *testing.T) {
	hwids := []string{"PCI\\VEN_8086&DEV_1234", "PCI\\VEN_8086", "ACPI\\IDEA200A"}

	tests := []struct {
		signed string
		want   string
	}{
		{"PCI\\VEN_8086", "PCI\\VEN_8086"},
		{"PCI\\VEN_8086&DEV_1234", "PCI\\VEN_8086&DEV_1234"},
		{"PCI\\VEN_8086&DEV_1234&SUBSYS_00000000", "PCI\\VEN_8086&DEV_1234"}, // Prefix match
		{"NonExistent", "NonExistent"}, // Fallback to input if provided but not found
        {"", "PCI\\VEN_8086&DEV_1234"}, // Fallback to first if empty
	}

	for _, tt := range tests {
		got := PickRawMatchedHardwareId(tt.signed, hwids)
		if got != tt.want {
			t.Errorf("PickRawMatchedHardwareId(%q) = %q, want %q", tt.signed, got, tt.want)
		}
	}
}

func TestPickDisplayMatchedHardwareId(t *testing.T) {
	hwids := []string{
		"ACPI\\VEN_IDEA&DEV_200A",
		"ACPI\\IDEA200A",
		"*IDEA200A",
	}

	// Case 1: Prefer ACPI\IDEA200A over VEN_&_DEV
	got := PickDisplayMatchedHardwareId("ACPI\\VEN_IDEA&DEV_200A", hwids)
	want := "ACPI\\IDEA200A"
	if got != want {
		t.Errorf("PickDisplayMatchedHardwareId (Optimize ACPI) = %q, want %q", got, want)
	}

	// Case 2: Prefer "No Ampersand"
	hwids2 := []string{"FOO\\BAR&BAZ", "FOO\\BAR"}
	got2 := PickDisplayMatchedHardwareId("FOO\\BAR&BAZ", hwids2)
	want2 := "FOO\\BAR"
	if got2 != want2 {
		t.Errorf("PickDisplayMatchedHardwareId (No Amp) = %q, want %q", got2, want2)
	}
}
