// `kiss-ssg speed`: Lighthouse's performance KPIs for a built site, the
// median of several runs, and the change against an earlier measurement.
// Every decision is a pure function here — the arguments, the target, the
// KPIs read off a Lighthouse result, the median and spread, the diff and its
// noise rule, the table — and the orchestration (`measure`) takes Lighthouse
// and chrome-launcher as arguments, so neither is needed to test it.
// Lighthouse is an optional peer dependency, loaded from the site's folder
// (`loadLighthouse`): kiss-ssg never installs it, and a site without it hears
// nothing until it runs this command.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export const SPEED_HELP = `kiss-ssg speed <build-folder | url> [options]

Measures pages with Lighthouse: its performance category, its mobile preset
with simulated throttling, each run in a fresh Chrome. Prints the median of the
runs per page: the performance score (with its min-max spread), LCP, CLS, TBT,
FCP, Speed Index, the total byte weight and the number of requests.

  <build-folder>     a site's build folder (public/ by default), served as the
                     site root on 127.0.0.1. Build the site first: speed never
                     runs the build, so it measures what is on disk
  <url>              an http(s) URL, measured as it is served. The only way the
                     host's delivery (CDN, compression, caching) is measured

Options:

  --page <path>      a page to measure, from the site root; repeat it for more.
                     Default: / (for a URL, the URL's own path)
  --runs <n>         runs per page, 1 to 9. Default: 3
  --out <file>       also write the measurement as JSON, for a later --against
  --against <file>   compare with an earlier --out file: before -> after per
                     page and metric. A change is marked "changed" only when it
                     is larger than the spread of both measurements
  --help             this text

Lighthouse is not a dependency of kiss-ssg. Install it in the site:
  npm install -D lighthouse
It needs Node 22.19 or newer, and a Chrome it can find (or CHROME_PATH).

Exits 0 when every page was measured, 1 when a page failed to load or
Lighthouse failed, and 2 on a usage error or a missing prerequisite.

A lab measurement on this machine: compare runs made here with each other,
never with a site's field data.`

/** Lighthouse 13's own floor (`engines.node`), not kiss-ssg's. */
export const MIN_NODE = '22.19.0'
export const MIN_RUNS = 1
export const MAX_RUNS = 9
export const DEFAULT_RUNS = 3
export const INSTALL_LINE = 'npm install -D lighthouse'

/**
 * One KPI: its key in the JSON, its label in the table, and how to print it.
 * The keys are Lighthouse's own audit ids, so a reader of the JSON can look
 * any of them up; `score` and `requests` are the two Lighthouse has no audit
 * id for in this form.
 *
 * @typedef {Object} Metric
 * @property {string} key
 * @property {string} label
 * @property {'score'|'ms'|'unitless'|'bytes'|'count'} unit
 */

/** @type {Metric[]} */
export const METRICS = [
  { key: 'score', label: 'Score', unit: 'score' },
  { key: 'largest-contentful-paint', label: 'LCP', unit: 'ms' },
  { key: 'cumulative-layout-shift', label: 'CLS', unit: 'unitless' },
  { key: 'total-blocking-time', label: 'TBT', unit: 'ms' },
  { key: 'first-contentful-paint', label: 'FCP', unit: 'ms' },
  { key: 'speed-index', label: 'SI', unit: 'ms' },
  { key: 'total-byte-weight', label: 'Bytes', unit: 'bytes' },
  { key: 'requests', label: 'Requests', unit: 'count' },
]

// The audits whose `numericValue` is the KPI, in METRICS order.
const AUDITS = METRICS.map((m) => m.key).filter(
  (key) => key !== 'score' && key !== 'requests',
)

/**
 * @typedef {Object} SpeedArgs
 * @property {string|null} target the build folder or URL
 * @property {string[]|null} pages the `--page` paths, or `null` for the default
 * @property {number} runs
 * @property {string|null} out
 * @property {string|null} against
 * @property {boolean} help
 * @property {string|null} error a usage error
 */

/**
 * @param {string[]} [argv] everything after `speed`
 * @returns {SpeedArgs}
 */
export function parseSpeedArgs(argv = []) {
  /** @type {SpeedArgs} */
  const parsed = {
    target: null,
    pages: null,
    runs: DEFAULT_RUNS,
    out: null,
    against: null,
    help: false,
    error: null,
  }
  const fail = (message) => ({ ...parsed, error: message })
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--help' || arg === '-h') return { ...parsed, help: true }
    if (
      arg === '--page' ||
      arg === '--runs' ||
      arg === '--out' ||
      arg === '--against'
    ) {
      const value = argv[at + 1]
      if (value === undefined || value.startsWith('--'))
        return fail(`${arg} needs a value`)
      at++
      if (arg === '--page') {
        if (!value.startsWith('/'))
          return fail(
            `--page takes a path from the site root, starting with /: ${value}`,
          )
        parsed.pages = [...(parsed.pages ?? []), value]
      } else if (arg === '--runs') {
        const runs = Number(value)
        if (!Number.isInteger(runs) || runs < MIN_RUNS || runs > MAX_RUNS)
          return fail(
            `--runs takes a whole number from ${MIN_RUNS} to ${MAX_RUNS}: ${value}`,
          )
        parsed.runs = runs
      } else if (arg === '--out') parsed.out = value
      else parsed.against = value
      continue
    }
    if (arg.startsWith('-')) return fail(`unknown option: ${arg}`)
    if (parsed.target !== null)
      return fail(`one target at a time: ${parsed.target} and ${arg}`)
    parsed.target = arg
  }
  if (parsed.target === null)
    return fail('speed needs a build folder or a URL: kiss-ssg speed public')
  return parsed
}

