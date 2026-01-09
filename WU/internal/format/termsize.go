package format

import (
	"os"

	"golang.org/x/term"
)

func TermSizeBestEffort() (w, h int) {
	w, h, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || w <= 0 || h <= 0 {
		return 80, 24
	}
	// mimic Console.WindowWidth-1 / WindowHeight-1
	if w > 1 {
		w--
	}
	if h > 1 {
		h--
	}
	return w, h
}

func ConsoleWidthBestEffort(def int) int {
	w, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || w <= 0 {
		return def
	}
	if w > 1 {
		return w - 1
	}
	return w
}
