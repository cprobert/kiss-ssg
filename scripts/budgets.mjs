#!/usr/bin/env node
// The roadmap's budgets as numbers, and which way each has moved since the
// recorded baseline (planning/budgets.json). It reports; it does not fail the
// gates. `--check` exits 1 when any number is worse, for Phase 1 to wire in.
//
//   node scripts/budgets.mjs                  # table: key, baseline, now, verdict
//   node scripts/budgets.mjs --record         # write planning/budgets.json
//   node scripts/budgets.mjs --check          # table, then exit 1 if any is worse
//   node scripts/budgets.mjs --bench <file>   # read msPerPage from a bench JSON
//                                             # (MS_PER_PAGE below says which entry)
//
// Every number is a pure function over file contents; `measure` is the only
// part that reads the disk. A lower number is better for all nine.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './is-main.mjs'

export const KEYS = [
  'coreLines',
  'privateReach',
  'anyAnnotations',
  'runtimeDeps',
  'testPrivateReach',
  'claudeMdBytes',
  'llmsTxtChars',
  'msPerPage',
  'failureBoilerplate',
]

const lineCount = (text) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

/** Total lines of the given file texts. */
export const coreLines = (texts) =>
  texts.reduce((sum, text) => sum + lineCount(text), 0)

/** Distinct `kiss._name` strings across `{name, text}` files except lib/kiss.js. */
export function privateReach(files) {
  const seen = new Set()
  for (const { name, text } of files) {
    if (path.basename(name) === 'kiss.js') continue
    for (const match of text.matchAll(/kiss\._[A-Za-z]+/g)) seen.add(match[0])
  }
  return seen.size
}

const countMatches = (texts, pattern) =>
  texts.reduce((sum, text) => sum + (text.match(pattern) ?? []).length, 0)

/** Occurrences of the `{any}` annotation. */
export const anyAnnotations = (texts) => countMatches(texts, /\{any\}/g)

/** Keys of package.json `dependencies`. */
export const runtimeDeps = (packageJsonText) =>
  Object.keys(JSON.parse(packageJsonText).dependencies ?? {}).length

/** Occurrences of a private member after kiss, site, k, instance or app. */
export const testPrivateReach = (texts) =>
  countMatches(texts, /\b(?:kiss|site|k|instance|app)\._[A-Za-z]/g)

/** Size in bytes of the given file contents (a Buffer). */
export const claudeMdBytes = (buffer) => buffer.length

/** Length in UTF-16 characters of the given text. */
export const llmsTxtChars = (text) => text.length

/** Number of texts that contain the function, not occurrences. */
export const failureBoilerplate = (texts) =>
  texts.filter((text) => text.includes('function reportBuildFailure')).length

// The roadmap's build-time budget: the scan scenario's build phase at 4,000
// pages, read from `node scripts/bench.mjs --pages=4000 --scenario=scan
// --json=<file>` (the operator's definition, 2026-11-10).
export const MS_PER_PAGE = { scenario: 'scan@4000', phase: 'build' }

/**
 * Median of `phase` in `scenario` divided by that scenario's page count, to
 * one decimal; null when any of the three is missing.
 */
export function msPerPage(bench, scenario, phase) {
  const entry = bench?.scenarios?.[scenario]
  const median = entry?.phases?.[phase]?.median
  if (!entry?.pages || typeof median !== 'number') return null
  return Math.round((median / entry.pages) * 10) / 10
}

/** One row per key: baseline, now and better / same / worse / absent. */
export function compareBudgets(baseline, now) {
  return KEYS.map((key) => {
    const was = baseline?.[key] ?? null
    const is = now?.[key] ?? null
    let verdict = 'absent'
    if (was !== null && is !== null)
      verdict = is < was ? 'better' : is > was ? 'worse' : 'same'
    return { key, baseline: was, now: is, verdict }
  })
}

const SKIP_DIRS = new Set(['node_modules', 'public', '.converted', '.git'])

