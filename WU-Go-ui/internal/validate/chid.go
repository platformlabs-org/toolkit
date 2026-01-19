package validate

import (
	"regexp"
	"strings"

	"WU-Go-ui/internal/support"
)

var guidCanonicalRegex = regexp.MustCompile(`^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$`)

func NormalizeCHIDsRequired(input []string) ([]string, error) {
	out := []string{}
	seen := map[string]bool{}

	for _, raw := range input {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if !guidCanonicalRegex.MatchString(s) {
			return nil, support.NewAPIError("CHID is not a valid GUID (requires 8-4-4-4-12 format): " + s)
		}
		core := s
		if strings.HasPrefix(core, "{") && strings.HasSuffix(core, "}") && len(core) > 2 {
			core = core[1 : len(core)-1]
		}
		norm := strings.ToLower(core)
		if !seen[norm] {
			seen[norm] = true
			out = append(out, norm)
		}
	}

	if len(out) == 0 {
		return nil, support.NewAPIError("At least 1 CHID is required.")
	}
	return out, nil
}
