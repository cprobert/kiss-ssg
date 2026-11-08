import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// A framework stylesheet copied whole: rules the page uses, one a model
// supplies, one only a script adds, one only the safelist keeps, and rules
// nothing uses.
const VENDOR = [
  '.used{color:red}',
  '.from-model{color:green}',
  '.from-script{color:blue}',
  '.kept-by-safelist{color:purple}',
  '.never-used-one{color:orange}',
  '.never-used-two{margin:1px}',
].join('\n')

const files = {
  'src/pages/index.hbs':
    '<html><head><link rel="stylesheet" href="/{{asset "css/vendor.css"}}"></head><body><main><p class="used">hi</p><p class="{{model.kind}}">m</p><script src="/{{asset "js/app.js"}}" defer></script></main></body></html>',
  'src/assets/css/vendor.css': VENDOR,
  'src/assets/js/app.js':
    'document.querySelector("p").classList.add("from-script")\n',
}

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
})

const build = async (config = {}) => {
  site = await makeSite(files)
  kiss = new Kiss({ folders: site.folders, logger: silentLogger, ...config })
    .page({ view: 'index.hbs', model: { kind: 'from-model' } })
    .generate()
  await kiss.complete()
  return kiss.report()
}

const purge = { files: ['css/vendor.css'], safelist: ['kept-by-safelist'] }
const linked = async () =>
  (await site.read('public/index.html')).match(/href="\/([^"]+\.css)"/)[1]

