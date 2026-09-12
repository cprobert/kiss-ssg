#!/usr/bin/env node
// `kiss-ssg check <script>` and `kiss-ssg aikb <script>`: run the site's own
// build script as a dry run and print what it built, or run the same dry run
// and let it record the site's knowledge base. Thin on purpose — every decision
// it makes lives in `lib/check.js` (argv, the reports file, the baseline, the
// exit code) and in `lib/build-report.js` (the report itself); this file is the
// I/O around them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  HELP,
  defaultBaseline,
  diffReports,
  exitCodeFor,
  formatDiff,
  parseArgs,
  readReports,
  readReportsFile,
  recordedLine,
} from '../lib/check.js'
import { formatReport } from '../lib/build-report.js'

const parsed = parseArgs(process.argv.slice(2))
if (parsed.error) {
  console.error(`kiss-ssg: ${parsed.error}\n`)
  console.error(HELP)
  process.exit(1)
}
if (parsed.command === 'help') {
  console.log(HELP)
  process.exit(0)
}

// Read before the build, not after it: a run that takes a minute and then dies
// on a mistyped filename has wasted the minute, and the mistyped filename was
// knowable at the first instruction. It is a usage error, so it prints like one.
let against = null
if (parsed.against) {
  try {
    against = readReportsFile(fs.readFileSync(parsed.against, 'utf8'))
  } catch (err) {
    console.error(
      `kiss-ssg: cannot read --against file ${parsed.against} (${err.message})\n`,
    )
    console.error(HELP)
    process.exit(1)
  }
}

const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-check-'))
const reportFile = path.join(reportDir, 'reports.jsonl')
try {
  const run = spawnSync(process.execPath, [parsed.script, ...parsed.args], {
    // The caller's cwd, not the script's folder: a site resolves `folders`
    // against the cwd it is normally run from, and moving it would check a
    // different set of paths from the ones the site builds with.
    cwd: process.cwd(),
    env: {
      ...process.env,
      KISS_CHECK: '1',
      KISS_REPORT: reportFile,
      // The one difference between the two commands: `aikb` is the ceremony
      // that lets the build write its knowledge base. A check never sets it,
      // so no ordinary run of it can move the baseline the diff reads.
      ...(parsed.command === 'aikb' ? { KISS_AIKB: '1' } : {}),
    },
    // The site's own build log goes to *our* stderr (fd 2 at the child's
    // stdout too), so stdout carries nothing but the report and stays
    // machine-readable while a person still sees the build.
    stdio: [0, 2, 2],
  })
  if (run.error) console.error(`kiss-ssg: ${run.error.message}`)

  const text = fs.existsSync(reportFile)
    ? fs.readFileSync(reportFile, 'utf8')
    : ''
  let reports = []
  try {
    reports = readReports(text)
  } catch (err) {
    console.error(`kiss-ssg: could not read the build report (${err.message})`)
  }

  // Without `--against`, `check` falls back to the knowledge base's own
  // snapshot — the state of the site when the last piece of work was closed,
  // which is the question "what have I changed" actually means. Read after the
  // run, which under a check has not touched the file. `aikb` has just
  // overwritten it, so it diffs only when a file was named explicitly.
  if (!against && parsed.command === 'check') {
    const baseline = defaultBaseline(reports)
    // A site that has never recorded has no baseline and no diff: the ordinary
    // case, not a finding, so nothing is said about it.
    if (baseline && fs.existsSync(baseline)) {
      try {
        against = readReportsFile(fs.readFileSync(baseline, 'utf8'))
      } catch (err) {
        console.error(`kiss-ssg: could not read ${baseline} (${err.message})`)
      }
    }
  }

  // One diff entry per report, in the same order, so the summary can print
  // each under its own site's line by index.
  const diff = against ? diffReports(against, reports) : null

  if (reports.length === 0)
    console.error(
      'kiss-ssg: no build report was written — the script never settled a build. Add `await kiss.complete()` to it.',
    )
  else if (parsed.summary)
    reports.forEach((report, at) => {
      console.log(formatReport(report))
      if (parsed.command === 'aikb') console.log(recordedLine(report))
      if (diff) console.log(formatDiff(diff[at]))
    })
  // The bare array stays the shape stdout has without --against: a consumer
  // that never asked for a diff never has to learn the wrapper.
  else console.log(JSON.stringify(diff ? { reports, diff } : reports, null, 2))

  process.exitCode = exitCodeFor(reports, run.status)
} finally {
  fs.rmSync(reportDir, { recursive: true, force: true })
}
