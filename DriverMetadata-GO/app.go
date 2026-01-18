package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"DriverMetadata-GO/internal/catparser"
	"DriverMetadata-GO/internal/sysdriver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) GetSystemDrivers() ([]sysdriver.DriverInfo, error) {
	drivers, err := sysdriver.GetLenovoDrivers()
	if err != nil {
		return nil, err
	}

	// Populate Metadata for each driver
	for i := range drivers {
		if drivers[i].CatalogPath != "" {
			meta, err := catparser.ExtractMetadata(drivers[i].CatalogPath)
			if err == nil {
				for _, m := range meta {
					// Exclude HWID keys if needed, similar to C# logic
					// "if (!entry.Key.StartsWith("HWID", StringComparison.OrdinalIgnoreCase))"
					if !strings.HasPrefix(strings.ToUpper(m.Key), "HWID") {
						drivers[i].Metadata[m.Key] = m.Value
					}
				}
			}
		}
	}
	return drivers, nil
}

func (a *App) ScanFolder() ([]sysdriver.DriverInfo, error) {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Folder to Scan",
	})
	if err != nil || path == "" {
		return nil, fmt.Errorf("cancelled or error")
	}

	return a.scanPathForCats(path)
}

func (a *App) ScanFile() ([]sysdriver.DriverInfo, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select .cat File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Catalog Files (*.cat)", Pattern: "*.cat"},
		},
	})
	if err != nil || path == "" {
		return nil, fmt.Errorf("cancelled or error")
	}

	return a.scanPathForCats(path)
}

func (a *App) scanPathForCats(root string) ([]sysdriver.DriverInfo, error) {
	var results []sysdriver.DriverInfo

	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		// Single file
		return []sysdriver.DriverInfo{a.processSingleCat(root)}, nil
	}

	// Recursive directory walk
	err = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".cat") {
			results = append(results, a.processSingleCat(path))
		}
		return nil
	})

	return results, err
}

func (a *App) processSingleCat(path string) sysdriver.DriverInfo {
	info := sysdriver.DriverInfo{
		CatalogPath: path,
		DeviceName:  filepath.Base(path), // Use filename as device name placeholder
		Metadata:    make(map[string]string),
	}

	meta, err := catparser.ExtractMetadata(path)
	if err == nil {
		for _, m := range meta {
			if !strings.HasPrefix(strings.ToUpper(m.Key), "HWID") {
				info.Metadata[m.Key] = m.Value
			}
		}
	} else {
		// Mark as failed or empty?
		// We can just leave metadata empty.
	}
	return info
}
