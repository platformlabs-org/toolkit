//go:build !windows

package singleinstance

// CheckAndActivate is a no-op on non-Windows systems for now
func CheckAndActivate(mutexName string, windowTitle string) bool {
	return false
}
