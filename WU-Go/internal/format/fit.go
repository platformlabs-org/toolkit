package format

import "strings"

func Fit(s string, w int) string {
	if s == "" {
		s = ""
	}
	if w <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) == w {
		return s
	}
	if len(r) < w {
		return s + strings.Repeat(" ", w-len(r))
	}
	if w <= 1 {
		return string(r[:w])
	}
	return string(r[:w-1]) + "…"
}
