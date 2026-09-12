// The site's own knowledge base, written by the build.
//
// `sitemap.js` writes the site for a crawler and `llms.js` writes it for an
// answer engine; this writes it for the next developer — which is usually you,
// in two years, with the context window that held all of this long gone. The
// engine already knows the structural half at build time (which pages render
// which partials, which model and controller sit behind each page, which URLs
// are fetched, which pipeline steps run) and used to throw it away when the
// build finished. Here it is written down instead, into a folder that is meant
// to be committed.
//
// Two halves, and only one of them is generated. The **map** is regenerated on
// every build and must never be hand-edited. The **notes** are authored by
// people and never written by the engine: judgement about *why* a controller,
// a fetched URL or a pipeline step is the way it is, which no build can infer.
// All this module does about a note is lint it mechanically: which ones are
// missing, which have outlived their subject, which were written against a
// version of that subject that has since changed, and which cite a file that
// is not there.
//
// Everything but `writeAikb`/`writeLastBuild` is pure, and everything rendered
// is sorted with no timestamp and no duration anywhere: two identical builds
// must write byte-identical files, or the folder churns in git on every build
// and the diff stops meaning anything.

import fs from 'fs-extra'
import { createHash } from 'node:crypto'
import { globFiles, hashId, posixPath } from './utils.js'
import { reportedPath, reportedView } from './build-report.js'

/**
 * One page as the map records it.
 *
 * @typedef {Object} SiteMapPage
 * @property {string|null} buildTo the file it writes, against the real build folder
 * @property {string|null} id the page's identity, what `{{link "<id>"}}` resolves — `null` for an inline template, a `generate: false` page and a withdrawn default id
 * @property {string} view the `.hbs` filename — an inline template is elided to its first line
 * @property {string} model `file:<name>`, `folder:<name>`, `url:<url>`, `inline` or `none`
 * @property {string} controller `file:<name>`, `inline` or `none`
 * @property {string[]} partials the partials and layouts this page actually rendered, sorted
 */

/**
 * A model or controller and the pages that used it.
 *
 * @typedef {Object} SiteMapSource
 * @property {string} source the same classification a page row carries
 * @property {string[]} pages the output paths that used it, sorted
 */

/**
 * One `config.assets.pipeline` step, as the map records it.
 *
 * @typedef {Object} SiteMapPipelineStep
 * @property {string} name the step's `name`, or the first word of its `run`
 * @property {string} run the command
 */

/**
 * A subject as the map records it: what it is, where its note goes, and what
 * the subject looked like when this build ran.
 *
 * @typedef {Object} SiteMapSubject
 * @property {'controllers'|'models'|'pipeline'} kind the folder its note lives in
 * @property {string} id the controller filename, the model URL, or the step name
 * @property {string} note the note's path, relative to the AIKB folder
 * @property {string|null} hash sha1 hex of what the subject *is* — the controller file's bytes, or the step's command — and `null` when there is nothing to hash (a URL model) or nothing to read (a controller file that is not there)
 */

/**
 * Where the site is read from and written to.
 *
 * @typedef {Object} SiteMapSite
 * @property {string|null} siteUrl `config.siteUrl`, or `null` when unset
 * @property {string} build the real build folder, never the staging sibling
 * @property {Record<string, string|null>} folders every `config.folders` key but `build`, sorted
 */

/**
 * The whole map: what one settled build knew about the shape of its site.
 *
 * @typedef {Object} SiteMap
 * @property {SiteMapSite} site
 * @property {SiteMapPage[]} pages sorted by output path
 * @property {Record<string, string[]>} partials partial name → the pages that rendered it
 * @property {SiteMapSource[]} models sorted by source
 * @property {SiteMapSource[]} controllers sorted by source
 * @property {SiteMapPipelineStep[]} pipeline in the order the steps run
 * @property {SiteMapSubject[]} subjects every thing that wants a note, sorted as `noteSubjects` sorts
 */

/**
 * A thing with judgement in it, which therefore wants a note.
 *
 * @typedef {Object} NoteSubject
 * @property {'controllers'|'models'|'pipeline'} kind the folder its note lives in
 * @property {string} id the controller filename, the model URL, or the step name
 */

/**
 * What the build report carries under `aikb`.
 *
 * @typedef {Object} AikbResult
 * @property {string} folder the AIKB folder, as configured
 * @property {boolean} written `false` on every build but a passing `KISS_AIKB` record, and when a write failed
 * @property {{ missing: string[], dead: string[], stale: string[], dangling: string[] }} notes all four sorted
 * @property {SiteMapSubject[]} subjects the map's subject rows, so the hash to stamp a note with is on the report of the build that found the finding
 */

