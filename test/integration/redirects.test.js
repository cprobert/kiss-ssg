import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
/** @type {any[]} */
let instances = []
afterEach(async () => {
  for (const kiss of instances) await kiss.close()
  if (site) await site.cleanup()
  vi.unstubAllEnvs()
  site = null
  instances = []
})

// Tracks every instance a test builds, so a test that records and then rebuilds
// still tears both of them down.
const track = (kiss) => {
  instances.push(kiss)
  return kiss
}
const last = () => instances[instances.length - 1]

const FILES = {
  'src/pages/index.hbs': 'home',
  'src/pages/about.hbs': 'about',
  'src/pages/post.hbs': '{{model.title}}',
  'src/models/posts/a.json': {
    title: 'Ay',
    slug: 'ay',
    // The record carries the alias. The `.pages()` registration below does not
    // — and carries one of its own that must never reach an item.
    aliases: ['/news/2024/ay.html?utm=1'],
  },
  'src/models/posts/b.json': { title: 'Bee', slug: 'bee' },
}

const buildSite = async ({ over = {}, aliases, onKiss } = {}) => {
  site = await makeSite(FILES)
  const kiss = track(
    new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
      ...over,
    }),
  )
  onKiss?.(kiss)
  kiss
    .page({ view: 'index.hbs' })
    .page({ view: 'about.hbs', aliases: aliases ?? ['/about-us/', '/team'] })
    .pages({
      view: 'post.hbs',
      model: 'posts',
      path: 'blog',
      controller: ({ model }) => ({ slug: model.slug }),
      aliases: ['/never-inherited'],
    })
    .generate()
  await kiss.complete()
  return kiss
}

describe('_redirects, written from page aliases', () => {
  it('writes one 301 per alias, sorted, and never inherits a .pages() alias', async () => {
    await buildSite()

    // Exactly these lines: the two from `.page()`, and the one the *record*
    // carried. `/never-inherited` was on the `.pages()` registration and
    // belongs to no page; `bee` has no alias and contributes nothing.
    expect(await site.read('public/_redirects')).toBe(
      [
        '/about-us/ /about 301',
        '/news/2024/ay.html /blog/ay 301',
        '/team /about 301',
      ].join('\n') + '\n',
    )
    expect(await site.read('public/_redirects')).not.toContain(
      'never-inherited',
    )
    expect(last().report().redirects).toEqual({
      file: `${site.build}/_redirects`,
      aliases: 3,
      removed: [],
      collisions: [],
    })
  })

  it('targets the path the sitemap lists, for an index page as well as a file page', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/courses/index.hbs': 'courses',
    })
    const kiss = track(
      new Kiss({
        folders: site.folders,
        siteUrl: 'https://e.com',
        logger: silentLogger,
      }),
    )
      .page({ view: 'index.hbs', aliases: ['/home.html'] })
      .page({ view: 'courses/index.hbs', aliases: ['/training'] })
      .generate()
      .sitemap()
    await kiss.complete()

    // `/courses/` and `/`, never `/courses/index` or `/index` — the two shapes
    // a naive `toCanonicalPath` gets wrong, and both 404 on Netlify.
    expect(await site.read('public/_redirects')).toBe(
      '/home.html / 301\n/training /courses/ 301\n',
    )
    const sitemap = await site.read('public/sitemap.xml')
    expect(sitemap).toContain('<loc>https://e.com/courses/</loc>')
    expect(sitemap).toContain('<loc>https://e.com/</loc>')
  })

  it('writes the same bytes twice, and is written before the atomic swap', async () => {
    // The ordering property, probed where it is decided: at the moment the
    // staged folder is swapped in, `_redirects` has to be *inside* it. Written
    // any later and the site is live for a window with none of its redirects,
    // which is the one promise `'atomic'` makes.
    let stagedRedirects = null
    await buildSite({
      over: { cleanBuild: 'atomic' },
      onKiss: (kiss) => {
        const promote = kiss._promote.bind(kiss)
        kiss._promote = async () => {
          if (kiss._stagingDir && stagedRedirects === null)
            stagedRedirects = await fs.pathExists(
              `${kiss._stagingDir}/_redirects`,
            )
          return promote()
        }
      },
    })
    const first = await site.read('public/_redirects')
    const report = last().report()

    expect(stagedRedirects).toBe(true)
    // Promoted with the rest of the folder: the file is there, and the report
    // names the folder the site asked for rather than the staging sibling.
    expect(report.redirects.file).toBe(`${site.build}/_redirects`)
    expect(JSON.stringify(report)).not.toContain('kiss-staging')

    await site.cleanup()
    await buildSite({ over: { cleanBuild: 'atomic' } })
    expect(await site.read('public/_redirects')).toBe(first)
  })

  it('names the real build folder under check mode, having published nothing', async () => {
    vi.stubEnv('KISS_CHECK', '1')
    await buildSite()
    const report = last().report()

    expect(report.mode).toBe('check')
    expect(report.redirects.file).toBe(`${site.build}/_redirects`)
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    expect(await site.exists('public/_redirects')).toBe(false)
    expect(await site.exists('public')).toBe(false)
    // And no staging sibling either: `fs.outputFile` creates its parents, so a
    // write that happened after `_discardStaging()` would *resurrect* the very
    // folder the check had just thrown away, beside the published output.
    expect(
      (await fs.readdir(site.root)).filter((name) => name.includes('.kiss-')),
    ).toEqual([])
  })

  it('is written again by a watch replay', async () => {
    await buildSite()
    await fs.remove(`${site.build}/_redirects`)

    // What an edited model or controller triggers: the whole site is replayed
    // from its registrations, and everything the build publishes is written
    // again — a replay that forgot this would publish a site with no redirects.
    await last()._replay()

    expect(await site.exists('public/_redirects')).toBe(true)
    expect(last().report().redirects.file).toBe(`${site.build}/_redirects`)
  })

  it('reports null, and writes nothing, for a site with neither aliases nor a record', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    const kiss = track(
      new Kiss({ folders: site.folders, logger: silentLogger }),
    )
      .scan()
      .generate()
    await kiss.complete()

    // `null` is "there was nothing to say", which is not the same as a verdict
    // of "no findings" — and no empty file is left behind.
    expect(kiss.report().redirects).toBeNull()
    expect(await site.exists('public/_redirects')).toBe(false)
  })

  it('reports an alias a live page already answers', async () => {
    const notices = []
    await buildSite({
      aliases: ['/about', '/index.html'],
      over: {
        logger: { ...silentLogger, notice: (msg) => notices.push(String(msg)) },
      },
    })

    // `/about` is the page's own canonical path and `/index.html` is a real
    // file: a non-forced rule at either source is silently skipped by the host.
    expect(last().report().redirects.collisions).toEqual([
      '/about',
      '/index.html',
    ])
    expect(notices).toContain('alias collides with a page: /about')
    // Advisory to the last: the build still passed.
    expect(last().report().ok).toBe(true)
  })
})