/**
 * What the target names. A URL is measured where it is; a folder is served
 * as the site root. A file — a site's build script — is refused, not run:
 * kiss has no way to learn a script's `folders.build` short of running the
 * script, which is a build, and speed measures what is already on disk.
 *
 * @typedef {{ kind: 'url', base: string, page: string } | { kind: 'folder', folder: string } | { kind: 'error', error: string }} SpeedTarget
 *
 * @param {string} target
 * @param {{ cwd: string, isDirectory: (p: string) => boolean, isFile: (p: string) => boolean }} where
 * @returns {SpeedTarget}
 */
export function resolveTarget(target, { cwd, isDirectory, isFile }) {
  if (/^https?:\/\//i.test(target)) {
    let url
    try {
      url = new URL(target)
    } catch {
      return { kind: 'error', error: `not a URL: ${target}` }
    }
    return {
      kind: 'url',
      base: url.origin,
      page: `${url.pathname}${url.search}`,
    }
  }
  const folder = path.resolve(cwd, target)
  if (isDirectory(folder)) return { kind: 'folder', folder }
  if (isFile(folder))
    return {
      kind: 'error',
      error: `${target} is a file. speed measures a build folder and never runs the build: build the site, then name its folders.build (public/ by default): kiss-ssg speed public`,
    }
  return {
    kind: 'error',
    error: `${target} does not exist: name a build folder (build the site first) or an http(s) URL`,
  }
}

/**
 * Whether `version` (`process.versions.node`) is at least `floor`.
 *
 * @param {string} version
 * @param {string} [floor]
 * @returns {boolean}
 */
