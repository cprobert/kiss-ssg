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
//   node scripts/bench.mjs --site=../a-site         # time a real site's build
//   node scripts/bench.mjs --site=../a-site --dev="generate dev"
//                                                   # …and time three saves under watch
//     --livereload-port=<n> / --dev-port=<n>  where that dev process will listen
//     --partial=<p> --model=<p> --page=<p>    the files to touch, if not the first
//                                             candidate under src/{partials,models,pages}
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

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
  // `--dev` names the site's dev-mode entry ("<script> [args…]") and turns on
  // the watch reading for every `--site` given; the ports say where that
  // process will listen, and the three file options override what gets touched.
  dev: null,
  // Repeated from `lib/config.js` rather than imported: a static import of any
  // `lib/` module leaves it in this file's module cache, and this file re-enters
  // itself as the child that times `import('../lib/kiss.js')` cold.
  livereloadPort: 35729,
  devPort: 3001,
  partial: null,
  model: null,
  page: null,
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
    // Kebab on the command line, camel in the options object — `--dev-port`
    // reads better than `--devPort` and nothing else here is two words.
    const key = rawKey.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (!(key in defaults))
      throw new Error(`unknown option: --${rawKey.trim()}`)
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
  // A watch reading is a reading of a real site running its own dev process;
  // accepting the flag without one would report nothing and look like a run.
  if (opts.dev && opts.site.length === 0)
    throw new Error('--dev needs a --site to run that dev entry in')
  for (const [key, flag] of [
    ['livereloadPort', '--livereload-port'],
    ['devPort', '--dev-port'],
  ])
    if (!Number.isFinite(opts[key]) || opts[key] < 1)
      throw new Error(`${flag} must be a positive port number`)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
// An entry is a script and whatever argv it wants, separated by whitespace.
export function splitEntry(entry) {
  return String(entry).trim().split(/\s+/).filter(Boolean)
}

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
  // "<script> [args…]", like `--dev`: a site that picks its instance from argv
  // (`generate staging`) has no bare script that builds and exits.
  const [script, ...args] = splitEntry(entry)
  if (!fs.existsSync(path.join(dir, script)))
    throw new Error(`entry script not found: ${path.join(dir, script)}`)

  const resolved = resolveKissFrom(dir)
  const reportFile = path.join(BENCH_DIR, `report-${process.pid}.jsonl`)
  const samples = []
  const run = () => {
    fs.rmSync(reportFile, { force: true })
    const started = now()
    const r = spawnSync(process.execPath, [script, ...args], {
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
// Real sites, under watch
// ---------------------------------------------------------------------------

// The cold reading above says what a site costs once. `--dev` asks the other
// question — what one save costs — because that is the number the watch-scoping
// spec stops or continues on (`planning/specs/2026-09-05-watch-dependency-graph-
// design.md`, rollout step 5). Three edits, three engine routes:
//
//   page     a page view — the single-page re-render, the floor
//   partial  a partial — re-register, then re-render every stack entry: render
//            cost alone
//   model    a model — a full replay: registration *and* render
//
// So median(partial)/median(model) is the registration-vs-render split. If it
// is close to 1, render dominates and a dependency graph could still pay; if it
// is small, registration dominates and the no-graph optimisation already took
// the win.
//
// "Settled" is observed the way a browser observes it. The engine's livereload
// server broadcasts once per settled rebuild (`Kiss._reload`), and a scoped
// re-render writes no build report, so the socket is the only public signal
// that covers all three routes. Polling output files instead would need to know
// which of a real site's thousands of pages the edit reached.

// Cheapest first, so a run that dies part-way still has the simpler numbers.
const TOUCH_ORDER = ['page', 'partial', 'model']

// Conventional layout, deliberately: reading the site's real folder config
// would mean running its script, which is what the child is for. `--partial`,
// `--model` and `--page` are the escape hatch for a site shaped differently.
const TOUCH_KINDS = {
  partial: { dir: 'src/partials', ext: '.hbs' },
  model: { dir: 'src/models', ext: '.json' },
  page: { dir: 'src/pages', ext: '.hbs' },
}

// Sorted, so two runs of the bench touch the same file: no filesystem promises
// an order for a directory listing, and a reading of two different partials is
// not a before/after.
function firstFile(dir, ext) {
  if (!fs.existsSync(dir)) return null
  const found = []
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), {
      withFileTypes: true,
    })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(next)
      else if (entry.name.toLowerCase().endsWith(ext)) found.push(next)
    }
  }
  walk('')
  return found.sort()[0] ?? null
}

