package support

import (
	"context"
	"errors"
)

func IsCanceled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

func IsCanceledLike(err error) bool {
	return errors.Is(err, ErrCanceled)
}
