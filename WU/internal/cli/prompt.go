package cli

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"

	"golang.org/x/term"

	"WU/internal/support"
)

func Prompt(label string) string {
	in := bufio.NewReader(os.Stdin)
	for {
		fmt.Print(label + ": ")
		s, _ := in.ReadString('\n')
		s = strings.TrimSpace(s)
		if s != "" {
			return s
		}
	}
}

func PromptWithDefault(label, def string) string {
	in := bufio.NewReader(os.Stdin)
	fmt.Printf("%s [%s]: ", label, def)
	s, _ := in.ReadString('\n')
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	return s
}

func PromptYesNo(label string, def bool) bool {
	in := bufio.NewReader(os.Stdin)
	d := "y/N"
	if def {
		d = "Y/n"
	}
	for {
		fmt.Printf("%s (%s): ", label, d)
		s, _ := in.ReadString('\n')
		s = strings.ToLower(strings.TrimSpace(s))
		if s == "" {
			return def
		}
		switch s {
		case "y", "yes", "1", "true":
			return true
		case "n", "no", "0", "false":
			return false
		}
	}
}

func PromptSecret(label string) string {
	fmt.Print(label + ": ")
	b, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return Prompt(label)
	}
	return string(b)
}

// ---- submission shortcut parsing (C# parity) ----

var digitsOnlyRegex = regexp.MustCompile(`\D+`)

func TryParseSubmissionShortcut(input string) (productID, submissionID string, ok bool) {
	s := strings.TrimSpace(input)
	if s == "" {
		return "", "", false
	}

	// 1) underscore tokens: token[1]=productId token[2]=submissionId
	tokens := []string{}
	for _, t := range strings.Split(s, "_") {
		t = strings.TrimSpace(t)
		if t != "" {
			tokens = append(tokens, t)
		}
	}
	if len(tokens) >= 3 {
		p := tokens[1]
		sub := tokens[2]
		if !support.IsBlank(p) && !support.IsBlank(sub) {
			return p, sub, true
		}
	}

	// 2) digits heuristic
	digits := digitsOnlyRegex.ReplaceAllString(s, "")
	if len(digits) < 19 {
		return "", "", false
	}
	sub := digits[len(digits)-19:]
	remain := digits[:len(digits)-19]
	if len(remain) >= 17 {
		p := remain[len(remain)-17:]
		return p, sub, true
	}
	return "", "", false
}
