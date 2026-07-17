import { dispatch } from './cli/dispatch.js'

// Use process.exitCode (not process.exit) so the event loop drains cleanly:
// calling process.exit() while @clack/prompts' spinner interval is active
// triggers a libuv assertion crash on Windows/Node. Let the loop end naturally.
dispatch(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n')
    process.exitCode = 1
  })
