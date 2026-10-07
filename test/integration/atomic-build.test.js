import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import fsp from 'node:fs/promises'
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
    expect(fs.readdirSync(site.build).sort()).toEqual([
      'index.html',
      'index.md',
    ])
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
    await expect(kiss.complete()).rejects.toThrow(/build failure/)

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

    expect(fs.readdirSync(site.build).sort()).toEqual([
      'index.html',
      'index.md',
    ])
    expect(staging(site.root)).toEqual([])
  })

  // The copy fallback exists for a build folder on another filesystem
  // (EXDEV). A lock is not that, and copying under one fails the same way
  // after doing far more work — so a locked swap never reaches fs.move.
  it('never falls back to copying when the swap fails on a lock', async () => {
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

    const realRename = fsp.rename
    const rename = vi
      .spyOn(fsp, 'rename')
      .mockImplementation(async (src, dest) => {
        if (String(src).includes('.kiss-staging'))
          throw Object.assign(new Error('simulated lock'), { code: 'EPERM' })
        return realRename(src, dest)
      })
    const move = vi.spyOn(fs, 'move')

    const err = await kiss.complete().catch((e) => e)
    const moved = move.mock.calls.length
    rename.mockRestore()
    move.mockRestore()

    expect(moved).toBe(0)
    expect(err?.message).toMatch(/open in another program/)
    expect(fs.readdirSync(site.build)).toEqual(['published.html'])
    expect(await site.read('public/published.html')).toBe('old')
    // Before close(): a one-shot build script never calls it, and the staged
    // copy of the whole site is litter from the moment the swap has failed.
    expect(staging(site.root)).toEqual([])
  })

  // What a real lock fails first: the rename that moves the published folder
  // aside, before the staged one is ever touched.
  it('removes the staged copy when the published folder cannot be moved aside', async () => {
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

    const realRename = fsp.rename
    const rename = vi
      .spyOn(fsp, 'rename')
      .mockImplementation(async (src, dest) => {
        if (String(dest).includes('.kiss-old'))
          throw Object.assign(new Error('simulated lock'), { code: 'EPERM' })
        return realRename(src, dest)
      })

    const err = await kiss.complete().catch((e) => e)
    rename.mockRestore()

    expect(err?.message).toMatch(/open in another program/)
    expect(fs.readdirSync(site.build)).toEqual(['published.html'])
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
    // The promotion renames through node:fs/promises, not fs-extra (whose
    // graceful-fs retries a locked rename for 60 s on Windows).
    const realRename = fsp.rename
    const rename = vi
      .spyOn(fsp, 'rename')
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
    expect(staging(site.root)).toEqual([])
  })

  // A preview server or an editor holding a file open in the build folder
  // makes Windows refuse to rename it. fs-extra's graceful-fs retries that
  // rename for 60 s before giving up, so the build sat silent for a minute and
  // then failed with a bare EPERM (measured 2026-09-28: 60136 ms). An open
  // file handle is the in-process stand-in for the lock: it fails a native
  // rename at once, where an fs.watch on the folder does not.
  it.skipIf(process.platform !== 'win32')(
    'fails fast and says why when a program holds the build folder open',
    async () => {
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

      const fd = fs.openSync(`${site.build}/published.html`, 'r')
      const started = Date.now()
      let err
      try {
        err = await Promise.race([
          kiss.complete().then(
            () => new Error('complete() resolved'),
            (e) => e,
          ),
          new Promise((resolve) =>
            setTimeout(
              () => resolve(new Error('complete() had not settled after 10 s')),
              10_000,
            ),
          ),
        ])
      } finally {
        fs.closeSync(fd)
      }

      expect(err.message).not.toMatch(/had not settled|resolved/)
      expect(Date.now() - started).toBeLessThan(10_000)
      // Names the folder, and what the operator can do about it.
      expect(err.message).toContain(site.build)
      expect(err.message).toMatch(/open in another program/)
      // Nothing was swapped: the previous output is exactly where it was.
      expect(fs.readdirSync(site.build)).toEqual(['published.html'])
      expect(await site.read('public/published.html')).toBe('old')
      expect(staging(site.root)).toEqual([])
    },
    30_000,
  )

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
    expect(fs.readdirSync(site.build).sort()).toEqual([
      'index.html',
      'index.md',
    ])
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