export function nodeAtLeast(version, floor = MIN_NODE) {
  const parts = (v) =>
    String(v)
      .replace(/^v/, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0)
  const a = parts(version)
  const b = parts(floor)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

/**
 * The KPIs of one Lighthouse run, read off its result object (the LHR), or
 * why there are none. A page that did not load still returns an LHR, with a
 * `runtimeError` and a `null` score: that is a failed run, never a zero.
 *
 * @param {any} lhr
 * @returns {{ version: string|null, values: Record<string, number> } | { error: string }}
 */
export function kpisFrom(lhr) {
  if (!lhr || typeof lhr !== 'object')
    return { error: 'Lighthouse returned no result' }
  if (lhr.runtimeError?.code)
    return {
      error: `${lhr.runtimeError.code}${lhr.runtimeError.message ? `: ${lhr.runtimeError.message}` : ''}`,
    }
  const score = lhr.categories?.performance?.score
  if (typeof score !== 'number')
    return { error: 'Lighthouse gave no performance score' }
  /** @type {Record<string, number>} */
  const values = { score: Math.round(score * 100) }
  for (const id of AUDITS) {
    const value = lhr.audits?.[id]?.numericValue
    if (typeof value !== 'number') return { error: `Lighthouse gave no ${id}` }
    values[id] = value
  }
  const items = lhr.audits?.['network-requests']?.details?.items
  if (!Array.isArray(items))
    return { error: 'Lighthouse gave no network-requests' }
  values.requests = items.length
  return {
    version:
      typeof lhr.lighthouseVersion === 'string' ? lhr.lighthouseVersion : null,
    values,
  }
}

/**
 * The median: the middle value, or the mean of the two middle values.
 *
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (values.length === 0) throw new Error('median of nothing')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * @typedef {{ min: number, max: number }} Spread
 * @typedef {{ page: string, median: Record<string, number>, spread: Record<string, Spread> }} MeasuredPage
 * @typedef {{ page: string, error: string }} FailedPage
 * @typedef {MeasuredPage | FailedPage} SpeedPage
 * @typedef {{ version: 1, lighthouse: string|null, runs: number, pages: SpeedPage[] }} SpeedRecord
 */

/**
 * The median and the min-max spread of every metric over a page's runs.
 *
 * @param {Record<string, number>[]} runs one `values` per run
 * @returns {{ median: Record<string, number>, spread: Record<string, Spread> }}
 */
export function summarise(runs) {
  /** @type {Record<string, number>} */
  const mid = {}
  /** @type {Record<string, Spread>} */
  const spread = {}
  for (const { key } of METRICS) {
    const values = runs.map((run) => run[key])
    mid[key] = median(values)
    spread[key] = { min: Math.min(...values), max: Math.max(...values) }
  }
  return { median: mid, spread }
}

/**
 * The file `--out` writes and `--against` reads.
 *
 * @param {{ lighthouse: string|null, runs: number, pages: SpeedPage[] }} measured
 * @returns {SpeedRecord}
 */
export function speedRecord({ lighthouse, runs, pages }) {
  return { version: 1, lighthouse, runs, pages }
}

/**
 * Reads an `--out` file back. Throws, naming the problem, on anything else.
 *
 * @param {string} text
 * @returns {SpeedRecord}
 */
export function readSpeedFile(text) {
  const parsed = JSON.parse(text)
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.pages))
    throw new Error('not a kiss-ssg speed --out file (version 1)')
  return parsed
}

/**
 * @param {SpeedRecord} record
 * @returns {0|1}
 */
export function speedExitCode(record) {
  return record.pages.some((p) => 'error' in p) ? 1 : 0
}

/**
 * @param {Metric['unit']} unit
 * @param {number} value
 * @returns {string}
 */
export function formatValue(unit, value) {
  if (unit === 'ms')
    return Math.abs(value) >= 1000
      ? `${(value / 1000).toFixed(1)} s`
      : `${Math.round(value)} ms`
  if (unit === 'unitless') return value.toFixed(3)
  if (unit === 'bytes') return `${(value / 1024).toFixed(1)} KiB`
  return String(Math.round(value))
}

// A change, signed. Zero is printed bare: "+0" reads as a gain.
function formatDelta(unit, delta) {
  const text = formatValue(unit, Math.abs(delta))
  if (/^0(\.0+)?( |$)/.test(text)) return text
  return `${delta > 0 ? '+' : '-'}${text}`
}

const pad = (rows) => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => r[i].length)),
  )
  return rows.map((r) =>
    r
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd(),
  )
}

