import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  buildSiteMap,
  classifyController,
  classifyModel,
  evaluateNotes,
  isRecorded,
  lastBuildRecord,
  noteSubjects,
  notePathFor,
  pageOrigin,
  readFrontmatter,
  renderAikbReadme,
  renderSiteMap,
  writeAikb,
} from '../../lib/aikb.js'
import { DependencyGraph } from '../../lib/dependency-graph.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const entry = (buildTo, origin = {}) => ({
  view: 'v.hbs',
  buildTo,
  origin: { model: 'none', controller: 'none', ...origin },
})

const config = {
  siteUrl: 'https://e.com',
  folders: {
    src: './src',
    build: './public',
    models: './src/models',
    controllers: null,
    aikb: './AIKB',
  },
  assets: { pipeline: [] },
}

const map = (over = {}) =>
  buildSiteMap({ config, buildDir: './public', ...over })

const sha1 = (text) => createHash('sha1').update(text).digest('hex')

// A path that really is on disk, written the way a note would write it: from
// the cwd the build script is run from, which for this suite is the repo root.
// Derived rather than hard-coded so the test cannot quietly start passing (or
// failing) because a file was moved.
const REAL_FILE = path
  .relative(process.cwd(), fileURLToPath(import.meta.url))
  .replace(/\\/g, '/')

let site
afterEach(async () => {
  await site?.cleanup()
  site = undefined
})

describe('classifyModel', () => {
  it.each([
    [undefined, 'none'],
    [null, 'none'],
    ['', 'none'],
    ['index.json', 'file:index.json'],
    ['team', 'folder:team'],
    [
      'https://api.example.com/v2/events',
      'url:https://api.example.com/v2/events',
    ],
    ['http://api.example.com/e', 'url:http://api.example.com/e'],
    [{ a: 1 }, 'inline'],
    [[1, 2], 'inline'],
  ])('classifies %s', (model, expected) => {
    expect(classifyModel(model)).toBe(expected)
  })

  it('makes the same three string tests resolveModel makes, in order', () => {
    // A URL that happens to end `.json` is a URL, not a file in the models
    // folder — the same precedence resolveModel applies.
    expect(classifyModel('https://e.com/a.json')).toBe(
      'url:https://e.com/a.json',
    )
  })
})

describe('classifyController', () => {
  it.each([
    [undefined, 'none'],
    [null, 'none'],
    ['', 'none'],
    ['stockist.js', 'file:stockist.js'],
    ['sub/deep.mjs', 'file:sub/deep.mjs'],
  ])('classifies %s', (controller, expected) => {
    expect(classifyController(controller)).toBe(expected)
  })

  it('classifies a function as inline — it has no file to name', () => {
    expect(classifyController(() => ({}))).toBe('inline')
  })
})

describe('pageOrigin', () => {
  it('reads both classifications off one options object', () => {
    expect(pageOrigin({ model: 'team', controller: 'x.js' })).toEqual({
      model: 'folder:team',
      controller: 'file:x.js',
    })
  })

  it('is none/none for a page with neither', () => {
    expect(pageOrigin()).toEqual({ model: 'none', controller: 'none' })
  })
})

