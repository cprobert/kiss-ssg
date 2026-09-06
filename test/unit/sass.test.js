import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import loadSassDefault, {
  loadSass,
  pickModernApi,
  compileFile,
  compileSource,
  clearSassCache,
} from '../../lib/sass.js'

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

describe('memoised compilation', () => {
  let dir

  beforeEach(() => {
    clearSassCache()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-sass-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    clearSassCache()
  })

  const write = (name, body) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, body)
    return file
  }

  // The mtime granularity of a filesystem can be coarser than the gap between
  // two writes in a test, so an edit is stamped explicitly rather than raced.
  const edit = (file, body) => {
    fs.writeFileSync(file, body)
    const future = new Date(Date.now() + 2000)
    fs.utimesSync(file, future, future)
  }

  it('returns the same CSS for a repeated compile', () => {
    const file = write('a.scss', '$c: red; a { color: $c }')
    const first = compileFile(file)
    const second = compileFile(file)
    expect(second).toBe(first)
    expect(first).toContain('color: red')
  })

  it('recompiles when the stylesheet itself changes', () => {
    const file = write('a.scss', 'a { color: red }')
    expect(compileFile(file)).toContain('red')
    edit(file, 'a { color: blue }')
    expect(compileFile(file)).toContain('blue')
  })

  // The reason the cache validates every loaded url rather than just the
  // entry: under `watch`, the edit usually lands in an imported partial.
  it('recompiles when an imported partial changes', () => {
    const partial = write('_vars.scss', '$c: red;')
    const entry = write('b.scss', "@use './vars' as v; a { color: v.$c }")
    expect(compileFile(entry)).toContain('red')
    edit(partial, '$c: blue;')
    expect(compileFile(entry)).toContain('blue')
  })

  it('keys on the compile options, not just the file', () => {
    const file = write('c.scss', 'a { b { color: red } }')
    const expanded = compileFile(file, { style: 'expanded' })
    const compressed = compileFile(file, { style: 'compressed' })
    expect(compressed).not.toBe(expanded)
    expect(compressed.length).toBeLessThan(expanded.length)
  })

  it('caches an inline block on its source', () => {
    const src = '$c: green; a { color: $c }'
    expect(compileSource(src)).toBe(compileSource(src))
    expect(compileSource(src)).toContain('green')
  })

  it('does not confuse two different inline blocks', () => {
    expect(compileSource('a { color: red }')).toContain('red')
    expect(compileSource('a { color: blue }')).toContain('blue')
  })

  it('serves a fresh compile after the cache is cleared', () => {
    const file = write('d.scss', 'a { color: red }')
    const before = compileFile(file)
    clearSassCache()
    expect(compileFile(file)).toBe(before)
  })
})
