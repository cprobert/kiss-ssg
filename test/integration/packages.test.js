import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { formatReport } from '../../lib/build-report.js'
import { makeSite } from '../helpers/site.js'
import { readZipEntries } from '../helpers/zip.js'

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  vi.unstubAllEnvs()
  site = null
  kiss = null
})

// A course of two lessons. Lesson one's first page reaches for every kind of
// file a page can need, and links out in every way a package cannot follow;
// lesson two's pages need nothing outside their own folder.
const TAB1 = `<html><head><title>One</title>
<link rel="stylesheet" href="../../css/site.css">
<style>.x { background: url(../../img/d.png) }</style></head><body>
<img src="../../img/a.png" srcset="../../img/a.png 1x, ../../img/b.png 2x">
<div style="background-image: url('../../img/c.png')"></div>
<video poster="../../img/e.png"></video>
<svg><use href="../../img/sprite.svg#i"></use></svg>
<iframe src="../../embed/frame.html"></iframe>
<img src="/img/a.png">
<img src="../../img/old.png">
<a href="tab-2.html">next</a>
<a href="/">home</a>
<a href="../l2/tab-1.html">lesson two</a>
<a href="../l2/">lesson two's folder</a>
<a href="https://example.org/">elsewhere</a>
</body></html>`

const FILES = {
  'src/pages/l1/tab-1.hbs': TAB1,
  'src/pages/l1/tab-2.hbs': '<html><body><p>Two</p></body></html>',
  'src/pages/l2/tab-1.hbs': '<html><body><p>Three</p></body></html>',
  'src/pages/l2/tab-2.hbs': '<html><body><p>Four</p></body></html>',
  'src/assets/css/site.css':
    '@import "more.css"; .a { background: url(../img/s.png) }',
  'src/assets/css/more.css': '.b { color: red }',
  'src/assets/img/a.png': 'a',
  'src/assets/img/b.png': 'b',
  'src/assets/img/c.png': 'c',
  'src/assets/img/d.png': 'd',
  'src/assets/img/e.png': 'e',
  'src/assets/img/s.png': 's',
  'src/assets/img/sprite.svg': '<svg/>',
  'src/assets/embed/frame.html':
    '<link rel="stylesheet" href="frame.css"><img src="f.png"><iframe src="loop.html"></iframe>',
  'src/assets/embed/loop.html': '<iframe src="frame.html"></iframe>',
  'src/assets/embed/frame.css': '.f { background: url(bg.png) }',
  'src/assets/embed/f.png': 'f',
  'src/assets/embed/bg.png': 'bg',
}

const lesson = (k, n) => {
  const tab = (t) => ({
    view: `${n}/tab-${t}.hbs`,
    path: `course/${n}`,
    slug: `tab-${t}`,
    id: `${n}/tab-${t}`,
    title: `${n} tab ${t}`,
    package: n,
  })
  return k.page(tab(1)).page(tab(2))
}

async function build(
  config = {},
  { files = FILES, register = (k) => lesson(lesson(k, 'l1'), 'l2') } = {},
) {
  site = await makeSite(files)
  kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com/',
    logger: silentLogger,
    ...config,
  })
  register(kiss).generate()
  await kiss.complete()
  return kiss
}

const zipAt = (rel) => readZipEntries(fs.readFileSync(`${site.build}/${rel}`))
const names = (entries) => [...entries.keys()].sort()

