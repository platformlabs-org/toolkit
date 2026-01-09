package tui

import (
	"os"
)

type keyKind int

const (
	keyChar keyKind = iota
	keyUp
	keyDown
	keyPgUp
	keyPgDn
	keyHome
	keyEnd
	keySpace
	keyEnter
	keyEsc
)

type keyEvent struct {
	kind keyKind
	ch   rune
}

// raw read: supports ↑↓ PgUp PgDn Home End Space Enter Esc + char keys.
func readKey() (keyEvent, error) {
	var b [1]byte
	_, err := os.Stdin.Read(b[:])
	if err != nil {
		return keyEvent{}, err
	}

	// Enter
	if b[0] == '\r' || b[0] == '\n' {
		return keyEvent{kind: keyEnter}, nil
	}
	// Space
	if b[0] == ' ' {
		return keyEvent{kind: keySpace}, nil
	}
	// ESC
	if b[0] == 0x1b {
		// If not a sequence, treat as Esc.
		var x [1]byte
		_, _ = os.Stdin.Read(x[:])
		if x[0] != '[' {
			return keyEvent{kind: keyEsc}, nil
		}
		_, _ = os.Stdin.Read(x[:])

		switch x[0] {
		case 'A':
			return keyEvent{kind: keyUp}, nil
		case 'B':
			return keyEvent{kind: keyDown}, nil
		case 'H':
			return keyEvent{kind: keyHome}, nil
		case 'F':
			return keyEvent{kind: keyEnd}, nil
		case '5': // PgUp: [5~
			_, _ = os.Stdin.Read(x[:]) // ~
			return keyEvent{kind: keyPgUp}, nil
		case '6': // PgDn: [6~
			_, _ = os.Stdin.Read(x[:])
			return keyEvent{kind: keyPgDn}, nil
		case '1': // Home: [1~
			for {
				_, _ = os.Stdin.Read(x[:])
				if x[0] == '~' {
					break
				}
			}
			return keyEvent{kind: keyHome}, nil
		case '4': // End: [4~
			_, _ = os.Stdin.Read(x[:])
			return keyEvent{kind: keyEnd}, nil
		default:
			return keyEvent{kind: keyEsc}, nil
		}
	}

	return keyEvent{kind: keyChar, ch: rune(b[0])}, nil
}
