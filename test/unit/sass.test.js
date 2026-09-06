import { describe, it, expect } from 'vitest'
import loadSassDefault, { loadSass, pickModernApi } from '../../lib/sass.js'

describe('sass binding', () => {
  it('exposes the modern compile API', () => {
    const sass = loadSass()
    expect(typeof sass.compile).toBe('function')
    expect(typeof sass.compileString).toBe('function')
    expect(sass.compileString('$c: red; a { color: $c }').css).toContain(
      'color: red',
    )
  })

  it('loads once and hands back the same binding', () => {
    expect(loadSass()).toBe(loadSass())
  })

  it('is also the default export', () => {
    expect(loadSassDefault).toBe(loadSass)
  })

  // The load is a synchronous `createRequire`, not an `import`, so the two
  // package layouts below cannot be simulated by mocking the module registry —
  // and no longer need to be. The detection is a pure function over whatever
  // shape the package hands back, so it is exercised directly.
  describe('pickModernApi', () => {
    it('prefers the named compile when the package exposes one', () => {
      // Reaching for `.default` on a modern sass triggers its own deprecation
      // warning, so the named export has to win even when both are present.
      const named = { compile: () => 'named', default: { compile: () => 'd' } }
      expect(pickModernApi(named)).toBe(named)
    })

    // Sass releases before 1.45 put the modern API only on the default export.
    it('falls back to the default export when the named compile is missing', () => {
      const legacy = {
        compile: undefined,
        default: {
          compile: () => ({ css: '.mock-compiled{color:blue}' }),
          compileString: () => ({ css: '.mock-inline{color:blue}' }),
        },
      }
      const picked = pickModernApi(legacy)
      expect(picked.compile().css).toBe('.mock-compiled{color:blue}')
      expect(picked.compileString().css).toBe('.mock-inline{color:blue}')
    })
  })
})