describe('learning packages', () => {
  it('writes one IMS content package per package, by convention', async () => {
    await build()
    expect(fs.readdirSync(`${site.build}/packages`).sort()).toEqual([
      'l1.imscp.zip',
      'l2.imscp.zip',
    ])
  })

  it('packs a page with every file it needs, from the folder that holds them all', async () => {
    await build()
    expect(names(zipAt('packages/l1.imscp.zip'))).toEqual([
      'course/l1/tab-1.html',
      'course/l1/tab-2.html',
      'css/more.css',
      'css/site.css',
      'embed/bg.png',
      'embed/f.png',
      'embed/frame.css',
      'embed/frame.html',
      'embed/loop.html',
      'img/a.png',
      'img/b.png',
      'img/c.png',
      'img/d.png',
      'img/e.png',
      'img/s.png',
      'img/sprite.svg',
      'imsmanifest.xml',
    ])
  })

  it('packs a lesson that needs nothing else from its own folder', async () => {
    await build()
    expect(names(zipAt('packages/l2.imscp.zip'))).toEqual([
      'imsmanifest.xml',
      'tab-1.html',
      'tab-2.html',
    ])
  })

  it('roots a package above every folder a reference passes through, so its URLs still work', async () => {
    // From course/l2/, `../l2/a.png` climbs to course/ and comes back: the zip must hold course/ too.
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><body><img src="../l2/a.png"></body></html>',
      'src/assets/course/l2/a.png': 'a',
    }
    await build({}, { files })
    expect(names(zipAt('packages/l2.imscp.zip'))).toEqual([
      'imsmanifest.xml',
      'l2/a.png',
      'l2/tab-1.html',
      'l2/tab-2.html',
    ])
  })

  it('roots a package above a climb written with percent-escapes', async () => {
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><body><img src="%2e%2e/l2/a.png"></body></html>',
      'src/assets/course/l2/a.png': 'a',
    }
    await build({}, { files })
    expect(names(zipAt('packages/l2.imscp.zip'))).toEqual([
      'imsmanifest.xml',
      'l2/a.png',
      'l2/tab-1.html',
      'l2/tab-2.html',
    ])
  })

  it('groups the members under their packageSection in the table of contents', async () => {
    const register = (k) =>
      k
        .page({
          view: 'l2/tab-1.hbs',
          path: 'c',
          slug: 'one',
          id: 'one',
          title: 'One',
          package: 'p',
          packageSection: 'Part A',
        })
        .page({
          view: 'l2/tab-2.hbs',
          path: 'c',
          slug: 'two',
          id: 'two',
          title: 'Two',
          package: 'p',
          packageSection: 'Part B',
        })
    await build({}, { register })
    const manifest = zipAt('packages/p.imscp.zip')
      .get('imsmanifest.xml')
      .toString()
    expect(
      [...manifest.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]),
    ).toEqual(['One', 'Part A', 'One', 'Part B', 'Two'])
    expect(manifest).toMatch(
      /<item identifier="ITEM-SECTION-[^"]*">\s*<title>Part A<\/title>/,
    )
  })

  it('lists the members in registration order, each with the files it reached first', async () => {
    await build()
    const manifest = zipAt('packages/l1.imscp.zip')
      .get('imsmanifest.xml')
      .toString()
    expect(
      [...manifest.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]),
    ).toEqual(['l1 tab 1', 'l1 tab 1', 'l1 tab 2'])
    expect(
      [...manifest.matchAll(/identifierref="([^"]+)"/g)].map((m) => m[1]),
    ).toEqual([
      expect.stringMatching(/^RES-l1-tab-1-[0-9a-f]{8}$/),
      expect.stringMatching(/^RES-l1-tab-2-[0-9a-f]{8}$/),
    ])
    const res = manifest.split('<resource ').slice(1)
    expect(res[0]).toContain('<file href="course/l1/tab-1.html"/>')
    expect(res[0]).toContain('<file href="embed/f.png"/>')
    expect(res[1].match(/<file /g)).toHaveLength(1)
  })

  it('reports what a package cannot carry, and packs none of it', async () => {
    await build()
    const report = kiss.report()
    const l1 = report.packages.find((p) => p.id === 'l1')
    expect(
      l1.outside.map(({ href, reason }) => [href, reason.split(':')[0]]),
    ).toEqual([
      ['../../img/old.png', 'not written by this build'],
      ['../l2/', 'a folder link'],
      ['../l2/tab-1.html', 'a link to a page outside the package'],
      ['/', 'root-relative'],
      ['/img/a.png', 'root-relative'],
    ])
    expect(
      l1.outside.every((o) => o.page === `${site.build}/course/l1/tab-1.html`),
    ).toBe(true)
  })

  it('reports a link between member pages in a SCORM package only, and still packs both', async () => {
    await build({ packages: { format: ['imscp', 'scorm12'] } })
    const l1 = (format) =>
      kiss.report().packages.find((p) => p.id === 'l1' && p.format === format)
    const between = (p) =>
      p.outside.filter((o) => o.reason.startsWith('a link between SCOs'))
    expect(between(l1('imscp'))).toEqual([])
    expect(between(l1('scorm12'))).toEqual([
      {
        page: `${site.build}/course/l1/tab-1.html`,
        href: 'tab-2.html',
        reason: expect.stringMatching(/table of contents/),
      },
    ])
    expect(l1('scorm12').outside).toHaveLength(l1('imscp').outside.length + 1)
    expect(names(zipAt('packages/l1.scorm12.zip'))).toContain(
      'course/l1/tab-2.html',
    )
  })

  it('reports each package with its hash, last in the report, and says so in the summary', async () => {
    await build()
    const report = kiss.report()
    expect(Object.keys(report).at(-1)).toBe('packages')
    const l2 = report.packages.find((p) => p.id === 'l2')
    expect(l2).toMatchObject({
      id: 'l2',
      format: 'imscp',
      file: `${site.build}/packages/l2.imscp.zip`,
      title: 'l2 tab 1',
      files: 3,
    })
    expect(l2.pages).toEqual([
      `${site.build}/course/l2/tab-1.html`,
      `${site.build}/course/l2/tab-2.html`,
    ])
    expect(l2.hash).toBe(
      createHash('sha1').update(fs.readFileSync(l2.file)).digest('hex'),
    )
    expect(formatReport(report)).toContain(
      `package: ${site.build}/packages/l2.imscp.zip (2 pages, 3 files)`,
    )
  })

  it('gives the same bytes for the same site, built twice', async () => {
    await build()
    const first = fs.readFileSync(`${site.build}/packages/l1.imscp.zip`)
    await kiss.close()
    await site.cleanup()
    await build()
    expect(
      Buffer.compare(
        fs.readFileSync(`${site.build}/packages/l1.imscp.zip`),
        first,
      ),
    ).toBe(0)
  })

  it('takes its settings from config.packages: off, one package, a title, a folder, two formats', async () => {
    await build({ packages: false })
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
    expect(kiss.report().packages).toBeNull()
    await kiss.close()
    await site.cleanup()

    const notice = vi.fn()
    await build({
      packages: {
        only: ['l2', 'nope'],
        dir: 'out/zips',
        format: ['imscp', 'scorm12'],
        title: (id, pages) => `${id}: ${pages.length} pages`,
      },
      logger: { ...silentLogger, notice },
    })
    expect(fs.readdirSync(`${site.build}/out/zips`).sort()).toEqual([
      'l2.imscp.zip',
      'l2.scorm12.zip',
    ])
    expect(
      zipAt('out/zips/l2.scorm12.zip').get('imsmanifest.xml').toString(),
    ).toContain('<title>l2: 2 pages</title>')
    expect(notice).toHaveBeenCalledWith(expect.stringMatching(/nope/))
  })

  it('never packs a stale file or an earlier zip, even when a page links to it', async () => {
    await build({ cleanBuild: false })
    fs.writeFileSync(`${site.build}/img/old.png`, 'stale')
    const before = fs.readFileSync(`${site.build}/packages/l1.imscp.zip`)
    await kiss.close()
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com/',
      logger: silentLogger,
      cleanBuild: false,
    })
    lesson(lesson(kiss, 'l1'), 'l2').generate()
    await kiss.complete()
    const entries = zipAt('packages/l1.imscp.zip')
    expect(entries.has('img/old.png')).toBe(false)
    expect([...entries.keys()].some((n) => n.endsWith('.zip'))).toBe(false)
    expect(
      Buffer.compare(
        fs.readFileSync(`${site.build}/packages/l1.imscp.zip`),
        before,
      ),
    ).toBe(0)
  })

  it('promotes the packages under an atomic build, and discards them in check mode', async () => {
    await build({ cleanBuild: 'atomic' })
    expect(fs.existsSync(`${site.build}/packages/l1.imscp.zip`)).toBe(true)
    await kiss.close()
    await site.cleanup()

    vi.stubEnv('KISS_CHECK', '1')
    await build()
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
    expect(kiss.report().packages.map((p) => p.file)).toContain(
      `${site.build}/packages/l1.imscp.zip`,
    )
  })

  it("resolves a page's references against its relative <base href>, and reports an absolute one", async () => {
    const files = {
      ...FILES,
      // Lesson two's first page: its image is in img/, through its base; its second page's base is absolute.
      'src/pages/l2/tab-1.hbs':
        '<html><head><base href="../../img/"></head><body><img src="a.png"><a href="../course/l2/tab-2.html">next</a></body></html>',
      'src/pages/l2/tab-2.hbs':
        '<html><head><base href="https://cdn.example.org/x/"></head><body><img src="b.png"></body></html>',
    }
    await build({}, { files })
    const l2 = kiss.report().packages.find((p) => p.id === 'l2')
    expect(names(zipAt('packages/l2.imscp.zip'))).toEqual([
      'course/l2/tab-1.html',
      'course/l2/tab-2.html',
      'img/a.png',
      'imsmanifest.xml',
    ])
    expect(
      l2.outside.map(({ href, reason }) => [href, reason.split(':')[0]]),
    ).toEqual([['https://cdn.example.org/x/', 'an absolute base URL']])
  })

  it('fails the build for a member page with no usable id, and names it', async () => {
    const register = (k) =>
      k
        .page({ view: 'l2/tab-1.hbs', path: 'a', package: 'p' })
        .page({ view: 'l2/tab-1.hbs', path: 'b', package: 'p' })
    await expect(build({}, { register })).rejects.toThrow(/<packages>/)
    expect(
      kiss
        .report()
        .failures.map((f) => f.message)
        .join('\n'),
    ).toMatch(/a\/tab-1\.html.*no usable id/s)
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
  })

  it('writes no package at all when a later package fails, under a build that is not atomic', async () => {
    // Lesson two's first page needs a file named imsmanifest.xml at its package's root.
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><body><img src="imsmanifest.xml"></body></html>',
      'src/assets/course/l2/imsmanifest.xml': '<x/>',
    }
    await expect(build({}, { files })).rejects.toThrow(/<packages>/)
    expect(
      kiss
        .report()
        .failures.map((f) => f.message)
        .join('\n'),
    ).toMatch(/package 'l2'.*imsmanifest\.xml/s)
    expect(fs.existsSync(`${site.build}/packages/l1.imscp.zip`)).toBe(false)
  })

  it('fails the build for a package id that is not a slug', async () => {
    const register = (k) =>
      k.page({ view: 'l2/tab-1.hbs', id: 'x', package: 'Not A Slug' })
    await expect(build({}, { register })).rejects.toThrow()
    expect(
      kiss
        .report()
        .failures.map((f) => f.message)
        .join('\n'),
    ).toMatch(/package.*Not A Slug/)
  })

  it('writes no package when a page failed, and reports that failure once', async () => {
    const register = (k) =>
      lesson(k, 'l2').page({
        view: 'l2/tab-1.hbs',
        path: 'z',
        id: 'z',
        package: 'l2',
        controller: () => {
          throw new Error('boom')
        },
      })
    await expect(build({}, { register })).rejects.toThrow()
    expect(kiss.report().failures).toHaveLength(1)
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
  })
})