describe('buildSiteMap', () => {
  it('sorts every list and rolls sources up to their pages', () => {
    const result = map({
      stack: [
        entry('./public/b.html', {
          model: 'folder:team',
          controller: 'file:x.js',
        }),
        entry('./public/a.html', { model: 'file:a.json' }),
        entry('./public/c.html', {
          model: 'folder:team',
          controller: 'file:x.js',
        }),
      ],
    })
    expect(result.pages.map((p) => p.buildTo)).toEqual([
      './public/a.html',
      './public/b.html',
      './public/c.html',
    ])
    expect(result.models).toEqual([
      { source: 'file:a.json', pages: ['./public/a.html'] },
      { source: 'folder:team', pages: ['./public/b.html', './public/c.html'] },
    ])
    expect(result.controllers).toEqual([
      { source: 'file:x.js', pages: ['./public/b.html', './public/c.html'] },
    ])
    // `none` is not a source: a page with no controller is not a controller
    // with no pages.
    expect(result.controllers).toHaveLength(1)
  })

  it('names the site, its build folder and every source folder but build', () => {
    const result = map()
    expect(result.site).toEqual({
      siteUrl: 'https://e.com',
      build: './public',
      folders: {
        aikb: './AIKB',
        // A folder switched off is `null`, which is a real value.
        controllers: null,
        models: './src/models',
        src: './src',
      },
    })
  })

  it('reads each page’s partials out of the graph', () => {
    const graph = new DependencyGraph()
    graph.record('./public/a.html', 'card')
    graph.record('./public/a.html', 'nav')
    graph.record('./public/b.html', 'nav')
    const result = map({
      graph,
      stack: [entry('./public/a.html'), entry('./public/b.html')],
    })
    expect(result.pages[0].partials).toEqual(['card', 'nav'])
    expect(result.partials).toEqual({
      card: ['./public/a.html'],
      nav: ['./public/a.html', './public/b.html'],
    })
  })

  it('maps staged paths back to the real build folder on both sides', () => {
    // The graph is keyed on the path each page was *written* to, which under
    // `cleanBuild: 'atomic'` is the staging sibling — while a promoted stack
    // entry's buildTo is already real. Both sides go through the same mapping,
    // or an atomic build lists no partials at all.
    const graph = new DependencyGraph()
    graph.record('./public.kiss-staging-1/a.html', 'card')
    const result = buildSiteMap({
      config,
      graph,
      stack: [entry('./public/a.html')],
      buildDir: './public',
      stagingDir: './public.kiss-staging-1',
    })
    expect(result.pages[0].partials).toEqual(['card'])
    expect(result.partials).toEqual({ card: ['./public/a.html'] })
  })

  it('names a pipeline step by its name, or the first word of its run', () => {
    const result = map({
      pipeline: [
        { name: 'tailwind', run: 'npx tailwindcss -i a -o b' },
        { run: '  sprite  --out x' },
      ],
    })
    expect(result.pipeline).toEqual([
      { name: 'tailwind', run: 'npx tailwindcss -i a -o b' },
      { name: 'sprite', run: '  sprite  --out x' },
    ])
  })

  it('elides an inline template’s view rather than carrying its markup', () => {
    const result = map({
      stack: [{ view: '<p>a</p>\n<p>b</p>', buildTo: './public/x.html' }],
    })
    expect(result.pages[0].view).toBe('<p>a</p>…')
    // A stack entry with no origin is not a crash: none/none.
    expect(result.pages[0].model).toBe('none')
  })
})

