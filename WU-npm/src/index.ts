import { run } from './app/run.js'

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    process.stderr.write((e as Error).message + '\n')
    process.exitCode = 1
  })
