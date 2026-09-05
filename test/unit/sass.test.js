import { describe, it, expect, vi, afterEach } from 'vitest'
import sass from '../../lib/sass.js'

afterEach(() => {
  vi.doUnmock('sass')
  vi.resetModules()
})

describe('sass binding', () => {
  it('exposes the modern compile API', () => {
    expect(typeof sass.compile).toBe('function')
    expect(typeof sass.compileString).toBe('function')
    expect(sass.compileString('$c: red; a { color: $c }').css).toContain(
      'color: red',
    )
  })

  // Older sass releases (e.g. 1.52, inside our declared range) expose the
  // modern API only on the ESM default export, so simulate that namespace
  // shape (`compile` explicitly undefined rather than absent — vitest's mocked
  // namespace proxy throws on a key the factory never mentions, which would
  // mask the feature detection this test exists to exercise).
  it('falls back to the default export when the named compile is missing', async () => {
    vi.doMock('sass', () => ({
      compile: undefined,
      default: {
        compile: () => ({ css: '.mock-compiled{color:blue}' }),
        compileString: () => ({ css: '.mock-inline{color:blue}' }),
      },
    }))
    vi.resetModules()
    const { default: fallback } = await import('../../lib/sass.js')
    expect(fallback.compile().css).toBe('.mock-compiled{color:blue}')
    expect(fallback.compileString().css).toBe('.mock-inline{color:blue}')
  })
})