/** The classification of a page with no model and no controller. */
const NONE = 'none'

/**
 * Whether this site has ever been recorded — the opt-in test, and the reason
 * an ordinary build of a site that has a knowledge base still reports on it.
 *
 * `site-map.json` is the marker rather than the folder itself, because only a
 * record ever writes that file: a repository whose `AIKB/` holds hand-written
 * module notes (this one's does) has not opted in, and a build of the docs site
 * inside it must not start claiming it has. Synchronous and side-effect-free —
 * it is one `stat` on the way to assembling the report.
 *
 * @param {string|null|undefined} folder `config.folders.aikb`
 * @returns {boolean}
 */
export function isRecorded(folder) {
  if (!folder) return false
  return fs.pathExistsSync(`${posixPath(folder)}/site-map.json`)
}

/**
 * How a page's model was written in the `.page()` call that registered it —
 * not what it resolved to. By the time a page is on the stack `options.model`
 * has been replaced by the resolved data, so a map built from the stack alone
 * would say `inline` for every page in the site.
 *
 * @param {unknown} model the *registered* model option
 * @returns {string} `file:<name>`, `folder:<name>`, `url:<url>`, `inline` or `none`
 */
export function classifyModel(model) {
  if (model === undefined || model === null || model === '') return NONE
  if (typeof model !== 'string') return 'inline'
  // The same three tests `resolveModel` makes, in the same order, so the map
  // can never disagree with what the engine actually did with the value.
  if (model.startsWith('http')) return `url:${model}`
  if (model.endsWith('.json')) return `file:${model}`
  return `folder:${model}`
}

/**
 * How a page's controller was written in the `.page()` call that registered it.
 *
 * @param {unknown} controller the *registered* controller option
 * @returns {string} `file:<name>`, `inline` or `none`
 */
export function classifyController(controller) {
  if (controller === undefined || controller === null || controller === '')
    return NONE
  return typeof controller === 'string' ? `file:${controller}` : 'inline'
}

/**
 * The pair of classifications one page contributes, captured while the
 * registered options are still the registered options.
 *
 * @param {Record<string, any>} [options]
 * @returns {{ model: string, controller: string }}
 */
export function pageOrigin(options = {}) {
  return {
    model: classifyModel(options.model),
    controller: classifyController(options.controller),
  }
}

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Groups page rows by one classification, dropping `none` — a page with no
// controller is not a controller with no pages.
function sourcesFrom(pages, key) {
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  for (const page of pages) {
    const source = page[key]
    if (source === NONE) continue
    if (!groups.has(source)) groups.set(source, [])
    if (page.buildTo) groups.get(source)?.push(page.buildTo)
  }
  return [...groups.keys()].sort(byString).map((source) => ({
    source,
    pages: (groups.get(source) ?? []).sort(byString),
  }))
}

/**
 * Builds the map for one settled build. Every list is sorted and nothing here
 * reads a clock: two identical builds produce the same object.
 *
 * @param {Object} input
 * @param {{ view: string, buildTo: string|null, id?: string|null, origin?: { model: string, controller: string } }[]} [input.stack] the prepared pages
 * @param {import('./dependency-graph.js').DependencyGraph|null} [input.graph] filled by rendering, so this only works on a settled build
 * @param {any} input.config the resolved config
 * @param {import('./pipeline.js').PipelineStep[]} [input.pipeline] defaults to `config.assets.pipeline`
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling paths are reported against, if there was one
 * @param {(kind: string, id: string) => Buffer|string|null} [input.readSubject] the bytes a subject's hash is taken over; defaults to reading the controller file off disk
 * @returns {SiteMap}
 */
