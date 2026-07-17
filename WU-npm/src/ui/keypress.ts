import readline from 'node:readline'

export interface Key {
  name: string
  ctrl: boolean
}

// Returns a cleanup function; puts stdin into raw+keypress mode and normalizes key names.
// Ctrl-C is surfaced to onKey as { name: 'c', ctrl: true } — the consumer decides how to exit
// (so it can restore terminal state, e.g. show the cursor, before quitting) rather than
// force-exiting here. In raw mode the terminal does not raise SIGINT, so this is the only path.
export function emitKeypress(onKey: (key: Key) => void): () => void {
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  const handler = (str: string, key: readline.Key | undefined) => {
    let name = key?.name ?? ''
    if (str === ' ') name = 'space'
    onKey({ name, ctrl: !!key?.ctrl })
  }

  process.stdin.on('keypress', handler)
  process.stdin.resume()

  return () => {
    process.stdin.off('keypress', handler)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
  }
}
