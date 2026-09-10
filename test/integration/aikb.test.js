import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  site = null
  kiss = null
  vi.unstubAllGlobals()
  delete process.env.KISS_CHECK
})

const node = `"${process.execPath}"`
const EVENTS = 'https://api.example.com/v2/events?page=1'

// One site with every kind of subject in it: a `.json` file model, a models
// folder fanned out through a controller **file**, a URL model, and one asset
// pipeline step. Two of the three subjects already have a note, one does not,
// and there is a note whose subject was removed from the site long ago.
const files = {
  'src/pages/index.hbs': '<h1>{{title}}</h1>{{> card}}',
  'src/pages/member.hbs': '<p>{{model.name}}</p>{{> card}}',
  'src/pages/events.hbs': '<p>{{model.count}}</p>',
  'src/partials/card.hbs': '<div>card</div>',
  'src/models/index.json': { title: 'Home' },
  'src/models/team/a.json': { name: 'Ana', slug: 'ana' },
  'src/models/team/b.json': { name: 'Bo', slug: 'bo' },
  'src/controllers/member.js':
    'export default ({ model }) => ({ slug: model.slug })\n',
  'AIKB/notes/controllers/member.md': '## What it does\n\nDerives the slug.\n',
  'AIKB/notes/pipeline/stamp.md': '## What it does\n\nWrites a stamp.\n',
  'AIKB/notes/models/api.example.com-v1-old.md': '## What it does\n\nGone.\n',
}

const stubFetch = () =>
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => ({ count: 2 }),
  }))

const build = async () => {
  kiss = new Kiss({
    logger: silentLogger,
    siteUrl: 'https://e.com',
    folders: { ...site.folders, aikb: `${site.root}/AIKB` },
    assets: {
      pipeline: [{ name: 'stamp', run: `${node} -e "0"` }],
    },
  })
  kiss
    .page({ view: 'index.hbs', model: 'index.json' })
    .pages({
      view: 'member.hbs',
      model: 'team',
      path: 'team',
      controller: 'member.js',
    })
    .page({ view: 'events.hbs', model: EVENTS })
    .generate()
    .aikb()
  await kiss.complete()
  return kiss.report()
}

const readAikb = async () => ({
  readme: await site.read('AIKB/README.md'),
  mapMd: await site.read('AIKB/site-map.md'),
  mapJson: await site.read('AIKB/site-map.json'),
  lastBuild: await site.read('AIKB/last-build.json'),
})

