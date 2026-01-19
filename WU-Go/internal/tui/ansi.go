package tui

func Reset() string { return "\x1b[0m" }
func BgDarkGray() string { return "\x1b[100m" }
func ClearScreen() string { return "\x1b[2J\x1b[H" }
func HideCursor() string { return "\x1b[?25l" }
func ShowCursor() string { return "\x1b[?25h" }

// Palette mapping matching C# palette intent.
func Fg(c Color) string {
	switch c {
	case 0:
		return "\x1b[36m" // cyan
	case 1:
		return "\x1b[33m" // yellow
	case 2:
		return "\x1b[32m" // green
	case 3:
		return "\x1b[35m" // magenta
	case 4:
		return "\x1b[34m" // blue
	case 5:
		return "\x1b[37m" // white
	case 6:
		return "\x1b[36;2m" // dim cyan
	case 7:
		return "\x1b[33;2m"
	case 8:
		return "\x1b[32;2m"
	case 9:
		return "\x1b[35;2m"
	default:
		return "\x1b[37m"
	}
}