describe('buildSiteMap: subjects', () => {
  const CONTROLLER = 'export default () => ({ ok: true })\n'
  // The injected reader is the whole point of the dependency: the only thing
  // in this module that would otherwise touch a disk, handed in so a unit
  // test never has to write a controller file to assert on its hash.
  const reader = (kind, id) =>
    kind === 'controllers' && id === 'stockist.js' ? CONTROLLER : null

  const withSubjects = (over = {}) =>
    map({
      readSubject: reader,
      stack: [
        entry('./public/a.html', {
          model: 'url:https://api.example.com/v2/events?x=1',
          controller: 'file:stockist.js',
        }),
        entry('./public/b.html', { controller: 'file:gone.js' }),
      ],
      pipeline: [{ name: 'tailwind', run: 'npx tailwindcss' }],
      ...over,
    })

  it('hashes a controller the same with CRLF and LF line endings', () => {
    const lf = 'export default () => ({})\n// two\n'
    const crlf = lf.replace(/\n/g, '\r\n')
    const mapFor = (text) =>
      buildSiteMap({
        stack: [
          {
            view: 'a.hbs',
            buildTo: './public/a.html',
            origin: { model: 'none', controller: 'file:a.js' },
          },
        ],
        config: { folders: {} },
        buildDir: './public',
        readSubject: () => Buffer.from(text),
      })
    expect(mapFor(crlf).subjects[0].hash).toBe(mapFor(lf).subjects[0].hash)
    expect(mapFor(lf).subjects[0].hash).toBe(sha1(lf))
  })

  it('hashes a controller by its bytes, a step by its command, a URL model not at all', () => {
    expect(withSubjects().subjects).toEqual([
      // A controller the reader cannot produce has no hash rather than a
      // wrong one — and a subject with no hash can never be stale.
      {
        kind: 'controllers',
        id: 'gone.js',
        note: 'notes/controllers/gone.md',
        hash: null,
      },
      {
        kind: 'controllers',
        id: 'stockist.js',
        note: 'notes/controllers/stockist.md',
        hash: sha1(CONTROLLER),
      },
      // A URL model's id *is* the subject: an id that changed is a different
      // subject with a different note, so there is nothing for a hash to say.
      {
        kind: 'models',
        id: 'https://api.example.com/v2/events?x=1',
        note: 'notes/models/api.example.com-v2-events.md',
        hash: null,
      },
      {
        kind: 'pipeline',
        id: 'tailwind',
        note: 'notes/pipeline/tailwind.md',
        hash: sha1('npx tailwindcss'),
      },
    ])
  })

  it('is the last key on the map, sorted exactly as noteSubjects sorts', () => {
    const result = withSubjects()
    expect(Object.keys(result).at(-1)).toBe('subjects')
    expect(result.subjects.map((s) => [s.kind, s.id])).toEqual(
      noteSubjects(result).map((s) => [s.kind, s.id]),
    )
  })

  it('asks the reader only about the subject that lives in a file', () => {
    const asked = []
    withSubjects({
      readSubject: (kind, id) => {
        asked.push(`${kind}/${id}`)
        return null
      },
    })
    expect(asked).toEqual(['controllers/gone.js', 'controllers/stockist.js'])
  })

  it('reads no file of its own by default when there is no controllers folder', () => {
    // `config.folders.controllers` is null here, so the default reader has
    // nowhere to look and says so instead of throwing.
    expect(
      map({ stack: [entry('./public/a.html', { controller: 'file:x.js' })] })
        .subjects,
    ).toEqual([
      {
        kind: 'controllers',
        id: 'x.js',
        note: 'notes/controllers/x.md',
        hash: null,
      },
    ])
  })
})

describe('noteSubjects', () => {
  it('is controller files, URL models and pipeline steps, and nothing else', () => {
    const result = map({
      stack: [
        entry('./public/a.html', {
          model: 'url:https://api.example.com/v2/events?x=1',
          controller: 'file:stockist.js',
        }),
        // A JSON model, a folder model and an inline controller are not
        // subjects: there is nothing to explain, or nothing to attach it to.
        entry('./public/b.html', {
          model: 'file:b.json',
          controller: 'inline',
        }),
        entry('./public/c.html', { model: 'folder:team' }),
        entry('./public/d.html', { model: 'inline' }),
      ],
      pipeline: [{ name: 'tailwind', run: 'npx tailwindcss' }],
    })
    expect(noteSubjects(result)).toEqual([
      { kind: 'controllers', id: 'stockist.js' },
      { kind: 'models', id: 'https://api.example.com/v2/events?x=1' },
      { kind: 'pipeline', id: 'tailwind' },
    ])
  })
})

