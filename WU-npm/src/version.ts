// __WU_VERSION__ is injected at build time by tsup (define) from package.json.
// In dev/test (tsx, vitest) it is undefined and we fall back — typeof on an
// undeclared name is safe and never throws.
declare const __WU_VERSION__: string | undefined

export const VERSION: string =
  typeof __WU_VERSION__ !== 'undefined' ? __WU_VERSION__ : '0.0.0-dev'
