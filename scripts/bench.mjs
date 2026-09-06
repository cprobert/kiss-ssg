#!/usr/bin/env node
// The benchmark harness: what makes "faster" a number rather than a claim.
//
// Three design decisions worth knowing before reading the code.
//
// **Every iteration is a fresh child process.** A build is a one-shot `node
// build.js` in real life, so measuring repeated builds inside one process would
// flatter us with JIT warmup and a hot module graph that no user ever gets.
// `--child` is how this file re-enters itself as that child; the parent only
// spawns, aggregates and prints.
//
// **Page count is a parameter, not a constant.** A fix that wins on 2000 pages
// can lose on 10 (a worker pool costs more than it saves on a small site), so
// the fixture is generated at whatever `--pages` says and the default sweep
// reports both ends.
//
// **Phases are measured at public API boundaries**, never by instrumenting
// `lib/`. The engine under test is the published one, unmodified — otherwise
// the harness measures a build that nobody ships. The cost is granularity:
// this can say `build` is slow, not which line of it is. `--profile` hands that
// question to `node --cpu-prof`.
//
// Usage:
//   node scripts/bench.mjs                          # default sweep, human table
//   node scripts/bench.mjs --pages=500 --runs=7
//   node scripts/bench.mjs --scenario=scan,models
//   node scripts/bench.mjs --json=baseline.json     # record
//   node scripts/bench.mjs --baseline=baseline.json # record and compare
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BENCH_DIR = path.join(ROOT, '.bench')

// ---------------------------------------------------------------------------
// Pure helpers (exported for test/unit/bench.test.js)
// ---------------------------------------------------------------------------

export const SCENARIOS = [
  'startup',
  'scan',
  'models',
  'fanout',
  'watch',
  'styled',
]

export const DEFAULTS = {
  pages: [50, 500],
  runs: 5,
  scenario: SCENARIOS,
  json: null,
  baseline: null,
  loud: false,
  clean: false,
  profile: false,
  // A comma-separated list of real kiss-ssg sites to time alongside (or instead
  // of) the generated fixture. `--entry` names the build script when the site's
  // package.json does not make it obvious.
  site: [],
  entry: null,
}

// Naming real sites means you want those sites, not a fixture sweep alongside
// them — unless you asked for both by naming scenarios too.
export function scenariosToRun(opts, scenarioWasExplicit) {
  if (opts.site.length > 0 && !scenarioWasExplicit) return []
  return opts.scenario
}

// `--json` always writes. `--baseline` compares against a file and writes it
// only when it is not there yet, so the first run bootstraps a baseline and no
// later run can silently overwrite the number it is being judged against.
export function recordTarget(opts, exists) {
  if (opts.json) return opts.json
  if (opts.baseline && !exists(opts.baseline)) return opts.baseline
  return null
}

// `--pages=50,500` sweeps; `--runs=7` is scalar; `--loud` is a bare flag. Kept
// deliberately small — a bench nobody can invoke from memory gets run once.
export function parseArgs(argv, defaults = DEFAULTS) {
  const opts = { ...defaults }
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=')
    const key = rawKey.trim()
    if (!(key in defaults)) throw new Error(`unknown option: --${key}`)
    const fallback = defaults[key]
    if (typeof fallback === 'boolean') {
      opts[key] = rawValue === undefined ? true : rawValue !== 'false'
    } else if (Array.isArray(fallback)) {
      const parts = (rawValue ?? '').split(',').filter(Boolean)
      if (parts.length === 0) throw new Error(`--${key} needs a value`)
      opts[key] = typeof fallback[0] === 'number' ? parts.map(Number) : parts
    } else {
      if (rawValue === undefined) throw new Error(`--${key} needs a value`)
      opts[key] = typeof fallback === 'number' ? Number(rawValue) : rawValue
    }
  }
  const unknown = opts.scenario.filter((s) => !SCENARIOS.includes(s))
  if (unknown.length) throw new Error(`unknown scenario: ${unknown.join(', ')}`)
  if (opts.pages.some((n) => !Number.isFinite(n) || n < 1))
    throw new Error('--pages must be positive numbers')
  if (!Number.isFinite(opts.runs) || opts.runs < 1)
    throw new Error('--runs must be a positive number')
  return opts
}