describe('notePathFor', () => {
  it.each([
    [
      { kind: 'controllers', id: 'stockist.js' },
      'notes/controllers/stockist.md',
    ],
    [
      { kind: 'controllers', id: 'sub/deep.mjs' },
      'notes/controllers/sub-deep.md',
    ],
    [
      { kind: 'models', id: 'https://api.example.com/v2/events?x=1' },
      'notes/models/api.example.com-v2-events.md',
    ],
    [{ kind: 'pipeline', id: 'tailwind' }, 'notes/pipeline/tailwind.md'],
    [{ kind: 'pipeline', id: 'Build CSS!' }, 'notes/pipeline/build-css.md'],
  ])('derives $id mechanically', (subject, expected) => {
    expect(notePathFor(subject)).toBe(expected)
  })

  it('drops the query and the fragment, keeps the host’s dots, slugs the rest', () => {
    // The query is where the page number and the API key live; a note per page
    // of results is a note nobody writes.
    expect(
      notePathFor({
        kind: 'models',
        id: 'https://API.Example.com:8443/v2/Events~List?key=a%20b&p=2#frag',
      }),
    ).toBe('notes/models/api.example.com-8443-v2-events-list.md')
  })

  it('falls back to a stable hash for an id with no filename in it', () => {
    const path = notePathFor({ kind: 'models', id: 'https://例え.example/み' })
    expect(path).toMatch(/^notes\/models\/[a-z0-9.-]+\.md$/)
    expect(notePathFor({ kind: 'pipeline', id: '例え' })).toBe(
      notePathFor({ kind: 'pipeline', id: '例え' }),
    )
    expect(notePathFor({ kind: 'pipeline', id: '例え' })).not.toBe(
      notePathFor({ kind: 'pipeline', id: '別' }),
    )
  })

  it('writes into whichever notes folder it is given', () => {
    expect(
      notePathFor({ kind: 'pipeline', id: 'tailwind' }, 'site/AIKB/notes'),
    ).toBe('site/AIKB/notes/pipeline/tailwind.md')
  })
})

describe('isRecorded', () => {
  it('is true only once a record has written site-map.json', async () => {
    site = await makeSite({ 'AIKB/site-map.json': { pages: [] } })
    expect(isRecorded(`${site.root}/AIKB`)).toBe(true)
  })

  it('is false for a folder that merely exists', async () => {
    // The case this test exists for: a repository whose `AIKB/` holds
    // hand-written module notes has not opted in, and a site built inside it
    // must not start claiming that folder as its own knowledge base.
    site = await makeSite({ 'AIKB/notes/controllers/x.md': '## What it does' })
    expect(isRecorded(`${site.root}/AIKB`)).toBe(false)
  })

  it('is false for a folder that is not there, and for no folder at all', async () => {
    site = await makeSite({})
    expect(isRecorded(`${site.root}/AIKB`)).toBe(false)
    expect(isRecorded(null)).toBe(false)
    expect(isRecorded(undefined)).toBe(false)
    expect(isRecorded('')).toBe(false)
  })
})

describe('evaluateNotes', () => {
  const subjects = () =>
    map({
      stack: [
        entry('./public/a.html', {
          model: 'url:https://api.example.com/v2/events',
          controller: 'file:stockist.js',
        }),
      ],
    })

  it('reports one missing note and one dead note against a real folder', async () => {
    site = await makeSite({
      // The subject that is explained.
      'AIKB/notes/controllers/stockist.md': '## What it does',
      // A note whose subject is not in this map at all.
      'AIKB/notes/pipeline/postcss.md': '## What it does',
    })
    const notes = evaluateNotes(subjects(), `${site.root}/AIKB/notes`)
    expect(notes).toEqual({
      missing: [`${site.root}/AIKB/notes/models/api.example.com-v2-events.md`],
      dead: [`${site.root}/AIKB/notes/pipeline/postcss.md`],
      stale: [],
      dangling: [],
    })
  })

  it('treats a note filed anywhere unexpected as dead', async () => {
    site = await makeSite({
      'AIKB/notes/controllers/stockist.md': 'x',
      'AIKB/notes/models/api.example.com-v2-events.md': 'x',
      'AIKB/notes/README.md': 'x',
      'AIKB/notes/misc/stray.md': 'x',
    })
    const notes = evaluateNotes(subjects(), `${site.root}/AIKB/notes`)
    expect(notes.missing).toEqual([])
    expect(notes.dead).toEqual([
      `${site.root}/AIKB/notes/README.md`,
      `${site.root}/AIKB/notes/misc/stray.md`,
    ])
  })

  it('is all-missing and nothing-dead against a folder that is not there', () => {
    const notes = evaluateNotes(subjects(), './does-not-exist/notes')
    expect(notes.missing).toHaveLength(2)
    expect(notes.dead).toEqual([])
  })
})

