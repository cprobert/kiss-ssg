import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

// Dev mode is asserted here too (atomic degrades to a plain clean build), and
// binding a real port for it is neither needed nor kind to the test run.
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))
const { default: Kiss } = await import('../helpers/kiss.js')

// Both siblings a staged build can leave behind: the staging folder and the
// previous output the promotion renames aside.
const staging = (dir) =>
  fs
    .readdirSync(dir)
    .filter(
      (name) => name.includes('.kiss-staging') || name.includes('.kiss-old'),
    )

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

describe("cleanBuild: 'atomic'", () => {
  it('leaves the previous output untouched until complete() resolves', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'new',
      'public/published.html': 'old',
      'public/gone.html': 'old',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    expect(await site.read('public/published.html')).toBe('old')

    let duringBuild = null
    kiss.scan().generate(() => {
      duringBuild = fs.readdirSync(site.build).sort()
    })
    await kiss.complete()

    expect(duringBuild).toEqual(['gone.html', 'published.html'])
    expect(fs.readdirSync(site.build)).toEqual(['index.html'])
    expect(await site.read('public/index.html')).toContain('new')
    expect(staging(site.root)).toEqual([])
  })

  it('leaves the previous output byte-identical when a page fails', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'fine',
      // An unknown block helper with an argument compiles, then throws at
      // render time — a failure after the wipe a plain clean build would do.
      'src/pages/broken.hbs': '{{#nope 1}}x{{/nope}}',
      'public/published.html': 'old',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()

    const err = await kiss.complete().catch((e) => e)
    // Named where the operator will look for it, not in the staging sibling.
    expect(err.message).toContain(`${site.build}/broken.html`)
    expect(err.message).not.toContain('kiss-staging')

    expect(fs.readdirSync(site.build)).toEqual(['published.html'])
    expect(await site.read('public/published.html')).toBe('old')
    expect(staging(site.root)).toEqual([])
  })

  it('promotes assets and sitemap.xml with the pages', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'src/assets/css/site.css': 'body{color:red}',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      siteUrl: 'https://example.com',
      logger: silentLogger,
    })
    kiss.scan().generate().sitemap()
    await kiss.complete()

    expect(await site.read('public/css/site.css')).toBe('body{color:red}')
    expect(await site.read('public/sitemap.xml')).toContain(
      '<loc>https://example.com/</loc>',
    )
    expect(staging(site.root)).toEqual([])
  })

  it('promotes an explicit copyAssets target inside the build folder', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'extra/logo.svg': '<svg/>',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.copyAssets(`${site.root}/extra`, `${site.build}/img`)
    kiss.scan().generate()
    await kiss.complete()

    expect(await site.read('public/img/logo.svg')).toBe('<svg/>')
    expect(staging(site.root)).toEqual([])
  })

  it('promotes once for the nested complete() pattern', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    let inner
    kiss.page({ view: 'index.hbs' }).generate(function () {
      inner = this.complete()
    })
    await kiss.complete()
    await inner

    expect(await site.exists('public/index.html')).toBe(true)
    expect(staging(site.root)).toEqual([])

    // A second build on the promoted instance builds into the real folder,
    // not into a staging directory nothing will ever swap in again.
    await site.touch('src/pages/second.hbs', 's')
    kiss.page({ view: 'second.hbs' }).generate()
    await kiss.complete()
    expect(await site.exists('public/second.html')).toBe(true)
    expect(staging(site.root)).toEqual([])
  })

  it('creates a build folder that did not exist yet', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    kiss = new Kiss({
      folders: { src: site.src, build: `${site.root}/out/nested` },
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()
    await kiss.complete()

    expect(await site.read('out/nested/index.html')).toContain('i')
    expect(staging(`${site.root}/out`)).toEqual([])
  })

  it('close() removes a staging directory a failed build left behind', async () => {
    site = await makeSite({
      'src/pages/broken.hbs': '{{#nope 1}}x{{/nope}}',
      'public/published.html': 'old',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()
    await expect(kiss.complete()).rejects.toThrow(/failed to build/)

    await kiss.close()
    expect(staging(site.root)).toEqual([])
    expect(await site.read('public/published.html')).toBe('old')
  })

  it('close() removes the staging directory of a build that never completed', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    let written = false
    kiss.scan().generate(() => {
      written = true
    })
    await waitFor(() => written)

    await kiss.close()
    expect(staging(site.root)).toEqual([])
    // Nothing was promoted: only complete() promotes a staged build.
    expect(await site.exists('public/index.html')).toBe(false)
  })

  it('degrades to a plain clean build in dev mode, with one notice', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'public/published.html': 'old',
    })
    const notices = []
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      dev: true,
      port: 0,
      logger: {
        ...silentLogger,
        notice: (...args) => notices.push(args.join(' ')),
      },
    })
    // Behaves as `true`: the build folder is emptied at construction.
    expect(await site.exists('public/published.html')).toBe(false)
    kiss.scan().generate()
    await kiss.complete()

    expect(notices.join('\n')).toMatch(/atomic/i)
    expect(await site.exists('public/index.html')).toBe(true)
    expect(staging(site.root)).toEqual([])
  })

  it('renames the previous output aside and removes it once the swap is done', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'new',
      'public/published.html': 'old',
    })
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()
    await kiss.complete()

    expect(fs.readdirSync(site.build)).toEqual(['index.html'])
    expect(staging(site.root)).toEqual([])
  })

  it('restores the previous output when the swap itself fails', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'new',
      'public/published.html': 'old',
      'public/deep/page.html': 'also old',
    })
    const before = fs.readdirSync(site.build).sort()
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()

    // The swap of staging into the target — and its cross-device fallback —
    // both fail: the previous output must come back exactly as it was.
    const realRename = fs.rename
    const rename = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (src, dest) => {
        if (src.includes('.kiss-staging'))
          throw Object.assign(new Error('simulated EXDEV'), { code: 'EXDEV' })
        return realRename(src, dest)
      })
    const move = vi
      .spyOn(fs, 'move')
      .mockRejectedValue(new Error('simulated move failure'))

    await expect(kiss.complete()).rejects.toThrow(/simulated move failure/)

    rename.mockRestore()
    move.mockRestore()
    expect(fs.readdirSync(site.build).sort()).toEqual(before)
    expect(await site.read('public/published.html')).toBe('old')
    expect(await site.read('public/deep/page.html')).toBe('also old')

    await kiss.close()
    expect(staging(site.root)).toEqual([])
  })

  it('removes a stale sibling left by a crashed earlier run, with a notice', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'i',
      'public/published.html': 'old',
      // Another process's pid: neither of these can belong to a live build.
      'public.kiss-staging-999999-abcdef/half.html': 'half-written',
      'public.kiss-old-999999-abcdef/published.html': 'stranded',
    })
    const notices = []
    kiss = new Kiss({
      folders: site.folders,
      cleanBuild: 'atomic',
      logger: {
        ...silentLogger,
        notice: (...args) => notices.push(args.join(' ')),
      },
    })

    // This build's own staging sibling is live; the crashed run's are gone.
    const leftovers = staging(site.root)
    expect(leftovers).not.toContain('public.kiss-staging-999999-abcdef')
    expect(leftovers).not.toContain('public.kiss-old-999999-abcdef')
    expect(leftovers.every((name) => name.includes(`-${process.pid}-`))).toBe(
      true,
    )
    expect(notices.join('\n')).toMatch(/kiss-staging-999999-abcdef/)
    expect(notices.join('\n')).toMatch(/kiss-old-999999-abcdef/)
    // The build itself is unaffected.
    expect(await site.read('public/published.html')).toBe('old')
    kiss.scan().generate()
    await kiss.complete()
    expect(fs.readdirSync(site.build)).toEqual(['index.html'])
  })
})