describe('.aikb()', () => {
  it('writes the map, the report snapshot and the note verdict', async () => {
    site = await makeSite(files)
    stubFetch()
    const report = await build()

    // 1. The four generated files, plus the note that was already there.
    expect(await site.exists('AIKB/README.md')).toBe(true)
    expect(await site.exists('AIKB/site-map.md')).toBe(true)
    expect(await site.exists('AIKB/site-map.json')).toBe(true)
    expect(await site.exists('AIKB/last-build.json')).toBe(true)
    expect(await site.exists('AIKB/notes/controllers/member.md')).toBe(true)

    // 2. The report key: the appended verdict, and the two note findings.
    expect(Object.keys(report).at(-1)).toBe('aikb')
    expect(report.aikb.folder).toBe(`${site.root}/AIKB`)
    expect(report.aikb.written).toBe(true)
    expect(report.aikb.notes).toEqual({
      // The URL model is the one subject nobody has explained.
      missing: [`${site.root}/AIKB/notes/models/api.example.com-v2-events.md`],
      // ...and this note's subject is not in the site any more.
      dead: [`${site.root}/AIKB/notes/models/api.example.com-v1-old.md`],
    })

    // 3. The map itself: a row per page (the fan-out contributing one each),
    //    classified from the *registration*, not from the resolved data.
    const map = JSON.parse(await site.read('AIKB/site-map.json'))
    expect(map.pages).toEqual([
      {
        buildTo: `${site.build}/events.html`,
        view: 'events.hbs',
        model: `url:${EVENTS}`,
        controller: 'none',
        partials: [],
      },
      {
        buildTo: `${site.build}/index.html`,
        view: 'index.hbs',
        model: 'file:index.json',
        controller: 'none',
        partials: ['card'],
      },
      {
        buildTo: `${site.build}/team/ana.html`,
        view: 'member.hbs',
        model: 'folder:team',
        controller: 'file:member.js',
        partials: ['card'],
      },
      {
        buildTo: `${site.build}/team/bo.html`,
        view: 'member.hbs',
        model: 'folder:team',
        controller: 'file:member.js',
        partials: ['card'],
      },
    ])
    expect(map.partials).toEqual({
      card: [
        `${site.build}/index.html`,
        `${site.build}/team/ana.html`,
        `${site.build}/team/bo.html`,
      ],
    })
    expect(map.pipeline).toEqual([{ name: 'stamp', run: `${node} -e "0"` }])
    expect(map.site.build).toBe(site.build)
    expect(map.site.siteUrl).toBe('https://e.com')

    // 4. last-build.json is this build's report with every timing dropped —
    //    that is what makes it diffable, and it is what `check --against` reads.
    const last = JSON.parse(await site.read('AIKB/last-build.json'))
    expect(last).not.toHaveProperty('duration')
    expect(last.pipeline).toEqual([{ name: 'stamp', ok: true }])
    expect(last.pages.map((p) => p.buildTo)).toEqual(
      report.pages.map((p) => p.buildTo),
    )
    expect(last.aikb).toEqual(report.aikb)

    // 5. The human half says what it is, and is safe to read as markdown.
    const md = await site.read('AIKB/site-map.md')
    expect(md).toContain('Generated by `kiss-ssg` from the build')
    expect(md).toContain('`file:member.js`')
    expect(md).toContain('| Output')
  })

  it('writes byte-identical files on a second identical build', async () => {
    site = await makeSite(files)
    stubFetch()
    await build()
    const first = await readAikb()
    await kiss.close()
    kiss = null

    await build()
    // Every one of them, including the report snapshot: nothing in the folder
    // is timestamped and no duration survives, so an identical build is a
    // no-op in git and any diff is a real change to the site.
    expect(await readAikb()).toEqual(first)
  })

  it('is written once and never overwritten, for README.md alone', async () => {
    site = await makeSite({ ...files, 'AIKB/README.md': 'my own words\n' })
    stubFetch()
    await build()
    expect(await site.read('AIKB/README.md')).toBe('my own words\n')
    expect(await site.read('AIKB/site-map.md')).toContain('# Site map')
  })

  it('writes nothing under KISS_CHECK, and reports written: false', async () => {
    // The knowledge base is a publish, and a check publishes nothing — but the
    // note rules still run, so a check is a real verdict on them.
    site = await makeSite(files)
    stubFetch()
    process.env.KISS_CHECK = '1'
    const report = await build()

    expect(report.mode).toBe('check')
    expect(report.aikb.written).toBe(false)
    expect(report.aikb.notes.missing).toHaveLength(1)
    expect(report.aikb.notes.dead).toHaveLength(1)
    expect(await site.exists('AIKB/site-map.md')).toBe(false)
    expect(await site.exists('AIKB/site-map.json')).toBe(false)
    expect(await site.exists('AIKB/last-build.json')).toBe(false)
    expect(await site.exists('AIKB/README.md')).toBe(false)
    // ...and the notes it read are untouched.
    expect(await site.exists('AIKB/notes/controllers/member.md')).toBe(true)
  })

  it('maps staged paths back to the real folder after an atomic promotion', async () => {
    // The dependency graph is keyed on the path each page was written to, which
    // under `'atomic'` is the staging sibling. Without the mapping the map
    // lists no partials at all, and every path in it names a folder that no
    // longer exists.
    site = await makeSite(files)
    stubFetch()
    kiss = new Kiss({
      logger: silentLogger,
      cleanBuild: 'atomic',
      folders: { ...site.folders, aikb: `${site.root}/AIKB` },
    })
    kiss.page({ view: 'index.hbs', model: 'index.json' }).generate().aikb()
    await kiss.complete()

    const map = JSON.parse(await site.read('AIKB/site-map.json'))
    expect(map.pages[0].buildTo).toBe(`${site.build}/index.html`)
    expect(map.pages[0].partials).toEqual(['card'])
    expect(map.partials).toEqual({ card: [`${site.build}/index.html`] })
    // The report agrees, and neither names the staging sibling.
    const text = await site.read('AIKB/last-build.json')
    expect(text).not.toContain('kiss-staging')
  })

  it('is re-run by a whole-site rebuild, like the sitemap and llms.txt', async () => {
    site = await makeSite(files)
    stubFetch()
    await build()
    await fs.remove(path.join(site.root, 'AIKB/site-map.md'))
    await fs.remove(path.join(site.root, 'AIKB/last-build.json'))

    // A new page file, so the rebuild has something to say that the first
    // build could not: `.scan()` is not in play, so register it and replay.
    kiss.page({ view: 'index.hbs', model: 'index.json', slug: 'copy' })
    await kiss._requestReplay()

    expect(await site.exists('AIKB/site-map.md')).toBe(true)
    expect(await site.exists('AIKB/last-build.json')).toBe(true)
    expect(await site.read('AIKB/site-map.md')).toContain('copy.html')
    expect(kiss.report().aikb.written).toBe(true)
  })

  it('hands the map to a callback once the folder has been written', async () => {
    site = await makeSite(files)
    stubFetch()
    const seen = []
    kiss = new Kiss({
      logger: silentLogger,
      folders: { ...site.folders, aikb: `${site.root}/AIKB` },
    })
    kiss
      .page({ view: 'index.hbs', model: 'index.json' })
      .generate()
      .aikb(null, (map) => seen.push(map))
    await kiss.complete()

    expect(seen).toHaveLength(1)
    expect(seen[0].pages[0].buildTo).toBe(`${site.build}/index.html`)
    // The callback ran after the write, so what it was handed is on disk.
    expect(JSON.parse(await site.read('AIKB/site-map.json'))).toEqual(seen[0])
  })

  it('logs and carries on when the folder is switched off', async () => {
    site = await makeSite(files)
    const errors = []
    kiss = new Kiss({
      logger: { ...silentLogger, error: (msg) => errors.push(String(msg)) },
      folders: { ...site.folders, aikb: null },
    })
    kiss.page({ view: 'index.hbs', model: 'index.json' }).generate().aikb()
    await kiss.complete()

    // Not a build failure — the site the author asked for, minus this file.
    expect(kiss.report().ok).toBe(true)
    expect(kiss.report().aikb).toBe(null)
    expect(errors.join('\n')).toContain('config.folders.aikb is not set')
  })

  it('is absent from a build that never called it', async () => {
    site = await makeSite(files)
    kiss = new Kiss({ logger: silentLogger, folders: site.folders })
    kiss.page({ view: 'index.hbs', model: 'index.json' }).generate()
    await kiss.complete()

    expect(kiss.report().aikb).toBe(null)
    // Opt-in, like `.sitemap()`: no folder appears for a site that never asked.
    expect(await site.exists('AIKB/site-map.md')).toBe(false)
  })
})
