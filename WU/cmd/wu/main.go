package main

import (
	"os"

	"WU/internal/app"
	"WU/internal/cli"
)

func main() {
	opt, err := cli.ParseCLIOptions(os.Args[1:])
	if err != nil {
		cli.PrintErr(err)
		os.Exit(2)
	}
	os.Exit(app.Run(opt))
}