describe('the build folder is never allowed to swallow the source folder', () => {
  it('refuses to construct when the build folder is the source folder', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    expect(
      () =>
        new Kiss({
          folders: { src: site.src, build: site.src },
          logger: silentLogger,
        }),
    ).toThrow(/build folder/i)
  })

  it('refuses to construct when the build folder contains the source folder', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'i' })
    expect(
      () =>
        new Kiss({
          folders: { src: site.src, build: site.root },
          cleanBuild: false,
          logger: silentLogger,
        }),
    ).toThrow(/build folder/i)
  })
})

describe('the report after an atomic promotion', () => {
  it('names sitemap.xml and llms.txt against the real folder, not the staging sibling', async () => {
    // A promotion rewrites every stack entry's buildTo but recorded the sitemap
    // and llms paths while they were being written into staging. The report
    // has to map them back like every other path in it.
    site = await makeSite({ 'src/pages/index.hbs': '{{canonical}}' })
    kiss = new Kiss({
      logger: silentLogger,
      cleanBuild: 'atomic',
      siteUrl: 'https://e.com/',
      folders: site.folders,
    })
    kiss
      .page({ view: 'index.hbs', title: 'Home' })
      .generate()
      .sitemap()
      .llms({ title: 'Site', summary: 'One page.' })
    await kiss.complete()

    const report = kiss.report()
    expect(report.sitemap).toBe(`${site.build}/sitemap.xml`)
    expect(report.llms).toBe(`${site.build}/llms.txt`)
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    expect(staging(site.root)).toEqual([])
  })
})