// Median, not mean: one GC pause or one noisy-neighbour scheduling hiccup skews
// a mean of five runs enough to invent or hide a 10% win. `min` is reported
// beside it as the closest thing to an uncontended machine.
export function stats(samples) {
  const values = samples.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (values.length === 0) return null
  const mid = Math.floor(values.length / 2)
  return {
    n: values.length,
    min: values[0],
    median:
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid],
    max: values[values.length - 1],
  }
}

// Run-to-run noise on a shared CI box is comfortably ±5%, so a delta inside
// that band is reported as "=" rather than dressed up as a win. Being honest
// here is the whole point of having a baseline.
export const NOISE_FLOOR = 0.05

export function compare(current, baseline, noiseFloor = NOISE_FLOOR) {
  if (!baseline || !Number.isFinite(baseline.median)) return null
  const ratio = (current.median - baseline.median) / baseline.median
  return {
    ratio,
    verdict:
      Math.abs(ratio) < noiseFloor ? 'same' : ratio < 0 ? 'faster' : 'slower',
  }
}

const ms = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

export function formatRow(label, s, delta) {
  const cells = [
    label.padEnd(28),
    `${ms(s.median)}ms`.padStart(9),
    `${ms(s.min)}ms`.padStart(9),
    `${ms(s.max)}ms`.padStart(9),
  ]
  if (delta) {
    const pct = `${delta.ratio > 0 ? '+' : ''}${(delta.ratio * 100).toFixed(1)}%`
    const mark = { faster: '↓', slower: '↑', same: '=' }[delta.verdict]
    cells.push(`${mark} ${pct}`.padStart(10))
  }
  return cells.join(' ')
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

// One generated site, deterministic for a given page count, so two runs
// measure the engine rather than two different piles of markup. Nested a few
// levels deep because a flat pages/ folder never exercises the `root` climb or
// the path derivation that real sites lean on.
export function fixturePlan(pages) {
  const perSection = Math.max(1, Math.ceil(pages / 10))
  return Array.from({ length: pages }, (_, i) => {
    const section = Math.floor(i / perSection)
    return {
      index: i,
      section: `section-${section}`,
      name: `page-${i}`,
      view: `section-${section}/page-${i}.hbs`,
      depth: 1,
    }
  })
}

const LAYOUT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{#if model.title}}{{model.title}}{{else}}{{title}}{{/if}} · {{config.site.name}}</title>
  <meta name="description" content="{{config.site.tagline}}">
  <link rel="stylesheet" href="{{root}}css/site.css">
  {{#block "head"}}{{/block}}
</head>
<body>
  <header>
    {{> "nav"}}
  </header>
  <main>{{#block "main"}}{{/block}}</main>
  {{> "footer"}}
</body>
</html>
`

const NAV = `<nav>
{{#each config.nav}}
  {{#isActive .. href=href label=label root=../root active="on"}}
  <a class="{{active}}" href="{{root}}{{href}}">{{label}}</a>
  {{/isActive}}
{{/each}}
</nav>
`

const FOOTER = `<footer>
  <p>{{config.site.name}} — built by kiss-ssg</p>
  {{> "note"}}
</footer>
`

const NOTE = `A **markdown** partial, so the Remarkable render path is on the
clock too — it is not free and real sites use it.
`

const CARD = `<article class="card">
  <h3>{{title}}</h3>
  <p>{{body}}</p>
</article>
`

// Enough Handlebars to be representative: layout inheritance, three partials,
// an {{#each}} over model data and two helpers. A one-line template would make
// every render look free and send us optimising the wrong thing.
const pageTemplate = (page) => `{{#extend "layout" root="../"}}
  {{#content "main"}}
  <h1>${page.name}</h1>
  <p class="eyebrow">${page.section}</p>
  {{#if model.body}}<div>{{{markdown model.body}}}</div>{{/if}}
  <div class="grid">
    {{#each model.items}}
      {{> "card" title=this.title body=this.body}}
    {{/each}}
  </div>
  <p class="meta">{{stringify model.meta}}</p>
  {{/content}}
{{/extend}}
`

// The same page, plus the one line that makes it a `styled` page: a partial
// that compiles a shared stylesheet at render time. Every page includes it, so
// every page pays for that compile — which is the whole point of the scenario.
const styledPageTemplate = (page) =>
  pageTemplate(page).replace(
    '{{#content "main"}}',
    '{{#content "main"}}\n  <style>{{> "styles"}}</style>',
  )

// A fan-out view lives outside pages/ so the scan scenario cannot pick it up —
// the two scenarios must measure different things, not overlapping page sets.
const ITEM_VIEW = `{{#extend "layout" root="../"}}
  {{#content "main"}}
  <h1>{{model.title}}</h1>
  <div>{{{markdown model.body}}}</div>
  <p>{{stringify model.meta}}</p>
  {{/content}}
{{/extend}}
`

const model = (i) => ({
  title: `Page ${i}`,
  body: `Body copy for page ${i}, with *emphasis* and a [link](https://example.com).`,
  meta: { index: i, tags: ['alpha', 'beta', 'gamma'], published: true },
  items: Array.from({ length: 6 }, (_, k) => ({
    title: `Item ${k}`,
    body: `Supporting copy ${k} for page ${i}.`,
  })),
})

// ---------------------------------------------------------------------------
// The `styled` fixture: a real site's shape, not a real site's stylesheets
// ---------------------------------------------------------------------------
//
// Profiling `learna-ltd/diploma-msc` found the dominant cost of a real build in
// a place the synthetic fixture could not see: the `{{sass}}` helper compiles at
// render time, so a stylesheet named by a partial is recompiled once per page
// that includes it. There, `catalog.scss` costs 76ms and is included by 111
// course pages.
//
// That workload is reproduced rather than vendored — copying a client's
// stylesheets into a published npm package would be wrong, and pinning the
// benchmark to someone else's private repo would make it unrunnable. Instead the
// generator below is calibrated against the real thing: 25 modules compiles in
// ~66ms and emits ~27KB of CSS, against catalog.scss's 76ms and 22KB. Close
// enough that a fix proven here is a fix there.
//
// Split across an entry and two `@use`d partials on purpose: real stylesheets
// import, and a cache that keys on the entry alone would look correct here and
// be wrong in `watch`, where the edit usually lands in a partial.
const STYLE_MODULES = 25

const SCSS_VARS = `@use 'sass:color';
$brand: #3366cc;
$accent: #cc6633;
$space: 8px;
${Array.from(
  { length: 40 },
  (_, v) => `$c${v}: color.adjust($brand, $hue: ${v * 3}deg);`,
).join('\n')}
`

const SCSS_MIXINS = `@use 'sass:color';
@use 'sass:math';
@mixin card($bg, $pad) {
  background: $bg;
  padding: $pad;
  border-radius: math.div($pad, 2);
  &:hover { background: color.adjust($bg, $lightness: 5%); }
  .title { font-weight: 700; .sub { opacity: .8; } }
}
`

const SCSS_ENTRY = `@use 'sass:color';
@use './vars' as v;
@use './mixins' as m;
${Array.from(
  { length: STYLE_MODULES },
  (_, i) => `.mod-${i} {
  @include m.card(v.$c${i % 40}, v.$space * ${1 + (i % 4)});
  .row { display: flex; .col { flex: 1; .cell { color: color.adjust(v.$c${i % 40}, $lightness: ${i % 20}%); } } }
  @for $j from 1 through 15 {
    .u-#{$j} { padding: #{$j * 4}px; border-color: color.adjust(v.$accent, $lightness: $j * 1%); }
  }
}`,
).join('\n')}
`

// Regenerated whenever the page count changes; a marker file records what is on
// disk so an unchanged sweep does not pay to rewrite thousands of files.
export function buildFixture(dir, pages) {
  const marker = path.join(dir, '.fixture.json')
  const want = JSON.stringify({ pages, v: 2 })
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === want) return
  fs.rmSync(dir, { recursive: true, force: true })

  const src = path.join(dir, 'src')
  const write = (rel, body) => {
    const file = path.join(src, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }

  write('layouts/layout.hbs', LAYOUT)
  write('partials/nav.hbs', NAV)
  write('partials/footer.hbs', FOOTER)
  write('partials/card.hbs', CARD)
  write('partials/note.md', NOTE)
  write('views/item.hbs', ITEM_VIEW)
  write('assets/css/site.css', 'body{font:16px/1.5 system-ui;margin:0}\n')

  write('scss/_vars.scss', SCSS_VARS)
  write('scss/_mixins.scss', SCSS_MIXINS)
  write('scss/shared.scss', SCSS_ENTRY)
  // The helper takes a path, and an absolute one is independent of the cwd the
  // child happens to run in. JSON.stringify escapes it for the Handlebars
  // string literal, which matters on Windows.
  const sheet = path.join(src, 'scss', 'shared.scss')
  write('partials/styles.hbs', `{{sass ${JSON.stringify(sheet)}}}\n`)

  for (const page of fixturePlan(pages)) {
    write(`pages/${page.view}`, pageTemplate(page))
    write(`pages-styled/${page.view}`, styledPageTemplate(page))
    write(`models/${page.name}.json`, JSON.stringify(model(page.index)))
    write(`models/items/${page.name}.json`, JSON.stringify(model(page.index)))
  }

  fs.writeFileSync(marker, want)
}

// ---------------------------------------------------------------------------
// Child: one measured iteration, in its own process
// ---------------------------------------------------------------------------

const now = () => performance.now()

async function runChild(scenario, dir, pages, loud) {
  const { silentLogger } = await import('../lib/logger.js')
  const src = path.join(dir, 'src')
  const out = path.join(dir, `out-${scenario}`)

  const baseConfig = (extra = {}) => ({
    site: { name: 'Bench', tagline: 'measured, not guessed' },
    nav: [{ href: 'index.html', label: 'Home' }],
    folders: {
      src,
      build: out,
      pages: path.join(src, 'pages'),
      layouts: path.join(src, 'layouts'),
      partials: path.join(src, 'partials'),
      models: path.join(src, 'models'),
      // Assets are out of scope this branch, and a Sass compile would dominate
      // the clock. One plain stylesheet keeps the copy path honest without
      // letting it own the measurement.
      assets: path.join(src, 'assets'),
    },
    verbose: false,
    ...(loud ? {} : { logger: silentLogger }),
    ...extra,
  })

  // Import cost is a phase in its own right: `npx kiss-ssg check` pays it before
  // any work happens, and so does every one-page site.
  const t0 = now()
  const { default: Kiss } = await import('../lib/kiss.js')
  const importMs = now() - t0

  if (scenario === 'startup') {
    // `process` is filled in by the parent, which is the only side that can see
    // node's own bootstrap.
    return [{ import: importMs, process: null }]
  }

  const plan = fixturePlan(pages)
  // The fan-out view sits in src/views, outside the scanned pages folder, so
  // `.page()`'s view paths resolve against it for this scenario alone.
  const scenarioConfig = {
    fanout: { folders: { pages: path.join(src, 'views') } },
    // dev:true is the point of the watch scenario; the ports are randomised so
    // a previous iteration still releasing its socket cannot fail the next one.
    // Its own pages folder, so `scan` and `styled` measure different things
    // rather than overlapping page sets.
    styled: { folders: { pages: path.join(src, 'pages-styled') } },
    watch: { dev: true, port: 0, livereloadPort: 0 },
  }[scenario]
  const config = baseConfig()
  if (scenarioConfig?.folders)
    Object.assign(config.folders, scenarioConfig.folders)
  Object.assign(config, { ...scenarioConfig, folders: config.folders })

  const tConstruct = now()
  const kiss = new Kiss(config)
  const construct = now() - tConstruct

  const tRegister = now()
  if (scenario === 'scan' || scenario === 'styled') {
    kiss.scan()
  } else if (scenario === 'models') {
    for (const page of plan)
      kiss.page({ view: page.view, model: `${page.name}.json` })
  } else if (scenario === 'fanout' || scenario === 'watch') {
    if (scenario === 'watch') kiss.scan()
    else
      kiss.pages({
        view: 'item.hbs',
        model: 'items',
        path: 'items',
        controller: ({ model }) => ({
          model,
          slug: `item-${model.meta.index}`,
        }),
      })
  }
  const register = now() - tRegister

  const tBuild = now()
  kiss.generate()
  await kiss.complete()
  const build = now() - tBuild
  const report = kiss.report()

  const sample = {
    import: importMs,
    construct,
    register,
    build,
    total: now() - tConstruct,
    engine: report?.duration ?? null,
    pages: report?.pages.length ?? 0,
    ok: report?.ok ?? false,
  }

  if (scenario !== 'watch') return [sample]

  // Watch latency is measured end to end — edit saved, output on disk — because
  // that is the loop a developer actually feels. Polling the output file (not a
  // library hook) keeps the measurement on the public surface, and covers the
  // scoped re-render, which produces no new build report to observe.
  const samples = []
  kiss.watch()
  const first = plan[0]
  const viewFile = path.join(src, 'pages', first.view)
  const original = fs.readFileSync(viewFile, 'utf8')
  const outFile = path.join(out, first.section, `${first.name}.html`)
  try {
    // One discarded warmup: chokidar's first event after startup pays for
    // watcher registration that no later edit repeats.
    for (let i = 0; i < 4; i++) {
      const marker = `bench-marker-${i}-${Date.now()}`
      const edited = original.replace('<h1>', `<h1>${marker} `)
      const tTouch = now()
      fs.writeFileSync(viewFile, edited)
      await until(() => fs.readFileSync(outFile, 'utf8').includes(marker))
      if (i > 0) samples.push({ ...sample, rerender: now() - tTouch })
    }
  } finally {
    fs.writeFileSync(viewFile, original)
    await kiss.close()
  }
  return samples
}

// Polls rather than subscribes: there is no public "rebuild finished" event,
// and a 2ms poll against a rebuild measured in tens of ms costs less error than
// reaching into private state would cost in honesty.
async function until(predicate, timeout = 30000, interval = 2) {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      if (predicate()) return
    } catch {
      // The output file may not exist yet on the first poll of a replay.
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for rebuild')
    await new Promise((r) => setTimeout(r, interval))
  }
}

// ---------------------------------------------------------------------------
// Real sites
// ---------------------------------------------------------------------------

// A generated fixture is an argument about what a site looks like; a real site
// is the thing itself. `--site=<path>` times a real one without touching it:
// its own build script, in its own working directory, with `KISS_REPORT` set so
// the engine reports what it built. Nothing is installed, linked or edited.
//
// Which kiss-ssg gets measured is whatever that site resolves — usually the
// published one from its node_modules. The resolved path is printed with the
// result, because a before/after where the two runs quietly measured different
// copies of the engine is worse than no measurement at all.

// package.json's build script is the site's own answer to "how is this built",
// so prefer it over guessing a filename. Only a bare `node <script>` is read —
// anything with a pipe, an env prefix or a chained command is left to the
// operator to name explicitly, rather than half-parsed.
export function resolveSiteEntry(pkg, explicit) {
  if (explicit) return explicit
  const script = pkg?.scripts?.build
  const match = script && /^node\s+([^\s&|<>]+)\s*$/.exec(script.trim())
  return match ? match[1] : null
}

// One line per settled build, so a site that constructs several Kiss instances
// (an archive of per-version outputs, say) is summed rather than reported as
// whichever build happened to finish last.
export function summariseReports(lines) {
  const reports = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  if (reports.length === 0) return null
  return {
    builds: reports.length,
    engine: reports.reduce((n, r) => n + (r.duration ?? 0), 0),
    pages: reports.reduce((n, r) => n + (r.pages?.length ?? 0), 0),
    assets: reports.reduce((n, r) => n + (r.assets?.length ?? 0), 0),
    failures: reports.reduce((n, r) => n + (r.failures?.length ?? 0), 0),
    ok: reports.every((r) => r.ok),
  }
}

function resolveKissFrom(siteDir) {
  const r = spawnSync(
    process.execPath,
    [
      '-e',
      "const{createRequire}=require('node:module');const rq=createRequire(process.cwd()+'/x.js');" +
        "try{const p=rq.resolve('kiss-ssg');const pkg=rq('kiss-ssg/package.json');" +
        "console.log(JSON.stringify({path:p,version:pkg.version}))}catch(e){console.log('null')}",
    ],
    { cwd: siteDir, encoding: 'utf8' },
  )
  try {
    return JSON.parse(r.stdout.trim())
  } catch {
    return null
  }
}

function benchSite(siteDir, opts) {
  const dir = path.resolve(siteDir)
  if (!fs.existsSync(dir)) throw new Error(`no such site directory: ${dir}`)
  const pkgPath = path.join(dir, 'package.json')
  const pkg = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    : null
  const entry = resolveSiteEntry(pkg, opts.entry)
  if (!entry)
    throw new Error(
      `could not work out how to build ${dir} — name it with --entry=<script>`,
    )
  if (!fs.existsSync(path.join(dir, entry)))
    throw new Error(`entry script not found: ${path.join(dir, entry)}`)

  const resolved = resolveKissFrom(dir)
  const reportFile = path.join(BENCH_DIR, `report-${process.pid}.jsonl`)
  const samples = []
  const run = () => {
    fs.rmSync(reportFile, { force: true })
    const started = now()
    const r = spawnSync(process.execPath, [entry], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, KISS_REPORT: reportFile, NO_COLOR: '1' },
      // A site that fetches URL models can sit for a long time; better a clear
      // timeout than a bench that looks hung.
      timeout: 600000,
    })
    const processMs = now() - started
    const lines = fs.existsSync(reportFile)
      ? fs.readFileSync(reportFile, 'utf8').split('\n')
      : []
    const summary = summariseReports(lines)
    if (r.status !== 0 && !summary)
      throw new Error(
        `build failed in ${dir}:\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-15).join('\n')}`,
      )
    return { process: processMs, ...(summary ?? {}) }
  }

  // Same warmup rule as the fixture scenarios: the first build of a checkout
  // pays for a cold page cache no later run repeats.
  run()
  for (let i = 0; i < opts.runs; i++) samples.push(run())
  fs.rmSync(reportFile, { force: true })

  return {
    site: path.basename(dir),
    entry,
    kiss: resolved,
    builtPages: samples[0]?.pages ?? null,
    builds: samples[0]?.builds ?? null,
    ok: samples.every((s) => s.ok !== false),
    phases: summarise(samples),
  }
}

// ---------------------------------------------------------------------------
// Parent: spawn, aggregate, report
// ---------------------------------------------------------------------------

const CHILD_MARKER = '__BENCH_JSON__'

function spawnIteration(scenario, dir, pages, opts) {
  const args = [
    ...(opts.profile
      ? ['--cpu-prof', '--cpu-prof-dir', path.join(BENCH_DIR, 'profiles')]
      : []),
    fileURLToPath(import.meta.url),
    `--child=${scenario}`,
    `--dir=${dir}`,
    `--pages=${pages}`,
    ...(opts.loud ? ['--loud'] : []),
  ]
  const started = now()
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  const processMs = now() - started
  if (r.status !== 0)
    throw new Error(
      `${scenario} iteration failed:\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-15).join('\n')}`,
    )
  const line = r.stdout.split('\n').find((l) => l.startsWith(CHILD_MARKER))
  if (!line) throw new Error(`${scenario} iteration produced no result`)
  return JSON.parse(line.slice(CHILD_MARKER.length)).map((s) => ({
    ...s,
    process: s.process ?? processMs,
  }))
}

const PHASE_ORDER = [
  'process',
  'import',
  'construct',
  'register',
  'build',
  'total',
  'engine',
  'rerender',
]

export function summarise(samples) {
  const out = {}
  for (const phase of PHASE_ORDER) {
    const s = stats(samples.map((x) => x[phase]))
    if (s) out[phase] = s
  }
  return out
}

async function main(argv) {
  const opts = parseArgs(argv)
  // Fixtures are kept between runs on purpose — regenerating 2000 files to
  // measure the same thing twice is pure waste, and buildFixture's marker makes
  // reuse safe. `--clean` is the escape hatch when the generator itself changes.
  if (opts.clean) fs.rmSync(BENCH_DIR, { recursive: true, force: true })
  fs.mkdirSync(BENCH_DIR, { recursive: true })
  const baseline =
    opts.baseline && fs.existsSync(opts.baseline)
      ? JSON.parse(fs.readFileSync(opts.baseline, 'utf8'))
      : null

  const results = {
    meta: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cpus: (await import('node:os')).cpus().length,
      commit: gitCommit(),
      recordedAt: new Date().toISOString(),
      runs: opts.runs,
      loud: opts.loud,
    },
    scenarios: {},
  }

  for (const site of opts.site) {
    const key = `site:${path.basename(path.resolve(site))}`
    process.stderr.write(`  running ${key} …`)
    results.scenarios[key] = benchSite(site, opts)
    process.stderr.write(' done\n')
  }

  const scenarios = scenariosToRun(
    opts,
    argv.some((a) => a.startsWith('--scenario')),
  )
  for (const pages of scenarios.length ? opts.pages : []) {
    const dir = path.join(BENCH_DIR, `fixture-${pages}`)
    buildFixture(dir, pages)
    for (const scenario of scenarios) {
      const key = scenario === 'startup' ? 'startup' : `${scenario}@${pages}`
      if (results.scenarios[key]) continue
      process.stderr.write(`  running ${key} …`)
      const samples = []
      // One discarded warmup run: the first build of a fixture pays for a cold
      // page cache that no later run repeats, and reporting it as a sample
      // would make every scenario look worse than it is in a warm CI loop.
      spawnIteration(scenario, dir, pages, opts)
      for (let i = 0; i < opts.runs; i++)
        samples.push(...spawnIteration(scenario, dir, pages, opts))
      results.scenarios[key] = {
        pages: scenario === 'startup' ? null : pages,
        builtPages: samples[0]?.pages ?? null,
        ok: samples.every((s) => s.ok !== false),
        phases: summarise(samples),
      }
      process.stderr.write(' done\n')
    }
  }

  print(results, baseline)

  const target = recordTarget(opts, (f) => fs.existsSync(f))
  if (target) {
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(results, null, 2)}\n`)
    console.log(`\nrecorded → ${path.relative(ROOT, path.resolve(target))}`)
  }

  const failed = Object.entries(results.scenarios).filter(([, r]) => !r.ok)
  if (failed.length) {
    console.error(`\n${failed.length} scenario(s) reported a failed build.`)
    process.exit(1)
  }
}

function gitCommit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  })
  return r.status === 0 ? r.stdout.trim() : null
}

function print(results, baseline) {
  const { meta } = results
  console.log(
    `\nkiss-ssg bench — node ${meta.node}, ${meta.platform}, ${meta.cpus} cpus, ${meta.runs} runs${meta.commit ? `, @${meta.commit}` : ''}`,
  )
  if (baseline?.meta)
    console.log(
      `baseline — node ${baseline.meta.node}, ${baseline.meta.platform}${baseline.meta.commit ? `, @${baseline.meta.commit}` : ''}`,
    )
  for (const [key, result] of Object.entries(results.scenarios)) {
    const built = result.builtPages ? `, ${result.builtPages} pages built` : ''
    const builds = result.builds > 1 ? `, ${result.builds} Kiss instances` : ''
    console.log(`\n${key}${built}${builds}`)
    // Which engine actually ran is part of the result, not a footnote: two runs
    // that resolved different copies of kiss-ssg are not comparable.
    if (result.kiss !== undefined)
      console.log(
        `  engine: ${result.kiss ? `kiss-ssg@${result.kiss.version} — ${result.kiss.path}` : 'kiss-ssg did not resolve from this site'}`,
      )
    if (result.entry) console.log(`  entry:  ${result.entry}`)
    console.log(
      `  ${'phase'.padEnd(28)} ${'median'.padStart(9)} ${'min'.padStart(9)} ${'max'.padStart(9)}${baseline ? `${'Δ'.padStart(11)}` : ''}`,
    )
    for (const [phase, s] of Object.entries(result.phases)) {
      const base = baseline?.scenarios?.[key]?.phases?.[phase]
      console.log(`  ${formatRow(phase, s, base ? compare(s, base) : null)}`)
    }
  }
}

// ---------------------------------------------------------------------------

if (import.meta.filename === process.argv[1]) {
  const argv = process.argv.slice(2)
  const childArg = argv.find((a) => a.startsWith('--child='))
  if (childArg) {
    const scenario = childArg.split('=')[1]
    const dir = argv.find((a) => a.startsWith('--dir=')).split('=')[1]
    const pages = Number(
      argv.find((a) => a.startsWith('--pages=')).split('=')[1],
    )
    const samples = await runChild(
      scenario,
      dir,
      pages,
      argv.includes('--loud'),
    )
    console.log(CHILD_MARKER + JSON.stringify(samples))
    // Explicit: a dev-mode scenario may leave a listening socket that would
    // otherwise hold the child open past its measurement.
    process.exit(0)
  } else {
    await main(argv).catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
  }
}
