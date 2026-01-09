package ui

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/briandowns/spinner"
	"github.com/fatih/color"
	"golang.org/x/term"
)

// Colors
var (
	gray   = color.New(color.FgHiBlack).SprintFunc()
	cyan   = color.New(color.FgCyan).SprintFunc()
	bold   = color.New(color.Bold).SprintFunc()
	blue   = color.New(color.FgBlue).SprintFunc()
	green  = color.New(color.FgGreen).SprintFunc()
	yellow = color.New(color.FgYellow).SprintFunc()
	orange = color.RGB(189, 91, 8).SprintFunc() // #bd5b08
	red    = color.New(color.FgRed).SprintFunc()
)

const line = "───────────────────"

type StepCtx struct {
	Title   string
	Current int
	Total   int
}

// Banner prints the tool name and version in Wrangler style
func Banner(tool, version string) {
	fmt.Printf("\n %s %s %s\n", cyan("⛅️"), bold(tool), gray(version))
	fmt.Println(gray(line))
}

// Section prints a section header
func Section(step StepCtx) {
	fmt.Println("")
	fmt.Printf("%s %s %s\n", gray("╭"), orange(step.Title), gray(fmt.Sprintf("Step %d of %d", step.Current, step.Total)))
	fmt.Println(gray("│"))
}

// Item prints an item in the section
// If value is empty, it just prints the label
// If value is provided, it prints label then indented value
func Item(label string, value ...string) {
	fmt.Printf("%s %s\n", gray("├"), label)
	for _, v := range value {
		fmt.Printf("%s %s %s\n", gray("│"), gray("dir"), v) // "dir" is hardcoded in example but maybe we want generic?
		// keeping generic:
		// fmt.Printf("%s %s\n", gray("│"), v)
	}
	fmt.Println(gray("│"))
}

// ItemValue prints a key-value pair
func ItemValue(key, value string) {
	fmt.Printf("%s %s\n", gray("├"), key)
	fmt.Printf("%s %s %s\n", gray("│"), gray("value"), value)
	fmt.Println(gray("│"))
}

// EndLine prints the closing line of a section
func EndLine(label string) {
	fmt.Printf("%s %s\n", gray("╰"), label)
}

func Info(msg string) {
	fmt.Printf("%s %s\n", blue("ℹ"), msg)
}

func Ok(msg string) {
	fmt.Printf("%s %s\n", green("✅"), msg)
}

func Warn(msg string) {
	fmt.Printf("%s %s\n", yellow("⚠️"), msg)
}

func Fail(msg string) {
	fmt.Printf("%s %s\n", red("❌"), msg)
}

// Spinner runs a task with a spinner
func Spin(label string, task func() error) error {
	s := spinner.New(spinner.CharSets[14], 100*time.Millisecond) // Dots
	s.Suffix = " " + label
	s.Color("cyan")
	s.Start()
	err := task()
	s.Stop()
	if err != nil {
		return err
	}
	return nil
}

// Prompt prompts the user for input with the Wrangler style
// Example:
// ├ In which directory do you want to create your application?
// │ dir ./my-worker
func Prompt(question string, def string) string {
	fmt.Printf("%s %s\n", gray("├"), question)

	prefix := "value"
	// To match wrangler "dir ./my-worker" style where user types after "dir "
	// We'll just use a generic prompt.

	promptLine := fmt.Sprintf("%s %s ", gray("│"), gray(prefix))
	if def != "" {
		promptLine = fmt.Sprintf("%s %s [%s] ", gray("│"), gray(prefix), def)
	}

	fmt.Print(promptLine)

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)

	if input == "" {
		return def
	}

	// Print the vertical line to close the look if we want, but usually prompt ends the interaction for that line.
	// But in Wrangler example, it continues.
	fmt.Println(gray("│"))

	return input
}

func PromptSecret(question string) string {
	fmt.Printf("%s %s\n", gray("├"), question)
	fmt.Printf("%s %s ", gray("│"), gray("secret"))

	bytePassword, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println() // Newline after password input
	fmt.Println(gray("│"))

	if err != nil {
		return ""
	}
	return string(bytePassword)
}

func PromptYesNo(question string, def bool) bool {
	fmt.Printf("%s %s\n", gray("├"), question)

	yv := "y/N"
	if def {
		yv = "Y/n"
	}

	fmt.Printf("%s %s (%s) ", gray("│"), gray("confirm"), yv)

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.ToLower(strings.TrimSpace(input))

	fmt.Println(gray("│"))

	if input == "" {
		return def
	}
	return input == "y" || input == "yes"
}
