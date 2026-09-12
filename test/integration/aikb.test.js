import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
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
  vi.unstubAllEnvs()
})

const node = `"${process.execPath}"`
const sha1 = (text) => createHash('sha1').update(text).digest('hex')
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

// `KISS_AIKB` is read the way `KISS_CHECK` is — once, from `process.env`, as
// the build settles — so a test asks for a record exactly as `kiss-ssg aikb`
// does: by setting the variable the bin sets.
const record = () => vi.stubEnv('KISS_AIKB', '1')

const build = async ({ over = {}, broken = false } = {}) => {
  kiss = new Kiss({
    logger: silentLogger,
    siteUrl: 'https://e.com',
    folders: { ...site.folders, aikb: `${site.root}/AIKB` },
    assets: {
      pipeline: [{ name: 'stamp', run: `${node} -e "0"` }],
    },
    ...over,
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
  if (broken) kiss.page({ view: 'missing.hbs' })
  kiss.generate()
  await kiss.complete().catch(() => {})
  return kiss.report()
}

const readAikb = async () => ({
  readme: await site.read('AIKB/README.md'),
  mapMd: await site.read('AIKB/site-map.md'),
  mapJson: await site.read('AIKB/site-map.json'),
  lastBuild: await site.read('AIKB/last-build.json'),
})

const generated = [
  'README.md',
  'site-map.md',
  'site-map.json',
  'last-build.json',
]
const present = async () =>
  Object.fromEntries(
    await Promise.all(
      generated.map(async (file) => [file, await site.exists(`AIKB/${file}`)]),
    ),
  )
const none = Object.fromEntries(generated.map((file) => [file, false]))
const all = Object.fromEntries(generated.map((file) => [file, true]))

describe('the knowledge base, recorded by KISS_AIKB and nothing else', () => {
  it('is absent from a build of a site nobody has recorded', async () => {
    // The opt-in rule: a folder holding notes but no `site-map.json` has never
    // been recorded, so an ordinary build neither maps it nor mentions it.
    site = await makeSite(files)
    stubFetch()
    const report = await build()

    expect(report.aikb).toBeNull()
    expect(await present()).toEqual(none)
  })

  it('is null, and silent, when folders.aikb is switched off', async () => {
    site = await makeSite(files)
    stubFetch()
    const errors = []
    record()
    const report = await build({
      over: {
        folders: { ...site.folders, aikb: null },
        logger: { ...silentLogger, error: (msg) => errors.push(String(msg)) },
      },
    })

    expect(report.ok).toBe(true)
    expect(report.aikb).toBeNull()
    expect(errors).toEqual([])
  })

  it('records the map, the snapshot and the note verdict under KISS_AIKB', async () => {
    site = await makeSite(files)
    stubFetch()
    record()
    const report = await build()

    // 1. The folder's five entries: the four generated files, and the authored
    //    `notes/` the engine has never written and does not touch now.
    expect(await present()).toEqual(all)
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
      // Nothing is stamped yet, and no note cites a file.
      stale: [],
      dangling: [],
    })
    // The subject rows ride on the report too, so a check can say which hash
    // a note wants stamping with before any record has been made.
    expect(report.aikb.subjects).toEqual([
      {
        kind: 'controllers',
        id: 'member.js',
        note: 'notes/controllers/member.md',
        hash: sha1(files['src/controllers/member.js']),
      },
      {
        kind: 'models',
        id: EVENTS,
        note: 'notes/models/api.example.com-v2-events.md',
        hash: null,
      },
      {
        kind: 'pipeline',
        id: 'stamp',
        note: 'notes/pipeline/stamp.md',
        hash: sha1(`${node} -e "0"`),
      },
    ])

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
    // The same rows are the last key of the map on disk — which is what a
    // note is stamped from once the record has been made.
    expect(Object.keys(map).at(-1)).toBe('subjects')
    expect(map.subjects).toEqual(report.aikb.subjects)
    expect(map.site.build).toBe(site.build)
    expect(map.site.siteUrl).toBe('https://e.com')

    // 4. last-build.json is this build's report with every timing dropped —
    //    that is what makes it diffable, and it is the baseline `check` reads.
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

  it('refuses to record a build that failed, and says so', async () => {
    // The whole point of the ceremony: the knowledge base only ever describes
    // a build that worked. The notes are still evaluated, because that verdict
    // is true whatever the build did.
    site = await makeSite(files)
    stubFetch()
    const notices = []
    record()
    const report = await build({
      broken: true,
      over: {
        logger: { ...silentLogger, notice: (msg) => notices.push(String(msg)) },
      },
    })

    expect(report.ok).toBe(false)
    expect(report.aikb.written).toBe(false)
    expect(report.aikb.notes.missing).toHaveLength(1)
    expect(report.aikb.notes.dead).toHaveLength(1)
    expect(await present()).toEqual(none)
    expect(notices.join('\n')).toContain('not recording')
    expect(notices.join('\n')).toContain('the build failed')
  })

  it('refuses to record a dev build', async () => {
    // A dev build is half a site by definition — one save away from the next
    // one — and recording it would move the baseline under a developer who is
    // only looking at the page they are editing.
    site = await makeSite(files)
    stubFetch()
    const notices = []
    record()
    const report = await build({
      over: {
        dev: true,
        port: 0,
        livereloadPort: 0,
        logger: { ...silentLogger, notice: (msg) => notices.push(String(msg)) },
      },
    })

    expect(report.aikb.written).toBe(false)
    expect(await present()).toEqual(none)
    expect(notices.join('\n')).toContain('a dev build is never recorded')
  })

  it('writes byte-identical files on a second identical record', async () => {
    site = await makeSite(files)
    stubFetch()
    record()
    await build()
    const first = await readAikb()
    await kiss.close()
    kiss = null

    await build()
    // Every one of them, including the report snapshot: nothing in the folder
    // is timestamped and no duration survives, so an identical record is a
    // no-op in git and any diff is a real change to the site.
    expect(await readAikb()).toEqual(first)
  })

  it('is written once and never overwritten, for README.md alone', async () => {
    site = await makeSite({ ...files, 'AIKB/README.md': 'my own words\n' })
    stubFetch()
    record()
    await build()
    expect(await site.read('AIKB/README.md')).toBe('my own words\n')
    expect(await site.read('AIKB/site-map.md')).toContain('# Site map')
  })

  it('reports on a recorded site without rewriting it, on a plain build and on a check', async () => {
    // The opt-in marker is `site-map.json`, which only a record writes. Once it
    // is there every build reports the map's verdict — that is how `check` and
    // a deploy script see a missing note — and neither touches the folder.
    site = await makeSite(files)
    stubFetch()
    record()
    const recorded = await build()
    const snapshot = await readAikb()
    await kiss.close()
    kiss = null
    vi.unstubAllEnvs()

    const plain = await build()
    expect(plain.aikb.folder).toBe(`${site.root}/AIKB`)
    expect(plain.aikb.written).toBe(false)
    expect(plain.aikb.notes).toEqual(recorded.aikb.notes)
    expect(await readAikb()).toEqual(snapshot)
    await kiss.close()
    kiss = null

    vi.stubEnv('KISS_CHECK', '1')
    const checked = await build()
    expect(checked.mode).toBe('check')
    expect(checked.aikb.written).toBe(false)
    expect(checked.aikb.notes).toEqual(recorded.aikb.notes)
    expect(await readAikb()).toEqual(snapshot)
  })

  it('reports a stamped note as stale once its subject changes underneath it', async () => {
    // The finding the stamp exists for. Nothing about the note changed and
    // nothing about the map changed, so no other rule can see this: the note
    // was written against one controller and the controller has moved on.
    site = await makeSite(files)
    stubFetch()
    record()
    const recorded = await build()
    const { hash } = recorded.aikb.subjects.find((s) => s.id === 'member.js')
    await site.touch(
      'AIKB/notes/controllers/member.md',
      `---\nsubject-hash: ${hash}\n---\n\n## What it does\n\nDerives the slug.\n`,
    )
    await kiss.close()
    kiss = null

    const stamped = await build()
    expect(stamped.aikb.notes.stale).toEqual([])
    await kiss.close()
    kiss = null

    await site.touch(
      'src/controllers/member.js',
      'export default ({ model }) => ({ slug: model.slug, extra: 1 })\n',
    )
    const drifted = await build()
    expect(drifted.aikb.notes.stale).toEqual([
      `${site.root}/AIKB/notes/controllers/member.md`,
    ])
    // The note is still there and still about a subject that is still in the
    // map, so the two older rules have nothing to say about it — and the
    // report carries the hash it should be restamped with.
    expect(drifted.aikb.notes.missing).not.toContain(
      `${site.root}/AIKB/notes/controllers/member.md`,
    )
    expect(drifted.aikb.notes.dead).toEqual(recorded.aikb.notes.dead)
    expect(
      drifted.aikb.subjects.find((s) => s.id === 'member.js').hash,
    ).not.toBe(hash)
  })

  it('reports a note that cites a view the site no longer has', async () => {
    site = await makeSite({
      ...files,
      'AIKB/notes/controllers/member.md':
        '## What it does\n\nRenders `member.hbs`, which used to be `src/pages/member-card-v1.hbs`.\n',
    })
    stubFetch()
    record()
    const report = await build()

    // One of the two tokens is a view this build rendered; the other is a
    // file that resolves to nothing, anywhere.
    expect(report.aikb.notes.dangling).toEqual([
      `${site.root}/AIKB/notes/controllers/member.md: src/pages/member-card-v1.hbs`,
    ])
  })

  it('maps staged paths back to the real folder after an atomic promotion', async () => {
    // The dependency graph is keyed on the path each page was written to, which
    // under `'atomic'` is the staging sibling. Without the mapping the map
    // lists no partials at all, and every path in it names a folder that no
    // longer exists.
    site = await makeSite(files)
    stubFetch()
    record()
    kiss = new Kiss({
      logger: silentLogger,
      cleanBuild: 'atomic',
      folders: { ...site.folders, aikb: `${site.root}/AIKB` },
    })
    kiss.page({ view: 'index.hbs', model: 'index.json' }).generate()
    await kiss.complete()

    const map = JSON.parse(await site.read('AIKB/site-map.json'))
    expect(map.pages[0].buildTo).toBe(`${site.build}/index.html`)
    expect(map.pages[0].partials).toEqual(['card'])
    expect(map.partials).toEqual({ card: [`${site.build}/index.html`] })
    // The report agrees, and neither names the staging sibling.
    const text = await site.read('AIKB/last-build.json')
    expect(text).not.toContain('kiss-staging')
  })
})