export function buildSiteMap({
  stack = [],
  graph = null,
  config,
  pipeline = config?.assets?.pipeline ?? [],
  buildDir,
  stagingDir = null,
  // Everything else here is a pure function of what it was handed, and one
  // subject's hash is the bytes of a file nobody passed in. Rather than let
  // the module reach for the disk on its own, the read is a dependency with a
  // default: the engine gets the disk, a unit test gets whatever it says.
  readSubject = diskSubjectReader(config?.folders?.controllers),
}) {
  const real = (target) => reportedPath(target, buildDir, stagingDir)
  const folders = { ...(config?.folders ?? {}) }
  delete folders.build
  // The partial index, and the per-page list read back out of it. Both come
  // from `toJSON()` rather than from `usesOf(entry.buildTo)`, because the graph
  // is keyed on the path each page was *written* to: under `cleanBuild:
  // 'atomic'` that is the staging path, while the stack entry's `buildTo` has
  // already been rewritten to the real one by the promotion. Mapping both sides
  // through `real()` is what makes the two agree in every mode.
  const partials = Object.fromEntries(
    Object.entries(graph?.toJSON() ?? {}).map(([partial, keys]) => [
      partial,
      keys.map((key) => real(key)).sort(byString),
    ]),
  )
  /** @type {Map<string, string[]>} */
  const partialsByPage = new Map()
  for (const [partial, keys] of Object.entries(partials))
    for (const key of keys) {
      if (!partialsByPage.has(key)) partialsByPage.set(key, [])
      partialsByPage.get(key)?.push(partial)
    }
  const pages = stack
    .map((entry) => {
      const origin = entry.origin ?? { model: NONE, controller: NONE }
      const buildTo = real(entry.buildTo)
      return {
        buildTo,
        // Right after the output path, because the map is read as the link
        // autocomplete: an agent writing `{{link}}` reads the id off the row
        // for the page it can see.
        id: entry.id ?? null,
        view: reportedView(entry.view),
        model: origin.model,
        controller: origin.controller,
        partials: (partialsByPage.get(buildTo) ?? []).sort(byString),
      }
    })
    .sort((a, b) => byString(a.buildTo ?? '', b.buildTo ?? ''))
  const map = {
    site: {
      siteUrl: config?.siteUrl ?? null,
      build: buildDir,
      folders: Object.fromEntries(
        Object.keys(folders)
          .sort(byString)
          .map((key) => [key, folders[key] ?? null]),
      ),
    },
    pages,
    partials,
    models: sourcesFrom(pages, 'model'),
    controllers: sourcesFrom(pages, 'controller'),
    pipeline: pipeline.map((step) => ({
      // The same fallback `lib/pipeline.js` uses for an unnamed step, so the
      // name in the map is the name in the report and in the failure message.
      name: step.name || String(step.run).trim().split(/\s+/)[0],
      run: step.run,
    })),
  }
  // Appended, like every key before it: a consumer diffing two maps should see
  // one new key rather than a reshuffle of the six that were already there.
  return { ...map, subjects: subjectsOf(map, readSubject) }
}

const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex')

// The default `readSubject`: a controller is the one subject that lives in a
// file, so it is the one kind this reads. Unreadable — no controllers folder,
// a file that has been deleted, a directory in its place — is `null`, which is
// the same answer as "nothing to hash": a subject with no hash is never stale,
// and guessing would be worse than saying nothing.
function diskSubjectReader(controllersDir) {
  return (kind, id) => {
    if (kind !== 'controllers' || !controllersDir) return null
    try {
      return fs.readFileSync(`${posixPath(controllersDir)}/${id}`)
    } catch {
      return null
    }
  }
}

// What a subject's hash is taken over, per kind. A **controller** is a file,
// so it is its bytes. A **pipeline step** is a command, so it is the command
// string — the step has no file of its own, and the command is the whole of
// what it does. A **URL model** has no local content at all: its id *is* the
// subject, and an id that changes is a different subject with a different
// note, so there is nothing a hash could tell anyone. Hence `null`, and hence
// a URL model that can never go stale.
function subjectHash(subject, runs, readSubject) {
  if (subject.kind === 'models') return null
  if (subject.kind === 'pipeline') {
    const run = runs.get(subject.id)
    return run === undefined ? null : sha1(String(run))
  }
  const bytes = readSubject(subject.kind, subject.id)
  if (bytes === null || bytes === undefined) return null
  // Line endings are normalised before hashing: a CRLF checkout of the same
  // controller is the same controller, and git agrees. Without this every
  // stamped controller note would read `stale` on a Windows clone.
  return sha1(String(bytes).replace(/\r\n/g, '\n'))
}

// The subject rows of the map: `noteSubjects`, in the same order, each with
// the note it wants and the hash a note can be stamped with.
function subjectsOf(map, readSubject) {
  const runs = new Map(map.pipeline.map((step) => [step.name, step.run]))
  return noteSubjects(map).map((subject) => ({
    ...subject,
    note: notePathFor(subject),
    hash: subjectHash(subject, runs, readSubject),
  }))
}

/**
 * Every subject in the map that carries judgement, sorted. A subject is a
 * controller **file**, a **URL** model or a **pipeline step**: the three things
 * a build can point at but never explain. Plain pages, partials and JSON
 * models are deliberately not subjects — a note saying "renders the about
 * page" is noise, and a rule that demands one teaches people to write noise.
 *
 * @param {SiteMap} map
 * @returns {NoteSubject[]}
 */
