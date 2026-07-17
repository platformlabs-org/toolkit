import readline from 'node:readline'

export interface Key {
  name: string
  ctrl: boolean
}

// Returns cleanup function; puts stdin into raw+keypress mode, normalizes key names
export function emitKeypress(onKey: (key: Key) => void): () => void {
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  const handler = (str: string, key: readline.Key) => {
    let name = key?.name ?? ''
    if (str === ' ') name = 'space'
    if (key?.ctrl && key?.name === 'c') {
      cleanup()
      process.exit(130)
    }
    onKey({ name, ctrl: !!key?.ctrl })
  }

  process.stdin.on('keypress', handler)
  process.stdin.resume()

  const cleanup = () => {
    process.stdin.off('keypress', handler)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
  }
  return cleanup
}
