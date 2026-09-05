import { describe, it, expect, vi, afterEach } from 'vitest'

// Older sass releases (e.g. 1.52, inside our declared range) expose the
// modern `compile`/`compileString` API only on the ESM default export, not
// as named exports. Simulate that namespace shape (default-only, no named
// `compile`) and confirm lib/assets.js still resolves and calls it via the
// `sassModule.default` fallback, instead of throwing
// "sass.compile is not a function".
vi.mock('sass', () => ({
  // `compile` is explicitly declared (as undefined) rather than simply
  // omitted: vitest's mocked-namespace proxy throws on access to a key the
  // factory never mentions, which would otherwise mask the real
  // `typeof sassModule.compile === 'function'` feature-detection this test
  // exists to exercise.
  compile: undefined,
  default: {
    compile: () => ({ css: '.mock-compiled{color:blue}' }),
    compileString: () => ({ css: '.mock-inline{color:blue}' }),
  },
}))

import { copyAssets } from '../../lib/assets.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  vi.resetModules()
  if (site) await site.cleanup()
})

describe('sass default-export-only namespace (older sass releases)', () => {
  it('copyAssets still compiles an .scss file via sassModule.default', async () => {
    site = await makeSite({
      'a/css/x.scss': '$c: red; b { color: $c }',
    })
    const result = await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      config: { dev: false, sass: { includePaths: [] } },
      logger: silentLogger,
    })
    expect(result.error).toBeUndefined()
    expect(await site.read('out/css/x.css')).toBe('.mock-compiled{color:blue}')
  })
})