/**
 * The table on stdout: one row per page, medians, and the score's spread.
 *
 * @param {SpeedRecord} record
 * @returns {string}
 */
export function formatSpeed(record) {
  const header = ['Page', ...METRICS.map((m) => m.label)]
  const rows = []
  const failed = []
  for (const page of record.pages) {
    if ('error' in page) {
      failed.push(`${page.page}  failed: ${page.error}`)
      continue
    }
    rows.push([
      page.page,
      ...METRICS.map((m) => {
        const value = formatValue(m.unit, page.median[m.key])
        if (m.key !== 'score') return value
        const { min, max } = page.spread.score
        return min === max ? value : `${value} (${min}-${max})`
      }),
    ])
  }
  const lines = rows.length ? pad([header, ...rows]) : []
  return [
    ...lines,
    ...failed,
    '',
    `Median of ${record.runs} ${record.runs === 1 ? 'run' : 'runs'} per page, Lighthouse ${record.lighthouse ?? 'unknown'}, mobile, simulated throttling. A lab measurement on this machine.`,
  ].join('\n')
}

/**
 * @typedef {{ key: string, label: string, unit: Metric['unit'], before: number, after: number, delta: number, noise: number, changed: boolean }} MetricChange
 * @typedef {{ page: string, metrics: MetricChange[] } | { page: string, only: 'before'|'after' } | { page: string, error: string }} PageChange
 * @typedef {{ pages: PageChange[], warnings: string[] }} SpeedDiff
 */

/**
 * Before against after, per page and metric. A metric is `changed` only when
 * the change is larger than the spread (max - min) of both measurements: a
 * difference the runs themselves disagree by is noise, never a gain.
 *
 * @param {SpeedRecord} before
 * @param {SpeedRecord} after
 * @returns {SpeedDiff}
 */
export function diffSpeed(before, after) {
  const warnings = []
  if (before.lighthouse !== after.lighthouse)
    warnings.push(
      `Lighthouse ${before.lighthouse ?? 'unknown'} before and ${after.lighthouse ?? 'unknown'} after: its scoring can differ between versions`,
    )
  const was = new Map(before.pages.map((p) => [p.page, p]))
  /** @type {PageChange[]} */
  const pages = []
  for (const now of after.pages) {
    const then = was.get(now.page)
    was.delete(now.page)
    if ('error' in now) pages.push({ page: now.page, error: now.error })
    else if (!then) pages.push({ page: now.page, only: 'after' })
    else if ('error' in then)
      pages.push({ page: now.page, error: `failed before: ${then.error}` })
    else
      pages.push({
        page: now.page,
        metrics: METRICS.map(({ key, label, unit }) => {
          const width = (s) => (s ? s.max - s.min : 0)
          const delta = now.median[key] - then.median[key]
          const noise = Math.max(
            width(then.spread[key]),
            width(now.spread[key]),
          )
          return {
            key,
            label,
            unit,
            before: then.median[key],
            after: now.median[key],
            delta,
            noise,
            changed: Math.abs(delta) > noise,
          }
        }),
      })
  }
  for (const page of was.keys()) pages.push({ page, only: 'before' })
  return { pages, warnings }
}

/**
 * @param {SpeedDiff} diff
 * @returns {string}
 */
export function formatSpeedDiff(diff) {
  const lines = ['Against the earlier measurement:']
  for (const warning of diff.warnings) lines.push(`! ${warning}`)
  for (const page of diff.pages) {
    if ('only' in page) {
      lines.push(
        `${page.page}  ${page.only === 'before' ? 'only in the earlier file' : 'not in the earlier file'}`,
      )
      continue
    }
    if ('error' in page) {
      lines.push(`${page.page}  not compared: ${page.error}`)
      continue
    }
    lines.push(page.page)
    const rows = page.metrics.map((m) => [
      `  ${m.label}`,
      `${formatValue(m.unit, m.before)} -> ${formatValue(m.unit, m.after)}`,
      formatDelta(m.unit, m.delta),
      m.changed ? 'changed' : 'within noise',
    ])
    lines.push(...pad(rows))
  }
  return lines.join('\n')
}