describe('the removed-without-a-redirect finding', () => {
  const record = () => vi.stubEnv('KISS_AIKB', '1')
  const stopRecording = () => vi.stubEnv('KISS_AIKB', '')

  // A site with a knowledge base, built once to record it and then rebuilt with
  // one page renamed — the rename the finding exists to catch.
  const recorded = async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/old-post.hbs': 'post',
    })
    record()
    const first = track(
      new Kiss({
        folders: { ...site.folders, aikb: `${site.root}/AIKB` },
        logger: silentLogger,
      }),
    )
      .scan()
      .generate()
    await first.complete()
    // The record is the baseline; the first build itself had nothing to
    // compare with, and no aliases.
    expect(await site.exists('AIKB/last-build.json')).toBe(true)
    expect(first.report().redirects).toBeNull()
    stopRecording()
  }

  const rebuildRenamed = async ({ aliases } = {}) => {
    await fs.remove(`${site.src}/pages/old-post.hbs`)
    await site.touch('src/pages/new-post.hbs', 'post')
    const kiss = track(
      new Kiss({
        folders: { ...site.folders, aikb: `${site.root}/AIKB` },
        logger: silentLogger,
      }),
    )
    kiss.page({ view: 'index.hbs' }).page({ view: 'new-post.hbs', aliases })
    kiss.generate()
    await kiss.complete()
    return kiss.report()
  }

  it('says nothing at all when a recorded site has not changed', async () => {
    await recorded()
    const kiss = track(
      new Kiss({
        folders: { ...site.folders, aikb: `${site.root}/AIKB` },
        logger: silentLogger,
      }),
    )
      .scan()
      .generate()
    await kiss.complete()

    // `null`, not an empty verdict — which is also what keeps two identical
    // records byte-identical: the first is written before there is a baseline
    // to read and the second after, and neither has anything to report.
    expect(kiss.report().redirects).toBeNull()
  })

  it('names the page the last record had and this build does not', async () => {
    await recorded()
    const report = await rebuildRenamed()

    expect(report.redirects).toEqual({
      file: null,
      aliases: 0,
      removed: ['/old-post.html'],
      collisions: [],
    })
    // The record is read, not `isRecorded()` — which `_buildAikb()` has just
    // made true one line earlier on a site's very first record.
    expect(report.aikb.written).toBe(false)
  })

  it('says nothing once an alias covers it, and writes the redirect instead', async () => {
    await recorded()
    const report = await rebuildRenamed({ aliases: ['/old-post'] })

    expect(report.redirects).toEqual({
      file: `${site.build}/_redirects`,
      aliases: 1,
      removed: [],
      collisions: [],
    })
    expect(await site.read('public/_redirects')).toBe(
      '/old-post /new-post 301\n',
    )
  })

  it('reads the baseline the last record wrote, not the one this build is writing', async () => {
    await recorded()
    // `kiss-ssg aikb` on a renamed site: the report is assembled *before*
    // `last-build.json` is replaced, so this build is measured against the
    // previous record rather than against itself — which would always be
    // empty, and the finding would never fire on the one run that matters.
    record()
    const report = await rebuildRenamed()

    expect(report.aikb.written).toBe(true)
    expect(report.redirects.removed).toEqual(['/old-post.html'])
    // ...and the record it just wrote carries the finding with it.
    const written = JSON.parse(await site.read('AIKB/last-build.json'))
    expect(written.redirects.removed).toEqual(['/old-post.html'])
  })

  it('treats a record it cannot parse as no baseline at all', async () => {
    await recorded()
    await site.touch('AIKB/last-build.json', '{ this is not json')

    const report = await rebuildRenamed()

    // No throw, no failure, and no finding invented out of an unreadable file.
    expect(report.ok).toBe(true)
    expect(report.redirects).toBeNull()
  })
})
