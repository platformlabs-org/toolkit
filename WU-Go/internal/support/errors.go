package support

import "errors"

type APIError struct{ Msg string }

func (e *APIError) Error() string { return e.Msg }
func NewAPIError(msg string) error { return &APIError{Msg: msg} }
func IsAPIError(err error) bool {
	_, ok := err.(*APIError)
	return ok
}

// Sentinel error for "user canceled" (q/Esc/Ctrl+C etc.)
var ErrCanceled = errors.New("canceled")
