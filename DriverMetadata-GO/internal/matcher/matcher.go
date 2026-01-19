package matcher

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var acpiVenDevRegex = regexp.MustCompile(`(?i)^ACPI\\VEN_([A-Z0-9]{3})&DEV_([0-9A-F]{4})$`)

func FindCatPath(infName string) string {
	if infName == "" {
		return ""
	}
	// Path.ChangeExtension(infName, ".cat")
	ext := filepath.Ext(infName)
	catName := infName[:len(infName)-len(ext)] + ".cat"

	path := filepath.Join(
		`C:\Windows\System32\CatRoot\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}`,
		catName,
	)
	if _, err := os.Stat(path); err == nil {
		return path
	}
	return ""
}

func IsMatchedForDisplay(candidate, displayMatch, rawMatch string) bool {
	c := strings.TrimSpace(candidate)
	d := strings.TrimSpace(displayMatch)
	r := strings.TrimSpace(rawMatch)

	if d != "" && strings.EqualFold(c, d) {
		return true
	}

	if d == "" && r != "" && strings.EqualFold(c, r) {
		return true
	}

	return false
}

func PickRawMatchedHardwareId(signedHwid string, hwids []string) string {
	if hwids == nil {
		hwids = []string{}
	}
	signedHwid = strings.TrimSpace(signedHwid)

	if signedHwid != "" {
		// Exact match
		for _, h := range hwids {
			if strings.EqualFold(strings.TrimSpace(h), signedHwid) {
				return h
			}
		}

		// Prefix
		for _, h := range hwids {
			if h != "" && strings.HasPrefix(strings.ToUpper(h), strings.ToUpper(signedHwid)) {
				return h
			}
		}

		// Reverse Prefix (Longest first)
		sortedHwids := make([]string, len(hwids))
		copy(sortedHwids, hwids)
		sort.Slice(sortedHwids, func(i, j int) bool {
			return len(sortedHwids[i]) > len(sortedHwids[j])
		})

		for _, h := range sortedHwids {
			if h != "" && strings.HasPrefix(strings.ToUpper(signedHwid), strings.ToUpper(h)) {
				return h
			}
		}

		return signedHwid
	}

	// Fallback
	for _, h := range hwids {
		if strings.TrimSpace(h) != "" {
			return h
		}
	}
	return ""
}

func PickDisplayMatchedHardwareId(rawMatched string, hwids []string) string {
	if hwids == nil {
		hwids = []string{}
	}
	rawMatched = strings.TrimSpace(rawMatched)

	if rawMatched == "" {
		for _, h := range hwids {
			if strings.TrimSpace(h) != "" {
				return h
			}
		}
		return ""
	}

	// ACPI optimization
	m := acpiVenDevRegex.FindStringSubmatch(rawMatched)
	if len(m) > 2 {
		ven := strings.ToUpper(m[1])
		dev := strings.ToUpper(m[2])
		preferred := "ACPI\\" + ven + dev

		for _, h := range hwids {
			if strings.EqualFold(strings.TrimSpace(h), preferred) {
				return h
			}
		}
	}

	// No '&' and not starts with '*'
	for _, h := range hwids {
		if strings.TrimSpace(h) != "" && !strings.Contains(h, "&") && !strings.HasPrefix(strings.TrimSpace(h), "*") {
			return h
		}
	}

	// Exact match
	for _, h := range hwids {
		if strings.EqualFold(strings.TrimSpace(h), rawMatched) {
			return h
		}
	}

	return rawMatched
}