export function pickTouchTargets(siteDir, overrides = {}) {
  const out = {}
  for (const [kind, { dir, ext }] of Object.entries(TOUCH_KINDS)) {
    if (overrides[kind]) {
      out[kind] = path.resolve(siteDir, overrides[kind])
      continue
    }
    const found = firstFile(path.join(siteDir, dir), ext)
    out[kind] = found ? path.join(siteDir, dir, found) : null
  }
  return out
}

// The livereload protocol puts several commands on one socket, and the `hello`
// reply lands there too — counting that as a settled rebuild would time the
// handshake instead of the build.
export function isReloadMessage(raw) {
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    return parsed?.command === 'reload'
  } catch {
    return false
  }
}

// `livereload`'s `Server.listen` builds a bare `ws.Server({ port, host })` with
// no HTTP server and no `path` option, so any request path connects, and
// `refresh()` → `sendAllClients` broadcasts to every socket in `server.clients`
// — the `hello` handshake is answered but never gates a broadcast. It is sent
// anyway, so the bench is the client the protocol describes rather than one
// that only happens to work.
async function connectLivereload(port, isDead) {
  // Generous, because this is a cold `node` start of somebody else's site: the
  // socket has to be open before the first build settles or its reload is
  // broadcast to nobody, so the retry is tight and the patience is long.
  const deadline = Date.now() + 60000
  for (;;) {
    try {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/livereload`)
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', () => resolve(null), { once: true })
        socket.addEventListener('error', () => reject(new Error('refused')), {
          once: true,
        })
      })
      socket.send(
        JSON.stringify({
          command: 'hello',
          protocols: ['http://livereload.com/protocols/official-7'],
        }),
      )
      return socket
    } catch {
      if (isDead() || Date.now() > deadline)
        throw new Error(
          `no live reload server answered on 127.0.0.1:${port} — the site never started one, or it listens elsewhere (--livereload-port=<n>)`,
        )
      await sleep(25)
    }
  }
}

// A dev server that cannot bind logs the failure and keeps building, so without
// this the bench would sit waiting for reloads from somebody else's livereload
// server — or worse, get them.
async function assertPortsFree(ports) {
  const net = await import('node:net')
  for (const [port, flag] of ports) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer()
      probe.once('error', () => resolve(false))
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
    })
    if (!free)
      throw new Error(
        `port ${port} is already in use — free it, or point the bench at the port this site uses (${flag}=<n>)`,
      )
  }
}

export async function benchSiteWatch(siteDir, opts) {
  const dir = path.resolve(siteDir)
  if (!fs.existsSync(dir)) throw new Error(`no such site directory: ${dir}`)
  const [entry, ...args] = splitEntry(opts.dev)
  if (!entry) throw new Error('--dev needs a dev-mode entry script')
  if (!fs.existsSync(path.join(dir, entry)))
    throw new Error(`dev entry script not found: ${path.join(dir, entry)}`)

  const targets = pickTouchTargets(dir, opts)
  for (const kind of TOUCH_ORDER)
    if (targets[kind] && !fs.existsSync(targets[kind]))
      throw new Error(`no such ${kind} to touch: ${targets[kind]}`)
  if (TOUCH_ORDER.every((kind) => !targets[kind]))
    throw new Error(
      `found nothing to touch under ${dir} — name the files with --page, --partial and --model`,
    )
  await assertPortsFree([
    [opts.livereloadPort, '--livereload-port'],
    [opts.devPort, '--dev-port'],
  ])

  const resolved = resolveKissFrom(dir)
  fs.mkdirSync(BENCH_DIR, { recursive: true })
  const reportFile = path.join(BENCH_DIR, `watch-${process.pid}.jsonl`)
  fs.rmSync(reportFile, { force: true })
  // Read before anything is touched, written back in `finally`: the bench edits
  // the site it is measuring, and one byte left behind makes the next reading a
  // reading of a different site.
  const originals = new Map(
    TOUCH_ORDER.filter((kind) => targets[kind]).map((kind) => [
      targets[kind],
      fs.readFileSync(targets[kind]),
    ]),
  )

  const lines = []
  const keep = (chunk) => {
    lines.push(...String(chunk).split('\n'))
    if (lines.length > 30) lines.splice(0, lines.length - 30)
  }
  const tail = () => lines.join('\n').trim()

  let exited = false
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: dir,
    env: { ...process.env, KISS_REPORT: reportFile, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  child.on('exit', () => (exited = true))
  // An 'error' with no listener throws on an EventEmitter, and a failed spawn
  // emits no 'exit' at all — so it has to end the wait itself.
  child.on('error', (err) => {
    keep(err.message)
    exited = true
  })

  let socket = null
  let reloads = 0
  const samples = []
  try {
    // Connected before anything is edited. The initial build's own reload is
    // *not* waited for: the livereload server binds inside the same
    // `generate()` call that settles the build, so it is broadcast to nobody
    // and a client waiting for it waits forever (verified against a real dev
    // process). An edit of the bench's own is the only reload it can be sure of
    // catching, which is what `warm` below is for.
    socket = await connectLivereload(opts.livereloadPort, () => exited)
    socket.addEventListener('message', (event) => {
      if (isReloadMessage(event.data)) reloads++
    })

    // Armed before the touch, never after: a small site can settle a rebuild
    // faster than the next line of this function runs.
    const settle = () =>
      new Promise((resolve, reject) => {
        let timer = null
        const done = (fn, value) => {
          clearTimeout(timer)
          socket.removeEventListener('message', onMessage)
          socket.removeEventListener('close', onClose)
          child.removeListener('exit', onClose)
          fn(value)
        }
        const onMessage = (event) =>
          isReloadMessage(event.data) && done(resolve, now())
        const onClose = () =>
          done(
            reject,
            new Error(`the dev process went away mid-reading:\n${tail()}`),
          )
        timer = setTimeout(
          () =>
            done(
              reject,
              new Error(`timed out waiting for a live reload:\n${tail()}`),
            ),
          600000,
        )
        socket.addEventListener('message', onMessage)
        socket.addEventListener('close', onClose)
        // The socket does not always learn that its server died — a process
        // that crashes sends no close frame — but the child's exit is certain,
        // and a settle that waits ten minutes to find out is a hang.
        if (exited) onClose()
        else child.once('exit', onClose)
      })

    // The discarded touch, and the only one that is retried. Three things can
    // swallow it: chokidar may still be doing its initial scan, the site may
    // still be inside its cold build, and this is the first event for the path,
    // which pays for watcher registration no later edit repeats. Ten minutes,
    // not the fixture scenarios' thirty seconds — a consumer-scale cold build
    // may be fetching URL models.
    const warm = async (file) => {
      const deadline = Date.now() + 600000
      for (;;) {
        const before = reloads
        fs.appendFileSync(file, '\n')
        await until(() => reloads > before || exited, 5000, 25).catch(() => {})
        if (reloads > before) break
        if (exited)
          throw new Error(
            `dev entry \`${entry}\` exited before it rebuilt anything:\n${tail()}`,
          )
        if (Date.now() > deadline)
          throw new Error(
            `no live reload after editing ${file} in ten minutes — is the site watching that folder?`,
          )
      }
      // Quiet, not merely "one reload": the initial build's broadcast and a
      // retried touch's can both still be in flight, and an unclaimed reload
      // would resolve the next measured edit before it had rebuilt anything.
      for (let last = -1; last !== reloads;) {
        last = reloads
        await sleep(300)
      }
    }

    for (const kind of TOUCH_ORDER) {
      const file = targets[kind]
      if (!file) continue
      await warm(file)
      for (let i = 0; i < opts.runs; i++) {
        const settled = settle()
        const tTouch = now()
        // Appended, never rewritten and never replaced: `add` and `unlink` both
        // route to a full replay, so a create-or-delete would measure the same
        // thing three times. The file grows a byte a touch and is restored below.
        fs.appendFileSync(file, '\n')
        samples.push({ [kind]: (await settled) - tTouch })
        // Two edits inside chokidar's debounce window coalesce into one event,
        // and would then be timed as one rebuild.
        await sleep(100)
      }
    }

    // Taken from the report at the end, and from its last line only. A dev
    // script that never calls `complete()` (the common shape —
    // `examples/1-scan.js`) writes nothing until a replay, and by now the model
    // edits have replayed the whole site several times; summing the file would
    // count the site once per replay.
    const reported = (
      fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : ''
    )
      .split('\n')
      .filter(Boolean)
    const settled = summariseReports(reported.slice(-1))

    const phases = summarise(samples)
    return {
      site: path.basename(dir),
      entry,
      kiss: resolved,
      builtPages: settled?.pages ?? null,
      builds: settled?.builds ?? null,
      ok: settled?.ok !== false,
      touched: Object.fromEntries(
        TOUCH_ORDER.map((kind) => [
          kind,
          targets[kind]
            ? path.relative(dir, targets[kind]).replace(/\\/g, '/')
            : null,
        ]),
      ),
      // Reported beside the table rather than in it: it is a ratio of two rows,
      // not a fourth measurement.
      ratio:
        phases.partial && phases.model
          ? phases.partial.median / phases.model.median
          : null,
      phases,
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    for (const [file, body] of originals) fs.writeFileSync(file, body)
    socket?.close()
    fs.rmSync(reportFile, { force: true })
    // Awaited, not fired and forgotten: until the dev process is gone it still
    // holds its two ports, and the next reading cannot bind them.
    if (!exited)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve(null)
        })
      })
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
  // The watch reading's three edits, cheapest route first.
  'page',
  'partial',
  'model',
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
    // Its own scenario rather than extra rows on the cold one: the two readings
    // come from different processes and answer different questions.
    if (opts.dev) {
      process.stderr.write(`  running ${key}:watch …`)
      results.scenarios[`${key}:watch`] = await benchSiteWatch(site, opts)
      process.stderr.write(' done\n')
    }
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
    // Which files were edited is part of a watch reading: a partial nothing
    // includes and a partial every page includes are different measurements.
    if (result.touched)
      console.log(
        `  touched: ${Object.entries(result.touched)
          .map(([kind, file]) => `${kind}=${file ?? '—'}`)
          .join(' ')}`,
      )
    console.log(
      `  ${'phase'.padEnd(28)} ${'median'.padStart(9)} ${'min'.padStart(9)} ${'max'.padStart(9)}${baseline ? `${'Δ'.padStart(11)}` : ''}`,
    )
    for (const [phase, s] of Object.entries(result.phases)) {
      const base = baseline?.scenarios?.[key]?.phases?.[phase]
      console.log(`  ${formatRow(phase, s, base ? compare(s, base) : null)}`)
    }
    if (result.ratio != null)
      console.log(
        `  partial/model: ${result.ratio.toFixed(2)} — the render half is ${(result.ratio * 100).toFixed(0)}% of a replay`,
      )
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
