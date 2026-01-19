package tui

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"golang.org/x/term"

	"WU/internal/format"
	"WU/internal/support"
)

type Legend struct {
	Tag        string
	Color      Color
	ItemCount  int
	SampleInfs []string
}

// Preferred entry: caller converts to []Legend.
func RunMultiSelectLegend(title string, legend []Legend, items []ListItem) ([]int, error) {
	if len(items) == 0 {
		return nil, support.NewAPIError("没有可选项")
	}

	fd := int(os.Stdin.Fd())
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		return nil, support.NewAPIError("无法进入 raw 模式: " + err.Error())
	}
	defer term.Restore(fd, oldState)

	fmt.Print(HideCursor())
	defer fmt.Print(ShowCursor())

	selected := map[int]bool{}
	cursor := 0
	top := 0

	for {
		draw(title, legend, items, selected, cursor, &top)

		key, err := readKey()
		if err != nil {
			return nil, err
		}

		switch key.kind {
		case keyUp:
			cursor = max(0, cursor-1)
		case keyDown:
			cursor = min(len(items)-1, cursor+1)
		case keyPgUp:
			cursor = max(0, cursor-10)
		case keyPgDn:
			cursor = min(len(items)-1, cursor+10)
		case keyHome:
			cursor = 0
		case keyEnd:
			cursor = len(items) - 1
		case keySpace:
			selected[cursor] = !selected[cursor]
		case keyChar:
			if key.ch == 'a' || key.ch == 'A' {
				selected = map[int]bool{}
				for i := 0; i < len(items); i++ {
					selected[i] = true
				}
			} else if key.ch == 'n' || key.ch == 'N' {
				selected = map[int]bool{}
			} else if key.ch == 'q' || key.ch == 'Q' {
				return nil, support.ErrCanceled

			}
		case keyEsc:
			return nil, support.ErrCanceled
		case keyEnter:
			if len(selected) == 0 {
				continue
			}
			idxs := make([]int, 0, len(selected))
			for i, v := range selected {
				if v {
					idxs = append(idxs, i)
				}
			}
			sort.Ints(idxs)
			return idxs, nil
		}
	}
}

func draw(title string, legend []Legend, items []ListItem, selected map[int]bool, cursor int, top *int) {
	fmt.Print(ClearScreen())

	width, height := format.TermSizeBestEffort()
	if width < 60 {
		width = 60
	}
	if height < 12 {
		height = 12
	}

	fmt.Println(truncRunes(title, width))

	if len(legend) > 1 {
		fmt.Print("Bundles: ")
		for i, l := range legend {
			fmt.Print(Fg(l.Color))
			infHint := ""
			if len(l.SampleInfs) > 0 {
				infHint = " (" + strings.Join(l.SampleInfs, ", ") + ")"
			}
			fmt.Print(l.Tag + ":" + support.Itoa(l.ItemCount) + infHint)
			fmt.Print(Reset())
			if i != len(legend)-1 {
				fmt.Print("  ")
			}
		}
		fmt.Println()
	}

	fmt.Println(truncRunes("↑↓移动  PgUp/PgDn跳转  Home/End  Space勾选  a全选  n清空  Enter确认  q退出", width))
	fmt.Println(strings.Repeat("-", min(width, 120)))

	viewH := height - 6
	if len(legend) <= 1 {
		viewH += 1
	}
	if viewH < 3 {
		viewH = 3
	}

	if cursor < *top {
		*top = cursor
	}
	if cursor >= *top+viewH {
		*top = cursor - viewH + 1
	}

	for row := 0; row < viewH; row++ {
		idx := *top + row
		if idx >= len(items) {
			break
		}

		item := items[idx]
		mark := "[ ]"
		if selected[idx] {
			mark = "[x]"
		}
		prefix := fmt.Sprintf("%s %5d ", mark, idx+1)
		line := truncRunes(prefix+item.Text, width)

		if idx == cursor {
			fmt.Print(BgDarkGray())
			fmt.Print(Fg(item.Color))
			fmt.Print(padRightRunes(line, width))
			fmt.Print(Reset())
			fmt.Println()
		} else {
			fmt.Print(Fg(item.Color))
			fmt.Println(line)
			fmt.Print(Reset())
		}
	}

	fmt.Println(strings.Repeat("-", min(width, 120)))

	selCount := 0
	for _, v := range selected {
		if v {
			selCount++
		}
	}
	fmt.Printf("已选 %d/%d | 当前 %d/%d\n", selCount, len(items), cursor+1, len(items))
}

func truncRunes(s string, width int) string {
	r := []rune(s)
	if len(r) <= width {
		return s
	}
	if width <= 1 {
		return string(r[:width])
	}
	return string(r[:width-1])
}

func padRightRunes(s string, width int) string {
	r := []rune(s)
	if len(r) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(r))
}

func min(a, b int) int { if a < b { return a }; return b }
func max(a, b int) int { if a > b { return a }; return b }
