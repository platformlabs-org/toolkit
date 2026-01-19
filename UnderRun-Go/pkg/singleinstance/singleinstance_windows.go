//go:build windows

package singleinstance

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	moduser32 = windows.NewLazySystemDLL("user32.dll")

	procFindWindowW         = moduser32.NewProc("FindWindowW")
	procShowWindow          = moduser32.NewProc("ShowWindow")
	procSetForegroundWindow = moduser32.NewProc("SetForegroundWindow")
	procIsIconic            = moduser32.NewProc("IsIconic")
)

const (
	SW_RESTORE = 9
)

// CheckAndActivate tries to create a named mutex.
// If it fails (already exists), it finds the window by title, activates it, and returns true (meaning "already running").
// If it succeeds, it returns false (meaning "this is the first instance").
func CheckAndActivate(mutexName string, windowTitle string) bool {
	namePtr, err := windows.UTF16PtrFromString(mutexName)
	if err != nil {
		return false
	}

	// CreateMutexW(nil, true, name)
	// If the mutex already exists, the function returns a handle to the existing mutex
	// and GetLastError returns ERROR_ALREADY_EXISTS.
	// In Go's windows package, the error returned IS the result of GetLastError.
	handle, err := windows.CreateMutex(nil, true, namePtr)

	if handle == 0 {
		// Failed to create handle entirely?
		return false
	}

	// Check if it already existed
	if err == windows.ERROR_ALREADY_EXISTS {
		// Already running!
		activateWindow(windowTitle)
		return true // "Yes, it is already running"
	}

	// We own the mutex now. We don't close the handle here,
	// we let the OS clean it up when the process exits.
	return false // "No, this is new"
}

func activateWindow(title string) {
	titlePtr, _ := syscall.UTF16PtrFromString(title)

	// Find the window
	hwnd, _, _ := procFindWindowW.Call(
		0, // lpClassName (null)
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return
	}

	// Check if minimized
	ret, _, _ := procIsIconic.Call(hwnd)
	if ret != 0 {
		// Restore it
		procShowWindow.Call(hwnd, SW_RESTORE)
	} else {
		// Just show it (incase hidden/tray logic is complex, though SW_RESTORE usually handles standard hide)
		procShowWindow.Call(hwnd, SW_RESTORE)
	}

	procSetForegroundWindow.Call(hwnd)
}