export function noteSubjects(map) {
  /** @type {NoteSubject[]} */
  const subjects = []
  for (const { source } of map.controllers ?? [])
    if (source.startsWith('file:'))
      subjects.push({ kind: 'controllers', id: source.slice('file:'.length) })
  for (const { source } of map.models ?? [])
    if (source.startsWith('url:'))
      subjects.push({ kind: 'models', id: source.slice('url:'.length) })
  for (const step of map.pipeline ?? [])
    subjects.push({ kind: 'pipeline', id: step.name })
  return subjects.sort(
    (a, b) => byString(a.kind, b.kind) || byString(a.id, b.id),
  )
}

// A filename derived from an id, and only from the id, so the rule a person
// applies by hand is the rule the engine applies. Dots survive (a model URL's
// host is `api.example.com`, not `api-example-com`); everything else outside
// `a-z0-9` becomes one dash.
function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  // A subject whose id is entirely outside `a-z0-9.` (a non-Latin script) would
  // otherwise have no filename at all, and every such subject would share it.
  return slug || `s-${hashId(String(value)).slice(0, 8)}`
}

// A URL model's note is named for the endpoint, not the request: the query
// string is where the page number and the api key live, and a note per page of
// results is a note nobody writes. Host + path, and nothing else.
function urlSlug(url) {
  try {
    const parsed = new URL(url)
    return slugify(`${parsed.host}${parsed.pathname}`)
  } catch {
    // Not a URL the platform will parse — classified as one only because it
    // starts with `http`. Named by what is there, minus the query.
    return slugify(
      String(url)
        .split(/[?#]/)[0]
        .replace(/^https?:\/\//, ''),
    )
  }
}

/**
 * Where a subject's note lives — a mechanical derivation from the subject's
 * id, so a person can work out the path without running anything:
 * `stockist.js` → `notes/controllers/stockist.md`,
 * `https://api.example.com/v2/events?x=1` → `notes/models/api.example.com-v2-events.md`,
 * `tailwind` → `notes/pipeline/tailwind.md`.
 *
 * @param {NoteSubject} subject
 * @param {string} [notesDir] defaults to `notes` — the path relative to the AIKB folder
 * @returns {string}
 */
export function notePathFor(subject, notesDir = 'notes') {
  const slug =
    subject.kind === 'models'
      ? urlSlug(subject.id)
      : slugify(String(subject.id).replace(/\.[cm]?js$/, ''))
  return `${notesDir}/${subject.kind}/${slug}.md`
}

/** The one frontmatter key the engine reads. It never writes it. */
const SUBJECT_HASH = 'subject-hash'

/**
 * The `---` block at the top of a note: one `key: value` per line, which is
 * all a stamp ever is. Deliberately **not** a YAML parser — the same handful
 * of lines `test/unit/plugin-manifests.test.js` reads out of a `SKILL.md`
 * header, and nothing more. A note with no block, or a block that says
 * nothing, is not an error: it is simply an unstamped note.
 *
 * @param {string} text the note's whole text
 * @returns {Record<string, string>|null} `null` when there is no block at all
 */
export function readFrontmatter(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) return null
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return fields
}

// The extensions that make a backticked word a file reference even with no
// slash in it. Everything kiss reads or writes, and nothing else.
const FILE_EXTENSION = /\.(hbs|js|mjs|cjs|json|html|md|css|scss|txt|xml)$/i
// A path has none of these in it. Prose in backticks (`{ name, origin }`,
// `<title>`, `npx kiss-ssg check`, `p-<8 hex>`) has at least one, and that is
// the whole point: a lint that fires on every note is a lint people switch
// off, so the filter errs at every step towards saying nothing.
const NOT_A_PATH = /[\s<>*{}$]/
// `https://…`, but also `file:index.json` and `url:https://…` — the map's own
// classifications, which a note quotes constantly and none of which is a path.
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

// Every distinct backticked token in a note that looks like a file reference.
// Fenced code blocks are dropped first: a note that shows the shape of a model
// or a snippet of a controller is quoting code, not citing a file.
function fileReferences(text) {
  const prose = String(text).replace(/```[\s\S]*?```/g, ' ')
  const tokens = [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim())
  return [...new Set(tokens)].filter(
    (token) =>
      token &&
      !NOT_A_PATH.test(token) &&
      // A trailing slash is a folder (`shelf/`), not a file reference.
      !token.endsWith('/') &&
      !SCHEME.test(token) &&
      (token.includes('/') || FILE_EXTENSION.test(token)),
  )
}

// What the engine writes into the build folder beside the pages. A note that
// says "the feed" or "the sitemap" cites these by filename, and a lint that
// called them dangling would be wrong on every site that has one.
const ENGINE_OUTPUTS = new Set([
  'sitemap.xml',
  'llms.txt',
  'feed.xml',
  '_redirects',
])

// Everything a note may name without being wrong: the paths and names this
// build actually used, plus the knowledge base's own folder.
function referenceResolver(map, aikbDir) {
  /** @type {Set<string>} */
  const known = new Set()
  const add = (value) => {
    if (value) known.add(posixPath(String(value)))
  }
  for (const page of map.pages ?? []) {
    add(page.view)
    add(page.buildTo)
  }
  for (const partial of Object.keys(map.partials ?? {})) add(partial)
  // `file:index.json` → `index.json`, `folder:team` → `team`,
  // `file:shelf-item.js` → `shelf-item.js`. `inline` and `none` have no colon
  // and contribute nothing, which is correct: they name no file.
  for (const { source } of [
    ...(map.models ?? []),
    ...(map.controllers ?? []),
  ]) {
    const colon = source.indexOf(':')
    if (colon !== -1) add(source.slice(colon + 1))
  }
  for (const folder of Object.values(map.site?.folders ?? {})) add(folder)
  add(map.site?.build)
  const aikb = aikbDir ? posixPath(aikbDir) : null
  return (token) => {
    const value = posixPath(token)
    if (known.has(value)) return true
    // A note is written from where the site is, not from where the build
    // script happens to be run: `shelf/arch-blend.html` is the page that the
    // build wrote to `../public/site/shelf/arch-blend.html`, and calling that
    // dangling would be a lint that punishes the only readable way to cite a
    // page. The match is anchored on a separator, so `a.html` never resolves
    // against `banana.html`.
    for (const candidate of known)
      if (candidate.endsWith(`/${value}`)) return true
    if (aikb && (value === aikb || value.startsWith(`${aikb}/`))) return true
    // Last, because they touch the disk: relative to the cwd (the folder the
    // build script is run from, so the folders in the map resolve there too),
    // then relative to the knowledge base, which is how a note cites its
    // neighbours (`notes/controllers/stockist.md`).
    if (fs.pathExistsSync(token)) return true
    if (aikb && fs.pathExistsSync(`${aikb}/${token}`)) return true
    // The files the engine itself writes into the build are things a note
    // legitimately talks about, and none of them is a page, partial or asset
    // the map lists — so they are named here, and anything else under the
    // build folder is accepted when it is there on disk.
    if (ENGINE_OUTPUTS.has(value)) return true
    const build = map.site?.build ? posixPath(map.site.build) : null
    if (build && fs.pathExistsSync(`${build}/${token}`)) return true
    // Then relative to each source folder the map names: a note cites
    // `controllers/stockist.js` the way the site's tree reads, and the folder
    // that tree hangs off (`./src`) is the map's to know, not the note's.
    return Object.values(map.site?.folders ?? {}).some(
      (folder) => folder && fs.pathExistsSync(`${posixPath(folder)}/${token}`),
    )
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * The four note rules, evaluated against a folder on disk. **missing** is a
 * subject in the map with no note; **dead** is a note whose subject is not in
 * the map — a controller that was deleted, an API that is no longer called;
 * **stale** is a note stamped with a subject hash that is no longer the
 * subject's hash, which is the note whose subject changed underneath it; and
 * **dangling** is a note citing a file that resolves to nothing. None of the
 * four is a build failure: they are findings, reported on the build report and
 * read back by whoever is closing a piece of work.
 *
 * The two new ones are mechanical on purpose. "Is this note still true?" is a
 * question only a person can answer; "was this note written against a
 * different controller?" and "does this path exist?" are questions a build can
 * answer for free, every time, and they are the two ways a note rots quietly.
 *
 * @param {SiteMap} map
 * @param {string} notesDir the `notes` folder, as a path from the cwd
 * @param {Object} [options]
 * @param {string|null} [options.aikbDir] the knowledge base's folder — `site.md` is scanned for dangling references too, and paths under the folder always resolve
 * @returns {{ missing: string[], dead: string[], stale: string[], dangling: string[] }} all four sorted
 */
export function evaluateNotes(map, notesDir, { aikbDir = null } = {}) {
  const dir = posixPath(notesDir)
  // Path → the hash a note there may be stamped with. A map from before
  // subjects existed (or one built by hand in a test) has no hashes, and
  // `null` is the right answer for it: nothing to compare, nothing stale.
  const expected = new Map(
    (
      map.subjects ??
      noteSubjects(map).map((subject) => ({ ...subject, hash: null }))
    ).map((subject) => [notePathFor(subject, dir), subject.hash ?? null]),
  )
  // Every `.md` under the folder, not just the three known kinds: a note filed
  // under a folder the engine does not recognise is exactly as dead as one
  // whose subject went away, and silently ignoring it would hide it for ever.
  const present = globFiles(dir, '**/*.md')
  /** @type {string[]} */
  const stale = []
  /** @type {string[]} */
  const dangling = []
  const resolves = referenceResolver(map, aikbDir)
  // `site.md` is authored, evergreen and about the whole site rather than any
  // one subject, so it is never missing, dead or stale — but every file
  // reference in it can rot exactly as a note's can.
  const siteFile = aikbDir ? `${posixPath(aikbDir)}/site.md` : null
  const scanned = [...present]
  if (siteFile && !scanned.includes(siteFile) && fs.pathExistsSync(siteFile))
    scanned.push(siteFile)
  for (const file of scanned) {
    const text = readText(file)
    if (text === null) continue
    const hash = expected.get(file)
    if (hash) {
      // An unstamped note is not stale — it is unstamped, which is the state
      // every note starts in and most notes stay in. Only a stamp that
      // disagrees is a finding.
      const stamp = readFrontmatter(text)?.[SUBJECT_HASH]
      if (stamp && stamp !== hash) stale.push(file)
    }
    for (const token of fileReferences(text))
      if (!resolves(token)) dangling.push(`${file}: ${token}`)
  }
  return {
    missing: [...expected.keys()]
      .filter((file) => !present.includes(file))
      .sort(),
    dead: present.filter((file) => !expected.has(file)).sort(),
    stale: stale.sort(),
    dangling: dangling.sort(),
  }
}

// Markdown tables, rendered the way prettier renders them — every cell padded
// to the widest in its column, a delimiter row of at least three dashes — so
// the generated file passes `prettier --check` in the repository it is
// committed to and the pre-commit hook never has to rewrite a build artefact.
// Width is counted in code points rather than display columns, which is the
// same number for every character kiss can put in a cell (paths are slugged to
// ASCII, and a partial name is a filename).
const cellWidth = (text) => [...text].length
const escapeCell = (value) => String(value).replace(/\|/g, '\\|')

function table(headers, rows) {
  const all = [headers, ...rows]
  const widths = headers.map((_, column) =>
    Math.max(3, ...all.map((row) => cellWidth(row[column] ?? ''))),
  )
  const line = (cells) =>
    `| ${cells
      .map((cell, i) => String(cell ?? '').padEnd(widths[i]))
      .join(' | ')} |`
  return [
    line(headers),
    `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.map(line),
  ].join('\n')
}

const code = (value) => `\`${escapeCell(value)}\``
const codeList = (values) =>
  values.length ? values.map(code).join(', ') : NONE
const EMPTY = '_None._'

const section = (heading, body) => [`## ${heading}`, body].join('\n\n')

/**
 * The human half of the map: the same data as `site-map.json`, as markdown a
 * person can read in a pull request. Deterministic — no clock, every list
 * already sorted by `buildSiteMap`.
 *
 * @param {SiteMap} map
 * @returns {string} the file's text, one trailing newline
 */
export function renderSiteMap(map) {
  const folders = Object.entries(map.site.folders).map(
    ([key, value]) =>
      `  - ${code(key)}: ${value === null ? NONE : code(value)}`,
  )
  const blocks = [
    '# Site map',
    'Generated by `kiss-ssg` from the build. **Do not edit it** — every build overwrites it. What you know that a build cannot infer goes in `notes/`, which the engine never writes.',
    section(
      'Site',
      [
        `- Site URL: ${map.site.siteUrl ? code(map.site.siteUrl) : NONE}`,
        `- Build folder: ${code(map.site.build)}`,
        '- Source folders:',
        ...folders,
      ].join('\n'),
    ),
    section(
      'Pages',
      map.pages.length
        ? table(
            [
              'Output',
              'Id',
              'View',
              'Model',
              'Controller',
              'Partials & layouts',
            ],
            map.pages.map((page) => [
              page.buildTo ? code(page.buildTo) : NONE,
              page.id ? code(page.id) : NONE,
              code(page.view),
              page.model === NONE ? NONE : code(page.model),
              page.controller === NONE ? NONE : code(page.controller),
              codeList(page.partials),
            ]),
          )
        : EMPTY,
    ),
    section(
      'Partials',
      Object.keys(map.partials).length
        ? table(
            ['Partial', 'Rendered by'],
            Object.entries(map.partials).map(([partial, pages]) => [
              code(partial),
              codeList(pages),
            ]),
          )
        : EMPTY,
    ),
    section(
      'Models',
      map.models.length
        ? table(
            ['Source', 'Pages'],
            map.models.map((model) => [
              code(model.source),
              codeList(model.pages),
            ]),
          )
        : EMPTY,
    ),
    section(
      'Controllers',
      map.controllers.length
        ? table(
            ['Controller', 'Pages'],
            map.controllers.map((controller) => [
              code(controller.source),
              codeList(controller.pages),
            ]),
          )
        : EMPTY,
    ),
    section(
      'Asset pipeline',
      map.pipeline.length
        ? table(
            ['Step', 'Command'],
            map.pipeline.map((step) => [code(step.name), code(step.run)]),
          )
        : EMPTY,
    ),
    section(
      'Subjects',
      (map.subjects ?? []).length
        ? table(
            ['Kind', 'Subject', 'Note', 'Hash'],
            (map.subjects ?? []).map((subject) => [
              subject.kind,
              code(subject.id),
              code(subject.note),
              // Twelve characters: enough to tell two hashes apart by eye in a
              // pull request, short enough not to wrap the table. The whole
              // hash is in `site-map.json`, which is what a note is stamped
              // from — never this table.
              subject.hash ? code(subject.hash.slice(0, 12)) : NONE,
            ]),
          )
        : EMPTY,
    ),
  ]
  return `${blocks.join('\n\n')}\n`
}

/**
 * The one file the engine writes and then never touches again. Written for a
 * person who has just found the folder and does not know what it is, so it
 * says which files are machine-owned, what a note is for and where one goes.
 * Its tables go through the same renderer the map's do, so the file it writes
 * needs no reformatting in the repository it is committed to.
 *
 * @returns {string} the file's text, one trailing newline
 */
export function renderAikbReadme() {
  const blocks = [
    "# AIKB — this site's knowledge base",
    'Half of this folder is written by the build and half is written by people, and the two must never be confused.',
    section(
      'Generated — never edit these',
      [
        table(
          ['File', 'Written on every record'],
          [
            [
              code('site-map.md'),
              'the pages, models, controllers, partials and subjects',
            ],
            [
              code('site-map.json'),
              'the same map, as data — including each subject’s hash',
            ],
            [code('last-build.json'), "that build's report, minus its timings"],
          ],
        ),
        '`kiss-ssg` rewrites all three every time the knowledge base is recorded (`npx kiss-ssg aikb <build-script>`), so an edit to any of them lasts until the next record. They are byte-stable across two identical records: a diff here is a real change to the shape of the site, which is why this folder is committed.',
        '`last-build.json` is also the baseline `npx kiss-ssg check <build-script>` diffs against, which says which pages the working tree would add, remove or change since the last record.',
      ].join('\n\n'),
    ),
    section(
      'Authored — the engine never writes these',
      [
        'Everything under `notes/`, and `site.md`. The map says _what_ the site is; these say **why**, which no build can work out.',
        'A note is wanted for each of the three things that carry judgement:',
        table(
          ['Subject', 'Its note'],
          [
            ['a controller file', code('notes/controllers/<file, no .js>.md')],
            [
              'a model fetched by URL',
              `${code('notes/models/<host><path>.md')} (query dropped)`,
            ],
            ['an asset pipeline step', code('notes/pipeline/<step name>.md')],
          ],
        ),
        'Plain pages, partials and `.json` models are deliberately not subjects: a note saying "renders the about page" is noise, and a rule that demands one teaches people to write noise. An inline controller and an object model have no file to attach a note to, so they cannot be subjects either.',
        '`site.md` is the one page about the whole site rather than any one subject — curated, evergreen, and the first thing to read when you come back to this repository. Five sections: **What this site is and who for** · **How it is deployed** · **Conventions** · **Standing gotchas** · **Retired feedback**. Nothing generates it and nothing enforces its shape; the `kiss-memory-consolidate` skill maintains it, folding the durable lessons out of old session logs so they stop being re-read one by one.',
      ].join('\n\n'),
    ),
    section(
      'The stamp',
      [
        "Every subject in `site-map.json` carries a `hash` — sha1 of the controller file's bytes, or of the pipeline step's command (a URL model has none: its id _is_ the subject). Copy that hash into the note's frontmatter as `subject-hash` whenever you write or review the note, and the next build can tell you when the subject has moved on without it.",
        'A note with no stamp is not wrong — it is simply unstamped, and never reported stale. The engine never writes a stamp; only you (or the skill closing a piece of work) do.',
      ].join('\n\n'),
    ),
    section(
      'What every build reports',
      [
        table(
          ['Finding', 'Means'],
          [
            [code('missing'), 'a subject nobody has explained'],
            [code('dead'), 'a note under `notes/` whose subject is gone'],
            [
              code('stale'),
              "the note's stamp is not the subject's current hash",
            ],
            [
              code('dangling'),
              'a note (or `site.md`) cites a file that resolves to nothing',
            ],
          ],
        ),
        'None of the four fails a build or changes an exit code — they are findings, printed by `npx kiss-ssg check --summary` and carried on the build report under `aikb.notes`. Write the missing ones; delete or rewrite the dead ones; re-read the subject and restamp the stale ones; fix or drop the dangling references.',
        'Only backticked text that looks like a file reference is checked for dangling — something with a `/` in it, or ending in a known extension, and with no spaces or punctuation that a path cannot hold. Prose in backticks is left alone.',
      ].join('\n\n'),
    ),
    section(
      'The note template',
      [
        '```markdown',
        '---',
        'subject-hash: <the subject’s hash, from site-map.json>',
        '---',
        '',
        '## What it does',
        '',
        'One paragraph. What a reader would otherwise have to infer from the code.',
        '',
        '## Why it is this way',
        '',
        'The decision and the constraint behind it — the upstream that returns a',
        'different shape on Sundays, the ordering the client asked for, the field',
        'that is optional in the feed and required on the page.',
        '',
        '## Gotchas',
        '',
        'What bites. What broke last time. What looks wrong but is deliberate.',
        '```',
      ].join('\n'),
    ),
  ]
  return `${blocks.join('\n\n')}\n`
}

/**
 * Evaluates the note rules and, when this build is a record, writes the
 * generated half of the folder. A failure to write is logged and reported as
 * `written: false` — never a build failure. The site the author asked for is
 * still the site they get, minus its map.
 *
 * @param {Object} input
 * @param {SiteMap} input.map
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {any} input.logger
 * @param {boolean} [input.write] `false` on an ordinary build: evaluate, write nothing
 * @returns {Promise<AikbResult>}
 */
export async function writeAikb({ map, folder, logger, write = true }) {
  const dir = posixPath(folder)
  const notes = evaluateNotes(map, `${dir}/notes`, { aikbDir: dir })
  // Carried on the report as well as in `site-map.json`, because the two say
  // different things at the one moment that matters. A piece of work closes
  // with the map on disk still describing the *previous* record, so the hash
  // in that file is the hash the note is already stamped with; the hash a
  // note should be restamped with is this build's, and until the record is
  // made this report is the only place it exists.
  const subjects = map.subjects ?? []
  if (!write) return { folder: dir, written: false, notes, subjects }
  try {
    // Written once and never again: the guidance is the author's to rewrite
    // for their own site, and a build that overwrote it would be the one file
    // in the folder that punishes you for doing what it asks.
    if (!(await fs.pathExists(`${dir}/README.md`)))
      await fs.outputFile(`${dir}/README.md`, renderAikbReadme())
    await fs.outputFile(`${dir}/site-map.md`, renderSiteMap(map))
    await fs.outputJson(`${dir}/site-map.json`, map, { spaces: 2 })
  } catch (err) {
    logger.error(`Could not write ${dir}: ${err.message}`)
    return { folder: dir, written: false, notes, subjects }
  }
  logger.success(`${dir}/site-map.md`)
  return { folder: dir, written: true, notes, subjects }
}

/**
 * The report as `last-build.json` keeps it: every timing dropped, so two
 * identical builds write the same bytes and git only ever shows a real change.
 * Key order is otherwise the report's own.
 *
 * @param {import('./build-report.js').BuildReport} report
 * @returns {Record<string, any>}
 */
export function lastBuildRecord(report) {
  // Typed loosely on purpose: the record is deliberately *not* a `BuildReport`
  // any more — it has no `duration`, and its pipeline steps have none either.
  /** @type {Record<string, any>} */
  const record = { ...report }
  delete record.duration
  // Reassigned rather than rebuilt, so `pipeline` keeps its place in the key
  // order the report fixed.
  record.pipeline = (report.pipeline ?? []).map(({ name, ok }) => ({
    name,
    ok,
  }))
  return record
}

/**
 * Writes `last-build.json`. Separate from `writeAikb` because it needs the
 * finished report, and the report needs `writeAikb`'s verdict — the map is
 * evaluated first so the report can carry it, and the report is written second.
 *
 * @param {Object} input
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {import('./build-report.js').BuildReport} input.report
 * @param {any} input.logger
 * @returns {Promise<boolean>} whether the file was written
 */
export async function writeLastBuild({ folder, report, logger }) {
  const file = `${posixPath(folder)}/last-build.json`
  try {
    await fs.outputJson(file, lastBuildRecord(report), { spaces: 2 })
    return true
  } catch (err) {
    logger.error(`Could not write ${file}: ${err.message}`)
    return false
  }
}