/**
 * Why Chrome did not start, when the reason is a missing prerequisite rather
 * than a failed run: chrome-launcher's own codes for "no Chrome found".
 *
 * @param {any} err
 * @returns {boolean}
 */
export function isChromeMissing(err) {
  return (
    err?.code === 'ERR_LAUNCHER_NOT_INSTALLED' ||
    err?.code === 'ERR_LAUNCHER_PATH_NOT_SET'
  )
}

/**
 * @param {any} err
 * @returns {string}
 */
export function chromeMissingMessage(err) {
  return `no Chrome found (${err?.message ?? err}). Install Chrome, or set CHROME_PATH to a Chrome or Chromium executable`
}

/**
 * Lighthouse and chrome-launcher, from the SITE's folder: kiss-ssg never
 * depends on either. chrome-launcher is resolved from Lighthouse's own
 * location, because it is Lighthouse's dependency and need not be hoisted.
 *
 * @param {string} cwd the site's folder
 * @param {{ nodeVersion?: string }} [options]
 * @returns {Promise<{ lighthouse: Function, chromeLauncher: any } | { error: string }>}
 */
export async function loadLighthouse(
  cwd,
  { nodeVersion = process.versions.node } = {},
) {
  let main
  try {
    main = createRequire(path.join(cwd, 'package.json')).resolve('lighthouse')
  } catch {
    return {
      error: `Lighthouse is not installed in this site. Install it, then run this again:\n  ${INSTALL_LINE}`,
    }
  }
  if (!nodeAtLeast(nodeVersion))
    return {
      error: `Lighthouse 13 needs Node ${MIN_NODE.replace(/\.0$/, '')} or newer, and this is Node ${nodeVersion}`,
    }
  let launcher
  try {
    launcher = createRequire(main).resolve('chrome-launcher')
  } catch {
    return {
      error: `Lighthouse is installed but its chrome-launcher is not: reinstall it with ${INSTALL_LINE}`,
    }
  }
  try {
    const lighthouse = await import(pathToFileURL(main).href)
    const chromeLauncher = await import(pathToFileURL(launcher).href)
    return { lighthouse: lighthouse.default ?? lighthouse, chromeLauncher }
  } catch (err) {
    return { error: `could not load Lighthouse (${err.message})` }
  }
}

const require = createRequire(import.meta.url)

/**
 * Serves `root` as the site root on 127.0.0.1, on a port the OS chooses, with
 * the dev server's static rules and no live reload.
 *
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveFolder(root) {
  const connect = require('connect')
  const serveStatic = require('serve-static')
  const app = connect()
  app.use(
    serveStatic(root, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    }),
  )
  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('the server did not bind a TCP port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve(undefined))
      }),
  }
}

/**
 * Runs Lighthouse `runs` times per page, each in a fresh Chrome, and
 * summarises each page. Lighthouse and chrome-launcher are passed in. A page
 * stops at its first failed run, and is reported failed rather than given a
 * median of fewer runs. No Chrome at all ends the whole measurement as a
 * missing prerequisite (`fatal`).
 *
 * @param {{ base: string, pages: string[], runs: number, lighthouse: Function, chromeLauncher: any, progress?: (line: string) => void }} options
 * @returns {Promise<{ lighthouse: string|null, pages: SpeedPage[], fatal: string|null }>}
 */
