package cli

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

func PromptIndexSelection(title string, items []string, allowEmpty bool, multi bool) ([]int, error) {
	fmt.Println("\n" + strings.Repeat("=", 100))
	fmt.Println(title)
	fmt.Println(strings.Repeat("-", 100))
	if len(items) == 0 {
		fmt.Println("(无可选项)")
		return []int{}, nil
	}
	for i, it := range items {
		fmt.Printf("[%5d] %s\n", i+1, it)
	}
	fmt.Println(strings.Repeat("-", 100))

	hint := "输入序号"
	if multi {
		hint = "输入 a 全选；支持 1,3,5 或 2-6"
	}
	if allowEmpty {
		hint += "；回车=不选"
	}

	in := bufio.NewReader(os.Stdin)
	for {
		fmt.Print(hint + ": ")
		expr, _ := in.ReadString('\n')
		expr = strings.TrimSpace(expr)
		if allowEmpty && expr == "" {
			return []int{}, nil
		}

		var idxs []int
		var err error
		if multi {
			idxs, err = parseIndexExpr(expr, len(items))
		} else {
			n, e := strconv.Atoi(expr)
			if e != nil {
				err = fmt.Errorf("需要整数序号")
			} else {
				idxs = []int{n - 1}
			}
		}
		if err != nil {
			fmt.Println("输入有误：" + err.Error())
			continue
		}

		ok := true
		for _, i := range idxs {
			if i < 0 || i >= len(items) {
				ok = false
				break
			}
		}
		if !ok {
			fmt.Println("序号超范围。")
			continue
		}
		if !allowEmpty && len(idxs) == 0 {
			fmt.Println("至少选择一个。")
			continue
		}

		return idxs, nil
	}
}

func parseIndexExpr(expr string, n int) ([]int, error) {
	expr = strings.ToLower(strings.TrimSpace(expr))
	if expr == "a" || expr == "all" || expr == "*" {
		out := make([]int, n)
		for i := 0; i < n; i++ {
			out[i] = i
		}
		return out, nil
	}
	if expr == "" {
		return []int{}, nil
	}

	chosen := map[int]bool{}
	parts := strings.Split(expr, ",")
	reRange := regexp.MustCompile(`^(\d+)\s*-\s*(\d+)$`)
	reNum := regexp.MustCompile(`^\d+$`)

	for _, raw := range parts {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if m := reRange.FindStringSubmatch(t); len(m) == 3 {
			a, _ := strconv.Atoi(m[1])
			b, _ := strconv.Atoi(m[2])
			if a > b {
				a, b = b, a
			}
			for i := a; i <= b; i++ {
				if i >= 1 && i <= n {
					chosen[i-1] = true
				}
			}
			continue
		}
		if reNum.MatchString(t) {
			i, _ := strconv.Atoi(t)
			if i >= 1 && i <= n {
				chosen[i-1] = true
			}
			continue
		}
		return nil, fmt.Errorf("无法解析: %s", t)
	}

	out := make([]int, 0, len(chosen))
	for i := range chosen {
		out = append(out, i)
	}
	sort.Ints(out)
	return out, nil
}