function walk(dir, ext = null) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(full, ext))
    } else if (!ext || ext.includes(path.extname(entry.name))) out.push(full)
  }
  return out
}

const read = (file) => fs.readFileSync(file, 'utf8')

/**
 * Measure every number against the repository at `root`.
 * @param {string} root
 * @param {{ bench?: any, scenario?: string, phase?: string }} [from]
 */
export function measure(root, { bench = null, scenario, phase } = {}) {
  const lib = fs
    .readdirSync(path.join(root, 'lib'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: `lib/${f}`, text: read(path.join(root, 'lib', f)) }))
  const libTexts = lib.map((f) => f.text)
  const tests = walk(path.join(root, 'test'), ['.js']).map(read)
  const boilerplate = [
    ...walk(path.join(root, 'examples')),
    ...walk(path.join(root, 'starter')),
    ...fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(root, e.name)),
  ].map(read)
  return {
    coreLines: coreLines(libTexts),
    privateReach: privateReach(lib),
    anyAnnotations: anyAnnotations(libTexts),
    runtimeDeps: runtimeDeps(read(path.join(root, 'package.json'))),
    testPrivateReach: testPrivateReach(tests),
    claudeMdBytes: claudeMdBytes(fs.readFileSync(path.join(root, 'CLAUDE.md'))),
    llmsTxtChars: llmsTxtChars(read(path.join(root, 'llms.txt'))),
    msPerPage: bench ? msPerPage(bench, scenario, phase) : null,
    failureBoilerplate: failureBoilerplate(boilerplate),
  }
}

function formatTable(rows) {
  const cell = (v) => (v === null ? '-' : String(v))
  const lines = [
    ['key', 'baseline', 'now', 'verdict'],
    ...rows.map((r) => [r.key, cell(r.baseline), cell(r.now), r.verdict]),
  ]
  const width = [0, 1, 2, 3].map((i) =>
    Math.max(...lines.map((l) => l[i].length)),
  )
  return lines
    .map((l) =>
      l
        .map((c, i) => c.padEnd(width[i]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

function parseArgs(argv) {
  const opts = { record: false, check: false }
  const valueFlags = { '--bench': 'bench' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--record') opts.record = true
    else if (arg === '--check') opts.check = true
    else if (valueFlags[arg]) opts[valueFlags[arg]] = argv[++i]
    else throw new Error(`unknown argument ${arg}`)
  }
  return opts
}

function main(argv) {
  const root =
    process.env.KISS_BUDGETS_ROOT ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    console.error(err.message)
    return 2
  }
  const bench = opts.bench ? JSON.parse(read(opts.bench)) : null
  const now = measure(root, { bench, ...MS_PER_PAGE })
  const file = path.join(root, 'planning', 'budgets.json')
  if (opts.record) {
    // A number this run did not measure (msPerPage without --bench) keeps its
    // recorded value, or --check could never call that row worse again.
    const previous = fs.existsSync(file) ? JSON.parse(read(file)) : {}
    const recorded = Object.fromEntries(
      Object.entries(now).map(([key, value]) => [
        key,
        value ?? previous[key] ?? null,
      ]),
    )
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(recorded, null, 2)}\n`)
    console.log(`recorded -> ${path.relative(root, file)}`)
  }
  const baseline = fs.existsSync(file) ? JSON.parse(read(file)) : null
  if (!baseline) console.log('no baseline recorded; run with --record')
  const rows = compareBudgets(baseline, now)
  console.log(formatTable(rows))
  if (opts.bench && now.msPerPage === null)
    console.log(
      `msPerPage: no ${MS_PER_PAGE.scenario} / ${MS_PER_PAGE.phase} in ${opts.bench}`,
    )
  return opts.check && rows.some((r) => r.verdict === 'worse') ? 1 : 0
}

if (isMain(import.meta.filename)) process.exitCode = main(process.argv.slice(2))
