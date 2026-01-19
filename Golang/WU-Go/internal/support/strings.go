package support

import (
	"strconv"
	"strings"
)

func IsBlank(s string) bool { return strings.TrimSpace(s) == "" }
func Or(s, def string) string { if IsBlank(s) { return def }; return s }
func FirstNonEmpty(values ...string) string {
	for _, v := range values {
		if !IsBlank(v) {
			return v
		}
	}
	return ""
}
func ToLower(s string) string { return strings.ToLower(s) }
func ContainsLower(s, low string) bool { return strings.Contains(strings.ToLower(s), low) }
func Repeat(s string, n int) string { return strings.Repeat(s, n) }
func Itoa(i int) string { return strconv.Itoa(i) }
func PadRight(s string, w int) string {
	r := []rune(s)
	if len(r) >= w {
		return s
	}
	return s + strings.Repeat(" ", w-len(r))
}
func ParseIntStrict(s string) (int, error) {
	return strconv.Atoi(strings.TrimSpace(s))
}
func TryGetInt64(obj map[string]any, key string) (int64, bool) {
	v, ok := obj[key]
	if !ok || v == nil {
		return 0, false
	}
	switch t := v.(type) {
	case float64:
		return int64(t), true
	case int64:
		return t, true
	case int:
		return int64(t), true
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}