export async function measure({
  base,
  pages,
  runs,
  lighthouse,
  chromeLauncher,
  progress = () => {},
}) {
  let version = null
  /** @type {SpeedPage[]} */
  const out = []
  for (const page of pages) {
    const url = new URL(page, base).href
    const values = []
    let error = null
    for (let run = 1; run <= runs && !error; run++) {
      progress(`kiss-ssg speed: ${page} run ${run} of ${runs}`)
      let chrome
      try {
        chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
      } catch (err) {
        if (isChromeMissing(err))
          return {
            lighthouse: version,
            pages: out,
            fatal: chromeMissingMessage(err),
          }
        error = `Chrome did not start (${err?.message ?? err})`
        break
      }
      try {
        const result = await lighthouse(url, {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance'],
        })
        const kpis = kpisFrom(result?.lhr)
        if ('error' in kpis) error = kpis.error
        else {
          version ??= kpis.version
          values.push(kpis.values)
        }
      } catch (err) {
        error = `Lighthouse failed (${err?.message ?? err})`
      } finally {
        try {
          await chrome.kill()
        } catch {
          /* a Chrome that will not die leaves a temp profile, not a result */
        }
      }
    }
    out.push(error ? { page, error } : { page, ...summarise(values) })
  }
  return { lighthouse: version, pages: out, fatal: null }
}

/**
 * The whole command, for the bin: `{ code, out, err }` to print and exit with.
 * `load` and `serve` are injectable so a test can run it without Lighthouse.
 *
 * @param {string[]} argv everything after `speed`
 * @param {{ cwd?: string, progress?: (line: string) => void, load?: typeof loadLighthouse, serve?: typeof serveFolder }} [options]
 * @returns {Promise<{ code: 0|1|2, out: string, err: string }>}
 */
export async function runSpeed(
  argv,
  {
    cwd = process.cwd(),
    progress = () => {},
    load = loadLighthouse,
    serve = serveFolder,
  } = {},
) {
  /** @param {string} message @returns {{ code: 2, out: string, err: string }} */
  const usage = (message) => ({
    code: 2,
    out: '',
    err: `kiss-ssg speed: ${message}\n\n${SPEED_HELP}`,
  })
  /** @param {string} message @returns {{ code: 2, out: string, err: string }} */
  const missing = (message) => ({
    code: 2,
    out: '',
    err: `kiss-ssg speed: ${message}`,
  })
  const args = parseSpeedArgs(argv)
  if (args.help) return { code: 0, out: SPEED_HELP, err: '' }
  if (args.error || args.target === null)
    return usage(args.error ?? 'no target')
  const target = resolveTarget(args.target, {
    cwd,
    isDirectory: (p) => fs.existsSync(p) && fs.statSync(p).isDirectory(),
    isFile: (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
  })
  if (target.kind === 'error') return usage(target.error)
  // Read before measuring: a mistyped file costs nothing yet.
  let against = null
  if (args.against) {
    try {
      against = readSpeedFile(
        fs.readFileSync(path.resolve(cwd, args.against), 'utf8'),
      )
    } catch (err) {
      return usage(
        `cannot read --against file ${args.against} (${err.message})`,
      )
    }
  }
  const loaded = await load(cwd)
  if ('error' in loaded) return missing(loaded.error)

  const server = target.kind === 'folder' ? await serve(target.folder) : null
  let measured
  try {
    measured = await measure({
      base: server ? server.url : target.kind === 'url' ? target.base : '',
      pages: args.pages ?? [target.kind === 'url' ? target.page : '/'],
      runs: args.runs,
      lighthouse: loaded.lighthouse,
      chromeLauncher: loaded.chromeLauncher,
      progress,
    })
  } finally {
    await server?.close()
  }
  if (measured.fatal) return missing(measured.fatal)

  const record = speedRecord({
    lighthouse: measured.lighthouse,
    runs: args.runs,
    pages: measured.pages,
  })
  let code = speedExitCode(record)
  const errors = []
  if (args.out) {
    const file = path.resolve(cwd, args.out)
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    } catch (err) {
      errors.push(
        `kiss-ssg speed: could not write ${args.out} (${err.message})`,
      )
      code = 1
    }
  }
  const out = [formatSpeed(record)]
  if (against) out.push('', formatSpeedDiff(diffSpeed(against, record)))
  return { code, out: out.join('\n'), err: errors.join('\n') }
}
