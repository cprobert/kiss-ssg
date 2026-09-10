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
// All this module does about a note is say which ones are missing and which
// have outlived their subject.
//
// Everything but `writeAikb`/`writeLastBuild` is pure, and everything rendered
// is sorted with no timestamp and no duration anywhere: two identical builds
// must write byte-identical files, or the folder churns in git on every build
// and the diff stops meaning anything.

import fs from 'fs-extra'
import { globFiles, hashId, posixPath } from './utils.js'
import { reportedPath, reportedView } from './build-report.js'

/**
 * One page as the map records it.
 *
 * @typedef {Object} SiteMapPage
 * @property {string|null} buildTo the file it writes, against the real build folder
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
 * @property {boolean} written `false` under check mode, and when a write failed
 * @property {{ missing: string[], dead: string[] }} notes both sorted
 */

/** The classification of a page with no model and no controller. */
const NONE = 'none'

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
 * @param {{ view: string, buildTo: string|null, origin?: { model: string, controller: string } }[]} [input.stack] the prepared pages
 * @param {import('./dependency-graph.js').DependencyGraph|null} [input.graph] filled by rendering, so this only works on a settled build
 * @param {any} input.config the resolved config
 * @param {import('./pipeline.js').PipelineStep[]} [input.pipeline] defaults to `config.assets.pipeline`
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling paths are reported against, if there was one
 * @returns {SiteMap}
 */
export function buildSiteMap({
  stack = [],
  graph = null,
  config,
  pipeline = config?.assets?.pipeline ?? [],
  buildDir,
  stagingDir = null,
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
        view: reportedView(entry.view),
        model: origin.model,
        controller: origin.controller,
        partials: (partialsByPage.get(buildTo) ?? []).sort(byString),
      }
    })
    .sort((a, b) => byString(a.buildTo ?? '', b.buildTo ?? ''))
  return {
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

/**
 * The two note rules, evaluated against a folder on disk. **missing** is a
 * subject in the map with no note; **dead** is a note whose subject is not in
 * the map — a controller that was deleted, an API that is no longer called.
 * Neither is a build failure: they are findings, reported on the build report
 * and read back by whoever is closing a piece of work.
 *
 * @param {SiteMap} map
 * @param {string} notesDir the `notes` folder, as a path from the cwd
 * @returns {{ missing: string[], dead: string[] }} both sorted
 */
export function evaluateNotes(map, notesDir) {
  const dir = posixPath(notesDir)
  const expected = new Set(
    noteSubjects(map).map((subject) => notePathFor(subject, dir)),
  )
  // Every `.md` under the folder, not just the three known kinds: a note filed
  // under a folder the engine does not recognise is exactly as dead as one
  // whose subject went away, and silently ignoring it would hide it for ever.
  const present = globFiles(dir, '**/*.md')
  return {
    missing: [...expected].filter((file) => !present.includes(file)).sort(),
    dead: present.filter((file) => !expected.has(file)).sort(),
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
            ['Output', 'View', 'Model', 'Controller', 'Partials & layouts'],
            map.pages.map((page) => [
              page.buildTo ? code(page.buildTo) : NONE,
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
          ['File', 'Written on every build'],
          [
            [
              code('site-map.md'),
              'the pages, models, controllers and partials',
            ],
            [code('site-map.json'), 'the same map, as data'],
            [code('last-build.json'), "that build's report, minus its timings"],
          ],
        ),
        '`kiss-ssg` rewrites all three on every build, so an edit to any of them lasts until the next one. They are byte-stable across two identical builds: a diff here is a real change to the shape of the site, which is why this folder is committed.',
        '`last-build.json` is also the baseline for `npx kiss-ssg check --against AIKB/last-build.json <build-script>`, which says which pages the working tree would add, remove or change.',
      ].join('\n\n'),
    ),
    section(
      'Authored — the engine never writes these',
      [
        'Everything under `notes/`. The map says _what_ the site is; a note says **why**, which no build can work out.',
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
        'Plain pages, partials and `.json` models are deliberately not subjects: a note saying "renders the about page" is noise, and a rule that demands one teaches people to write noise.',
        'Every build reports two findings — a **missing** note (a subject nobody has explained) and a **dead** note (a note whose subject is gone). Neither fails the build. Write the missing ones; delete or rewrite the dead ones.',
      ].join('\n\n'),
    ),
    section(
      'The note template',
      [
        '```markdown',
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
 * Evaluates the note rules and, unless this is a check, writes the generated
 * half of the folder. A failure to write is logged and reported as
 * `written: false` — never a build failure. The site the author asked for is
 * still the site they get, minus its map.
 *
 * @param {Object} input
 * @param {SiteMap} input.map
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {any} input.logger
 * @param {boolean} [input.write] `false` under check mode: evaluate, write nothing
 * @returns {Promise<AikbResult>}
 */
export async function writeAikb({ map, folder, logger, write = true }) {
  const dir = posixPath(folder)
  const notes = evaluateNotes(map, `${dir}/notes`)
  if (!write) return { folder: dir, written: false, notes }
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
    return { folder: dir, written: false, notes }
  }
  logger.success(`${dir}/site-map.md`)
  return { folder: dir, written: true, notes }
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