describe('readFrontmatter', () => {
  it('reads a --- block of key: value lines, and only that', () => {
    expect(
      readFrontmatter('---\nsubject-hash: abc123\ntitle: A note\n---\n\n# x'),
    ).toEqual({ 'subject-hash': 'abc123', title: 'A note' })
  })

  it('keeps a colon inside a value and skips a line that has none', () => {
    expect(
      readFrontmatter('---\nsee: https://e.com/a\nnot a field\n---\nbody'),
    ).toEqual({ see: 'https://e.com/a' })
  })

  it('reads a CRLF block, because a Windows checkout writes one', () => {
    expect(readFrontmatter('---\r\nsubject-hash: abc\r\n---\r\nbody')).toEqual({
      'subject-hash': 'abc',
    })
  })

  it('is null when there is no block, or the block is not at the top', () => {
    expect(readFrontmatter('## What it does\n')).toBeNull()
    expect(readFrontmatter('')).toBeNull()
    expect(readFrontmatter('# x\n\n---\nsubject-hash: abc\n---\n')).toBeNull()
  })
})

describe('evaluateNotes: stale', () => {
  const CONTROLLER = 'export default () => ({})\n'
  const stampedMap = () =>
    map({
      readSubject: () => CONTROLLER,
      stack: [
        entry('./public/a.html', {
          controller: 'file:stockist.js',
          model: 'url:https://api.example.com/v2/events',
        }),
      ],
    })
  const stamped = (hash) =>
    `---\nsubject-hash: ${hash}\n---\n\n## What it does\n`

  it('is the note whose stamp is no longer the subject’s hash', async () => {
    site = await makeSite({
      'AIKB/notes/controllers/stockist.md': stamped('0'.repeat(40)),
      // Stamped too, and with the same wrong hash — but a URL model has no
      // hash to disagree with, so it is never stale.
      'AIKB/notes/models/api.example.com-v2-events.md': stamped('0'.repeat(40)),
    })
    const notes = evaluateNotes(stampedMap(), `${site.root}/AIKB/notes`)
    expect(notes.stale).toEqual([
      `${site.root}/AIKB/notes/controllers/stockist.md`,
    ])
    expect(notes.missing).toEqual([])
  })

  it('is not a note stamped with the current hash, nor an unstamped one', async () => {
    site = await makeSite({
      'AIKB/notes/controllers/stockist.md': stamped(sha1(CONTROLLER)),
      // No stamp at all is the state every note starts in: unstamped, not
      // stale.
      'AIKB/notes/models/api.example.com-v2-events.md': '## What it does\n',
    })
    expect(
      evaluateNotes(stampedMap(), `${site.root}/AIKB/notes`).stale,
    ).toEqual([])
  })

  it('is empty for a map with no subject hashes at all', async () => {
    // A map written before subjects existed, or one built by hand: nothing to
    // compare against, so nothing is stale.
    site = await makeSite({
      'AIKB/notes/controllers/stockist.md': stamped('0'.repeat(40)),
    })
    const older = stampedMap()
    delete older.subjects
    expect(evaluateNotes(older, `${site.root}/AIKB/notes`).stale).toEqual([])
  })
})