describe('assets.purge', () => {
  it('removes the rules no written page or script uses, and keeps the rest', async () => {
    await build({ assets: { purge } })
    const css = await site.read(`public/${await linked()}`)
    expect(css).toContain('.used')
    expect(css).toContain('.from-model')
    expect(css).toContain('.from-script')
    expect(css).toContain('.kept-by-safelist')
    expect(css).not.toContain('never-used')
  })

  // Codex at the close (2026-11-05): a page kiss did not render, such as an
  // HTML file copied from the assets folder, uses the stylesheet too. Its
  // classes must survive, so the purge reads every .html in the build.
  it('keeps the rules a copied HTML page uses, not only the rendered pages', async () => {
    files['src/assets/legacy.html'] =
      '<html><head><link rel="stylesheet" href="/css/vendor.css"></head><body><p class="never-used-one">old page</p></body></html>'
    try {
      await build({ assets: { purge } })
      const css = await site.read(`public/${await linked()}`)
      expect(css).toContain('.never-used-one')
      expect(css).not.toContain('never-used-two')
    } finally {
      delete files['src/assets/legacy.html']
    }
  })

  it('re-hashes the purged file, rewrites the page to the new name, and removes the old file', async () => {
    const report = await build({ assets: { hash: true, purge } })
    const name = await linked()
    expect(name).toMatch(/^css\/vendor\.[0-9a-f]{8}\.css$/)
    expect(await site.exists(`public/${name}`)).toBe(true)
    const css = (await site.read(`public/${name}`)).trim()
    expect(css).not.toContain('never-used')
    const { contentHash } = await import('../../lib/asset-manifest.js')
    expect(name).toBe(`css/vendor.${contentHash(css)}.css`)
    // The pre-purge hashed file is gone: one stylesheet in the folder.
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(`${site.build}/css`)).toEqual([
      name.slice('css/'.length),
    ])
    expect(report.assets).toContainEqual({
      source: 'css/vendor.css',
      target: name,
    })
    // The link scan and the page hash saw the rewritten page.
    expect(report.links.broken).toEqual([])
    const { createHash } = await import('node:crypto')
    const page = report.pages.find((p) => p.buildTo.endsWith('index.html'))
    expect(page.hash).toBe(
      createHash('sha1')
        .update(await site.read('public/index.html'))
        .digest('hex'),
    )
  })

  it('writes the cache headers for the purged name, not the old one', async () => {
    const report = await build({
      host: 'netlify',
      assets: { hash: true, purge },
    })
    const name = await linked()
    expect(await site.read(`public/${name}`)).not.toContain('never-used')
    expect(report.cacheHeaders.rules.map((r) => r.path)).toContain(`/${name}`)
    expect(await site.read('public/_headers')).toContain(`/${name}`)
  })

  // Minifying before the purge strips these comments, so PurgeCSS never sees
  // them: the named stylesheet is purged first and minified once, after.
  it('honours /* purgecss ignore */ blocks, then minifies', async () => {
    site = await makeSite({
      ...files,
      'src/assets/css/vendor.css':
        VENDOR +
        '\n/* purgecss start ignore */\n.kept-by-comment { color: teal }\n/* purgecss end ignore */\n',
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: { purge },
    })
      .page({ view: 'index.hbs', model: { kind: 'from-model' } })
      .generate()
    await kiss.complete()
    const css = await site.read(`public/${await linked()}`)
    expect(css).toContain('.kept-by-comment')
    expect(css).not.toContain('never-used')
    expect(css).not.toContain('purgecss')
    expect(css).not.toMatch(/\n/)
  })

  it('leaves the whole stylesheet in dev', async () => {
    await build({ dev: true, assets: { purge } })
    expect(await site.read(`public/${await linked()}`)).toContain('never-used')
  })

  it('does nothing without assets.purge', async () => {
    await build({ assets: { hash: true } })
    expect(await site.read(`public/${await linked()}`)).toContain('never-used')
  })

  it('fails the build for a stylesheet that is not in the build', async () => {
    site = await makeSite(files)
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: { purge: { files: ['css/missing.css'] } },
    })
      .page({ view: 'index.hbs', model: { kind: 'x' } })
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(kiss.report().failures.map((f) => f.view)).toContain('<purge>')
  })

  // Issue #78, through a whole build: Tailwind class names holding `/ [ ] . :`
  // survive, and an unused one still goes.
  it('keeps the Tailwind classes a page uses, / [ ] . : and variants included', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '<html><head><link rel="stylesheet" href="/{{asset "css/site.css"}}"></head><body><main>' +
        '<div class="bg-ink-900/80 min-h-[60vh] p-1.5 hover:bg-brand-700">x</div>' +
        '<button aria-expanded="false" class="aria-expanded:rotate-180">y</button>' +
        '</main></body></html>',
      'src/assets/css/site.css': String.raw`.bg-ink-900\/80{color:red}.min-h-\[60vh\]{min-height:60vh}.p-1\.5{padding:.375rem}.hover\:bg-brand-700:hover{color:blue}.aria-expanded\:rotate-180[aria-expanded=true]{rotate:180deg}.never-used{margin:1px}`,
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: { purge: { files: ['css/site.css'] } },
    })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    const css = await site.read('public/css/site.css')
    for (const selector of [
      String.raw`.bg-ink-900\/80`,
      String.raw`.min-h-\[60vh\]`,
      String.raw`.p-1\.5`,
      String.raw`.hover\:bg-brand-700:hover`,
      String.raw`.aria-expanded\:rotate-180`,
    ])
      expect(css).toContain(selector)
    expect(css).not.toContain('never-used')
  })

  // The review of the first slice: a guard that judged selectors by their
  // classes alone failed this build, though PurgeCSS was right to remove both
  // rules (no #sidebar, no data-size="xl" on any page).
  it('passes a build whose purge rightly removes a rule for a class a page uses', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '<html><head><link rel="stylesheet" href="/{{asset "css/vendor.css"}}"></head><body><main><p class="card btn" data-size="l">x</p></main></body></html>',
      'src/assets/css/vendor.css':
        '#sidebar .card{color:red}.btn[data-size=xl]{padding:2rem}',
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: { purge: { files: ['css/vendor.css'] } },
    })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/css/vendor.css')).toBe('')
  })

  it('passes the same build once the safelist keeps the class', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '<html><head><link rel="stylesheet" href="/{{asset "css/vendor.css"}}"></head><body><main><p class="btn" data-size="l">x</p></main></body></html>',
      'src/assets/css/vendor.css': '.btn[data-size=xl]{padding:2rem}',
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: { purge: { files: ['css/vendor.css'], safelist: ['btn'] } },
    })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/css/vendor.css')).toContain('.btn')
  })

  it('purges inside the staging folder under cleanBuild: atomic, before the swap', async () => {
    await build({ cleanBuild: 'atomic', assets: { hash: true, purge } })
    const css = await site.read(`public/${await linked()}`)
    expect(css).not.toContain('never-used')
    expect(css).toContain('.used')
  })
})
