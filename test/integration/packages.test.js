import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsx from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { formatReport, packageSize } from '../../lib/build-report.js'
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

  it('packs a file a stylesheet names with a CSS escape', async () => {
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><head><link rel="stylesheet" href="../../css/escaped.css"></head><body></body></html>',
      // One backslash before the space in the stylesheet: url("../img/my\ pic.png").
      'src/assets/css/escaped.css':
        '.x { background: url("../img/my\\ pic.png") }',
      'src/assets/img/my pic.png': 'p',
    }
    await build({}, { files })
    const l2 = kiss.report().packages.find((p) => p.id === 'l2')
    expect(l2.outside).toEqual([])
    expect(names(zipAt('packages/l2.imscp.zip'))).toContain('img/my pic.png')
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

  it("lists a member page another member embeds on the embedding page's resource", async () => {
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><body><iframe src="tab-2.html"></iframe></body></html>',
    }
    await build({}, { files })
    const manifest = zipAt('packages/l2.imscp.zip')
      .get('imsmanifest.xml')
      .toString()
    const [first] = manifest.split('<resource ').slice(1)
    expect(first).toContain('<file href="tab-1.html"/>')
    expect(first).toContain('<file href="tab-2.html"/>')
  })

  it('puts the SCORM 1.2 schema files in a SCORM package when config.packages.schemas is on', async () => {
    await build({ packages: { format: ['imscp', 'scorm12'], schemas: true } })
    const scorm = zipAt('packages/l2.scorm12.zip')
    for (const name of [
      'adlcp_rootv1p2.xsd',
      'imscp_rootv1p1p2.xsd',
      'ims_xml.xsd',
    ])
      expect(scorm.get(name).toString()).toBe(
        fs.readFileSync(
          new URL(`../../lib/schemas/scorm12/${name}`, import.meta.url),
          'utf8',
        ),
      )
    expect(scorm.get('imsmanifest.xml').toString()).toContain(
      'xsi:schemaLocation=',
    )
    // An IMS content package has another schema, and gets none of these.
    expect(
      names(zipAt('packages/l2.imscp.zip')).some((n) => n.endsWith('.xsd')),
    ).toBe(false)
    const l2 = (format) =>
      kiss.report().packages.find((p) => p.id === 'l2' && p.format === format)
    expect(l2('scorm12').files).toBe(l2('imscp').files + 3)
  })

  it("lists a file every member needs on each member's resource", async () => {
    const page =
      '<html><head><link rel="stylesheet" href="../../css/more.css"></head><body></body></html>'
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs': page,
      'src/pages/l2/tab-2.hbs': page,
    }
    await build({}, { files })
    const manifest = zipAt('packages/l2.imscp.zip')
      .get('imsmanifest.xml')
      .toString()
    const res = manifest.split('<resource ').slice(1)
    expect(res).toHaveLength(2)
    for (const r of res) expect(r).toContain('<file href="css/more.css"/>')
    // The zip still holds it once.
    expect(
      names(zipAt('packages/l2.imscp.zip')).filter((n) => n === 'css/more.css'),
    ).toHaveLength(1)
  })

  it('reports a reference in the wrong case, and does not pack it', async () => {
    const files = {
      ...FILES,
      'src/pages/l2/tab-1.hbs':
        '<html><body><img src="../../img/A.png"></body></html>',
    }
    await build({}, { files })
    const l2 = kiss.report().packages.find((p) => p.id === 'l2')
    const [finding] = l2.outside
    expect(finding.href).toBe('../../img/A.png')
    // A case-insensitive file system finds the file, so the case is the finding;
    // elsewhere the file is simply not there.
    const caseBlind =
      process.platform === 'win32' || process.platform === 'darwin'
    expect(finding.reason).toMatch(
      caseBlind
        ? /^a reference in the wrong case: /
        : /^not written by this build: /,
    )
    expect(
      names(zipAt('packages/l2.imscp.zip')).some((n) => /a\.png$/i.test(n)),
    ).toBe(false)
  })

  it("reports each package's size in bytes, and shows it in the summary", async () => {
    await build()
    const report = kiss.report()
    for (const p of report.packages)
      expect(p.bytes).toBe(fs.statSync(p.file).size)
    expect(formatReport(report)).toMatch(
      /package: .*l2\.imscp\.zip \(2 pages, 3 files, \d+(\.\d)? (B|KB)\)/,
    )
  })

  it('lists the members in registration order, each with the files it needs', async () => {
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

  it('logs each package it wrote, and each reference it left outside, in the build log', async () => {
    const info = []
    const notices = []
    await build({
      cleanBuild: 'atomic',
      logger: {
        ...silentLogger,
        info: (msg) => info.push(String(msg)),
        notice: (msg) => notices.push(String(msg)),
      },
    })
    const lines = info.filter((l) => l.startsWith('Package: '))
    const [l1, l2] = kiss.report().packages
    expect(lines).toEqual([
      `Package: ${site.build}/packages/l1.imscp.zip  l1 tab 1  (2 pages, ${l1.files} files, ${packageSize(l1.bytes)})`,
      `Package: ${site.build}/packages/l2.imscp.zip  l2 tab 1  (2 pages, 3 files, ${packageSize(l2.bytes)})`,
    ])
    // Named by the build folder, never by the staging folder an atomic build wrote it in.
    expect(lines.join('\n')).not.toMatch(/staging/)
    const outside = notices.filter((l) => l.startsWith('package outside: '))
    expect(outside).toHaveLength(kiss.report().packages[0].outside.length)
    expect(outside).toContain(
      'package outside: course/l1/tab-1.html -> /img/a.png (root-relative)',
    )
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

  it('packs a file a page links to for download, and lists it on the page', async () => {
    await build(
      {},
      {
        files: {
          ...FILES,
          'src/pages/l1/tab-2.hbs':
            '<html><body><a href="../../docs/handout.pdf">handout</a></body></html>',
          'src/assets/docs/handout.pdf': 'pdf',
        },
      },
    )
    expect(names(zipAt('packages/l1.imscp.zip'))).toContain('docs/handout.pdf')
    const l1 = kiss.report().packages.find((p) => p.id === 'l1')
    expect(l1.outside.map((o) => o.href)).not.toContain(
      '../../docs/handout.pdf',
    )
    const manifest = zipAt('packages/l1.imscp.zip')
      .get('imsmanifest.xml')
      .toString()
    const res = manifest.split('<resource ').slice(1)
    expect(res[1]).toContain('<file href="docs/handout.pdf"/>')
  })

  it("links a member page's {{link}} to the file, relative to it, on any site shape", async () => {
    await build(
      { extensionLess: true, links: { canonical: true, trailingSlash: false } },
      {
        files: {
          ...FILES,
          'src/pages/l1/tab-2.hbs':
            '<html><body><a href="{{link "l1/tab-1"}}">back</a><a href="{{link "l2/tab-1"}}">on</a></body></html>',
        },
      },
    )
    const page = fs.readFileSync(
      `${site.build}/course/l1/tab-2/index.html`,
      'utf8',
    )
    expect(page).toContain('href="../tab-1/index.html"')
    expect(page).toContain('href="../../l2/tab-1/index.html"')
    const outside = kiss
      .report()
      .packages.find((p) => p.id === 'l1')
      .outside.filter((o) => o.page.endsWith('tab-2/index.html'))
    // The member link is followed and kept; the other lesson is a page outside.
    expect(
      outside.map(({ href, reason }) => [href, reason.split(':')[0]]),
    ).toEqual([
      ['../../l2/tab-1/index.html', 'a link to a page outside the package'],
    ])
    expect(
      kiss.report().links.broken.filter((b) => b.page.includes('tab-2')),
    ).toEqual([])
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
      `package: ${site.build}/packages/l2.imscp.zip (2 pages, 3 files, ${packageSize(report.packages.find((p) => p.id === 'l2').bytes)})`,
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
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
  })

  it('leaves no zip and no temporary file behind when writing one fails midway', async () => {
    const rename = fsx.rename.bind(fsx)
    let calls = 0
    vi.spyOn(fsx, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('.zip') && ++calls === 2)
        throw new Error('EBUSY: locked')
      return rename(from, to)
    })
    await expect(
      build({ packages: { format: ['imscp', 'scorm12'] } }),
    ).rejects.toThrow(/<packages>/)
    vi.restoreAllMocks()
    expect(calls).toBe(2)
    expect(fs.existsSync(`${site.build}/packages`)).toBe(false)
  })

  // Under cleanBuild: false the zips being replaced are the last good ones: a
  // run that fails must leave them as they were, not delete the ones it reached.
  it('restores the zips an earlier build wrote when replacing them fails midway', async () => {
    const config = {
      cleanBuild: false,
      packages: { format: ['imscp', 'scorm12'] },
    }
    await build(config)
    const zips = ['l1.imscp.zip', 'l1.scorm12.zip', 'l2.imscp.zip']
    const before = zips.map((z) =>
      fs.readFileSync(`${site.build}/packages/${z}`),
    )
    await kiss.close()
    fs.writeFileSync(
      `${site.root}/src/pages/l1/tab-2.hbs`,
      '<html><body><p>Two, revised</p></body></html>',
    )
    const rename = fsx.rename.bind(fsx)
    let calls = 0
    vi.spyOn(fsx, 'rename').mockImplementation(async (from, to) => {
      if (String(from).endsWith('.tmp') && ++calls === 2)
        throw new Error('EBUSY: locked')
      return rename(from, to)
    })
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com/',
      logger: silentLogger,
      ...config,
    })
    lesson(lesson(kiss, 'l1'), 'l2').generate()
    await expect(kiss.complete()).rejects.toThrow(/<packages>/)
    vi.restoreAllMocks()
    expect(calls).toBe(2)
    expect(
      zips.map((z) => fs.readFileSync(`${site.build}/packages/${z}`)),
    ).toEqual(before)
    expect(fs.readdirSync(`${site.build}/packages`).sort()).toEqual(
      [...zips, 'l2.scorm12.zip'].sort(),
    )
  })

  it('reads and parses a file two member pages share once', async () => {
    const readFile = fsx.readFile.bind(fsx)
    const reads = []
    vi.spyOn(fsx, 'readFile').mockImplementation((file, ...rest) => {
      if (rest[0] === 'utf8') reads.push(String(file).replace(/\\/g, '/'))
      return readFile(file, ...rest)
    })
    await build(
      {},
      {
        files: {
          ...FILES,
          'src/pages/l2/tab-1.hbs':
            '<html><head><link rel="stylesheet" href="../../css/site.css"></head><body></body></html>',
          'src/pages/l2/tab-2.hbs':
            '<html><head><link rel="stylesheet" href="../../css/site.css"></head><body></body></html>',
        },
      },
    )
    vi.restoreAllMocks()
    // Lesson one's first page needs it too: one read across every package.
    expect(reads.filter((f) => f.endsWith('/css/site.css'))).toHaveLength(1)
    expect(names(zipAt('packages/l2.imscp.zip'))).toContain('css/site.css')
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