describe('evaluateNotes: dangling', () => {
  const referencedMap = () => {
    const graph = new DependencyGraph()
    graph.record('./public/a.html', 'nav/top')
    return buildSiteMap({
      // A models folder that is deliberately not on this disk, so the token
      // naming it can only resolve through the map.
      config: {
        ...config,
        folders: { ...config.folders, models: './content/records' },
      },
      buildDir: './public',
      graph,
      stack: [
        {
          view: 'index.hbs',
          buildTo: './public/a.html',
          origin: { model: 'file:a.json', controller: 'file:stockist.js' },
        },
      ],
    })
  }

  const note = [
    '## What it does',
    '',
    `Reads \`${REAL_FILE}\` — a file that is really there, from the cwd.`,
    'Renders `index.hbs` into `a.html` through `nav/top`, out of `content/records`,',
    'and is explained beside `notes/controllers/stockist.md`.',
    '',
    '## Gotchas',
    '',
    '- `<title>` is set by the layout, and `npx kiss-ssg check` says so.',
    '- The feed is `https://api.example.com/v2/events`; everything lands in `shelf/`.',
    '- It still imports `src/pages/gone.hbs`, and `src/pages/gone.hbs` is gone.',
    '',
  ].join('\n')

  const siteMd = [
    '# This site',
    '',
    'Deployed from `src/pages/vanished.hbs`, which is not there either.',
    '',
    '```js',
    "import x from 'src/pages/fenced.hbs'",
    '```',
    '',
  ].join('\n')

  it('reports only the tokens that look like a file and resolve to nothing', async () => {
    site = await makeSite({
      'AIKB/notes/controllers/stockist.md': note,
      'AIKB/site.md': siteMd,
    })
    const notes = evaluateNotes(referencedMap(), `${site.root}/AIKB/notes`, {
      aikbDir: `${site.root}/AIKB`,
    })
    expect(notes.dangling).toEqual([
      // Cited twice in the note, reported once.
      `${site.root}/AIKB/notes/controllers/stockist.md: src/pages/gone.hbs`,
      // `site.md` is scanned like a note — and the fenced block in it is not,
      // because a snippet quotes code rather than citing a file.
      `${site.root}/AIKB/site.md: src/pages/vanished.hbs`,
    ])
    // ...and `site.md` is never missing, dead or stale: it has no subject.
    expect(notes.dead).toEqual([])
    expect(notes.stale).toEqual([])
  })

  it('scans no site.md when it is not there, and none without the folder', async () => {
    site = await makeSite({ 'AIKB/notes/controllers/stockist.md': note })
    const withFolder = evaluateNotes(
      referencedMap(),
      `${site.root}/AIKB/notes`,
      { aikbDir: `${site.root}/AIKB` },
    )
    expect(withFolder.dangling).toHaveLength(1)
    // With no folder given, a note citing its neighbour cannot be resolved
    // against the knowledge base — the one thing the folder is needed for.
    const without = evaluateNotes(referencedMap(), `${site.root}/AIKB/notes`)
    expect(without.dangling).toContain(
      `${site.root}/AIKB/notes/controllers/stockist.md: notes/controllers/stockist.md`,
    )
  })
})

describe('evaluateNotes: dangling, resolved against the source folders', () => {
  it('accepts a reference written the way the source tree reads', async () => {
    // `controllers/helper.js` exists under the site's `src`, not under the
    // cwd: a note cites it the way the tree reads, and the map knows where
    // that tree hangs.
    site = await makeSite({
      'src/controllers/helper.js': 'export default () => ({})\n',
      'AIKB/notes/controllers/stockist.md':
        'Shares `controllers/helper.js`; `controllers/absent.js` is gone.\n',
    })
    const siteMap = buildSiteMap({
      config: { folders: { src: `${site.root}/src` } },
      buildDir: './public',
      stack: [
        {
          view: 'index.hbs',
          buildTo: './public/a.html',
          origin: { model: 'none', controller: 'file:stockist.js' },
        },
      ],
      readSubject: () => null,
    })
    const notes = evaluateNotes(siteMap, `${site.root}/AIKB/notes`, {
      aikbDir: `${site.root}/AIKB`,
    })
    expect(notes.dangling).toEqual([
      `${site.root}/AIKB/notes/controllers/stockist.md: controllers/absent.js`,
    ])
  })
})

