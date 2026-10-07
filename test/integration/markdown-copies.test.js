import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

// `config.markdownCopies`: every HTML page the build writes gets a `.md` copy
// beside it, converted from the written HTML, and `llms.txt` links the copies.

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  site = null
  kiss = null
})

const LAYOUT =
  '<html><head><title>{{title}}</title></head><body><header><a href="/">Site</a></header><nav><a href="about.html">About</a></nav><main><h1>{{title}}</h1><p>See <a href="about.html">about</a>.</p></main><footer>© 2026</footer></body></html>'

const build = async (config = {}, register = (k) => k.scan()) => {
  kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com',
    logger: silentLogger,
    ...config,
  })
  register(kiss).generate().llms({ title: 'T', summary: 'S' })
  await kiss.complete()
  return kiss.report()
}

describe('markdownCopies', () => {
  it('writes a copy of each page’s <main> beside it, by default', async () => {
    site = await makeSite({
      'src/pages/index.hbs': LAYOUT,
      'src/pages/about.hbs': LAYOUT,
    })
    const report = await build()

    expect(await site.read('public/index.md')).toBe(
      '# Index\n\nSee [about](about.html).\n',
    )
    expect(report.pages.map((p) => p.markdown)).toEqual([
      `${site.build}/about.md`,
      `${site.build}/index.md`,
    ])
    // The copy's links are the page's own, and the page's were checked.
    expect(report.links.broken).toEqual([])
    expect(await site.read('public/llms.txt')).toContain(
      '[Index](https://e.com/index.md)',
    )
  })

  it('writes none under markdownCopies: false, and llms.txt links the pages', async () => {
    site = await makeSite({ 'src/pages/index.hbs': LAYOUT })
    const report = await build({ markdownCopies: false })

    expect(await site.exists('public/index.md')).toBe(false)
    expect(report.pages[0].markdown).toBeNull()
    expect(await site.read('public/llms.txt')).toContain(
      '[Index](https://e.com/)',
    )
  })

  it('lets one page opt out through its own config', async () => {
    site = await makeSite({
      'src/pages/index.hbs': LAYOUT,
      'src/pages/private.hbs': LAYOUT,
    })
    await build({}, (k) =>
      k
        .page({ view: 'index.hbs' })
        .page({ view: 'private.hbs', config: { markdownCopies: false } }),
    )

    expect(await site.exists('public/index.md')).toBe(true)
    expect(await site.exists('public/private.md')).toBe(false)
    const llms = await site.read('public/llms.txt')
    expect(llms).toContain('(https://e.com/index.md)')
    expect(llms).toContain('(https://e.com/private)')
  })

  it("merges a page's own block over the site's, not over the defaults", async () => {
    // A page that says only `{ write: true }` keeps the site's selector: the
    // page overrides the keys it names, as every per-page config key does.
    site = await makeSite({
      'src/pages/index.hbs':
        '<body><main><p>Chrome</p><article><h2>Post</h2></article></main></body>',
    })
    await build({ markdownCopies: { selector: 'article' } }, (k) =>
      k.page({
        view: 'index.hbs',
        config: { markdownCopies: { write: true } },
      }),
    )
    expect(await site.read('public/index.md')).toBe('## Post\n')
  })

  it('converts the element a selector names instead', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '<body><main><p>Chrome</p><article><h2>Post</h2></article></main></body>',
    })
    await build({ markdownCopies: { selector: 'article' } })
    expect(await site.read('public/index.md')).toBe('## Post\n')
  })

  it('writes no copy of a page that is not HTML', async () => {
    site = await makeSite({ 'src/pages/data.hbs': '{"a":1}' })
    const report = await build({}, (k) =>
      k.page({ view: 'data.hbs', ext: 'json' }),
    )
    expect(await site.exists('public/data.md')).toBe(false)
    expect(report.pages[0].markdown).toBeNull()
  })

  it('removes the old copy when a whole-site rebuild drops its page', async () => {
    site = await makeSite({
      'src/pages/about.hbs': LAYOUT,
      'src/controllers/about.mjs': "export default () => ({ slug: 's1' })",
    })
    await build({}, (k) =>
      k.page({ view: 'about.hbs', controller: 'about.mjs' }),
    )
    expect(await site.exists('public/s1.md')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 's2' })",
    )

    await waitFor(
      async () =>
        (await site.exists('public/s2.md')) &&
        !(await site.exists('public/s1.md')),
    )
    expect(await site.exists('public/s1.html')).toBe(false)
  })

  it('removes the copy of a page that stays but stops writing one', async () => {
    site = await makeSite({
      'src/pages/about.hbs': LAYOUT,
      'src/controllers/about.mjs': "export default () => ({ slug: 'a' })",
    })
    await build({}, (k) =>
      k.page({ view: 'about.hbs', controller: 'about.mjs' }),
    )
    expect(await site.exists('public/a.md')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 'a', config: { markdownCopies: false } })",
    )

    await waitFor(async () => !(await site.exists('public/a.md')))
    expect(await site.exists('public/a.html')).toBe(true)
  })

  it('keeps a copy the rebuild wrote again, though the page that had it is gone', async () => {
    // `x.html` and `x.htm` share one copy, `x.md`. When a rebuild swaps one
    // for the other, the old page is stale but its copy is the new page's.
    site = await makeSite({
      'src/pages/about.hbs': LAYOUT,
      'src/controllers/about.mjs':
        "export default () => ({ slug: 'x', ext: 'html' })",
    })
    await build({}, (k) =>
      k.page({ view: 'about.hbs', controller: 'about.mjs' }),
    )
    expect(await site.exists('public/x.md')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 'x', ext: 'htm' })",
    )

    await waitFor(
      async () =>
        (await site.exists('public/x.htm')) &&
        !(await site.exists('public/x.html')),
    )
    await waitFor(async () => !kiss._rebuildInFlight)
    expect(await site.exists('public/x.md')).toBe(true)
  })
})