describe('renderSiteMap', () => {
  const full = () =>
    map({
      readSubject: () => 'export default () => ({})\n',
      graph: (() => {
        const graph = new DependencyGraph()
        graph.record('./public/a.html', 'card')
        return graph
      })(),
      stack: [
        entry('./public/a.html', {
          model: 'file:a.json',
          controller: 'file:x.js',
        }),
        entry('./public/b.html'),
      ],
      pipeline: [{ name: 'tailwind', run: 'npx tailwindcss' }],
    })

  it('renders the same bytes for the same map, every time', () => {
    expect(renderSiteMap(full())).toBe(renderSiteMap(full()))
  })

  it('carries no timestamp and no duration anywhere', () => {
    const text = renderSiteMap(full())
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).not.toMatch(/\bms\b/)
  })

  it('says on the page that it is generated and must not be edited', () => {
    const text = renderSiteMap(full())
    expect(text.split('\n')[0]).toBe('# Site map')
    expect(text).toContain('Generated by `kiss-ssg` from the build')
    expect(text).toContain('**Do not edit it**')
  })

  it('emits tables already aligned the way prettier aligns them', () => {
    const rows = renderSiteMap(full())
      .split('\n')
      .filter((line) => line.startsWith('|'))
    // Every row of one table is the same width, and the delimiter row is made
    // of dashes — which is what makes the committed file pass prettier --check.
    const widths = new Set(rows.slice(0, 3).map((line) => line.length))
    expect(widths.size).toBe(1)
    expect(rows[1]).toMatch(/^\| -+ (\| -+ )*\|$/)
  })

  it('has a section per part of the map, and says None for an empty one', () => {
    const text = renderSiteMap(map())
    for (const heading of [
      '## Site',
      '## Pages',
      '## Partials',
      '## Models',
      '## Controllers',
      '## Asset pipeline',
      '## Subjects',
    ])
      expect(text).toContain(heading)
    expect(text.match(/_None\._/g)).toHaveLength(6)
  })

  it('lists every subject with its note and the first 12 characters of its hash', () => {
    const result = map({
      readSubject: () => 'export default () => ({})\n',
      stack: [
        entry('./public/a.html', {
          controller: 'file:x.js',
          model: 'url:https://e.com/v1/a',
        }),
      ],
    })
    const text = renderSiteMap(result)
    const hash = result.subjects[0].hash
    expect(text).toContain('## Subjects')
    expect(text).toContain('`notes/controllers/x.md`')
    expect(text).toContain(`\`${hash.slice(0, 12)}\``)
    // The whole hash lives in site-map.json, which is what a note is stamped
    // from — the table is for reading, not for copying.
    expect(text).not.toContain(hash)
    // A URL model has no hash, and the cell says so rather than being blank.
    expect(text).toContain('| models')
  })

  it('escapes a pipe so a command cannot break out of its cell', () => {
    const text = renderSiteMap(map({ pipeline: [{ name: 'x', run: 'a | b' }] }))
    expect(text).toContain('`a \\| b`')
  })
})

describe('renderAikbReadme', () => {
  it('says which files are generated, which are authored, and the template', () => {
    const text = renderAikbReadme()
    expect(text).toContain('site-map.md')
    expect(text).toContain('last-build.json')
    expect(text).toContain('notes/controllers/')
    for (const heading of [
      '## What it does',
      '## Why it is this way',
      '## Gotchas',
    ])
      expect(text).toContain(heading)
  })
})

describe('lastBuildRecord', () => {
  const report = {
    ok: true,
    mode: 'build',
    buildDir: './public',
    duration: 153,
    pages: [{ view: 'a.hbs', buildTo: './public/a.html', ok: true, hash: 'h' }],
    failures: [],
    assets: [],
    sitemap: null,
    pipeline: [{ name: 'tailwind', ok: true, duration: 420 }],
    llms: null,
    aikb: {
      folder: 'AIKB',
      written: true,
      notes: { missing: [], dead: [], stale: [], dangling: [] },
      subjects: [],
    },
    links: { checked: 3, broken: [] },
    redirects: { file: null, aliases: 0, removed: [], collisions: [] },
    feed: null,
  }

  it('drops every duration and keeps the report’s own key order', () => {
    const record = lastBuildRecord(report)
    expect(Object.keys(record)).toEqual([
      'ok',
      'mode',
      'buildDir',
      'pages',
      'failures',
      'assets',
      'sitemap',
      'pipeline',
      'llms',
      'aikb',
      // The record is `{ ...report }`, so every key appended to the report
      // lands in every committed `last-build.json` — which is why example 9 is
      // re-recorded whenever this list grows.
      'links',
      'redirects',
      'feed',
    ])
    expect(record.pipeline).toEqual([{ name: 'tailwind', ok: true }])
  })

  it('leaves the report it was given alone', () => {
    lastBuildRecord(report)
    expect(report.duration).toBe(153)
    expect(report.pipeline[0].duration).toBe(420)
  })
})

describe('writeAikb', () => {
  it('writes the three generated files and reports the note findings', async () => {
    site = await makeSite({})
    const result = await writeAikb({
      map: map({
        stack: [entry('./public/a.html', { controller: 'file:x.js' })],
      }),
      folder: `${site.root}/AIKB`,
      logger: silentLogger,
    })
    expect(result.written).toBe(true)
    expect(result.notes.missing).toEqual([
      `${site.root}/AIKB/notes/controllers/x.md`,
    ])
    // The subject rows ride on the result, so the report of the build that
    // found the finding also carries the hash a note should be stamped with.
    expect(Object.keys(result)).toEqual([
      'folder',
      'written',
      'notes',
      'subjects',
    ])
    expect(result.subjects).toEqual([
      {
        kind: 'controllers',
        id: 'x.js',
        note: 'notes/controllers/x.md',
        hash: null,
      },
    ])
    expect(await site.exists('AIKB/README.md')).toBe(true)
    expect(await site.exists('AIKB/site-map.md')).toBe(true)
    expect(JSON.parse(await site.read('AIKB/site-map.json')).site.build).toBe(
      './public',
    )
    // last-build.json is the report's own file, written after it exists.
    expect(await site.exists('AIKB/last-build.json')).toBe(false)
  })

  it('never overwrites README.md, and always overwrites the map', async () => {
    site = await makeSite({
      'AIKB/README.md': 'mine',
      'AIKB/site-map.md': 'stale',
    })
    await writeAikb({
      map: map(),
      folder: `${site.root}/AIKB`,
      logger: silentLogger,
    })
    expect(await site.read('AIKB/README.md')).toBe('mine')
    expect(await site.read('AIKB/site-map.md')).not.toBe('stale')
  })

  it('evaluates and writes nothing when write is false', async () => {
    site = await makeSite({})
    const result = await writeAikb({
      map: map({
        stack: [entry('./public/a.html', { controller: 'file:x.js' })],
      }),
      folder: `${site.root}/AIKB`,
      logger: silentLogger,
      write: false,
    })
    expect(result.written).toBe(false)
    expect(result.notes.missing).toHaveLength(1)
    expect(await site.exists('AIKB')).toBe(false)
  })

  it('logs a failed write and reports written:false rather than throwing', async () => {
    site = await makeSite({})
    // A file where the folder has to go: every write into it fails.
    await fs.outputFile(`${site.root}/AIKB`, 'not a folder')
    const errors = []
    const result = await writeAikb({
      map: map(),
      folder: `${site.root}/AIKB`,
      logger: { ...silentLogger, error: (msg) => errors.push(String(msg)) },
    })
    expect(result.written).toBe(false)
    expect(errors.join('\n')).toContain('Could not write')
  })
})
