#!/usr/bin/env node
// `kiss-ssg check <script>`: run the site's own build script as a dry run and
// print what it built. Thin on purpose — every decision it makes lives in
// `lib/check.js` (argv, the reports file, the exit code) and in
// `lib/build-report.js` (the report itself); this file is the I/O around them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { HELP, exitCodeFor, parseArgs, readReports } from '../lib/check.js'
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

const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-check-'))
const reportFile = path.join(reportDir, 'reports.jsonl')
try {
  const run = spawnSync(process.execPath, [parsed.script, ...parsed.args], {
    // The caller's cwd, not the script's folder: a site resolves `folders`
    // against the cwd it is normally run from, and moving it would check a
    // different set of paths from the ones the site builds with.
    cwd: process.cwd(),
    env: { ...process.env, KISS_CHECK: '1', KISS_REPORT: reportFile },
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

  if (reports.length === 0)
    console.error(
      'kiss-ssg: no build report was written — the script never settled a build. Add `await kiss.complete()` to it.',
    )
  else if (parsed.summary)
    for (const report of reports) console.log(formatReport(report))
  else console.log(JSON.stringify(reports, null, 2))

  process.exitCode = exitCodeFor(reports, run.status)
} finally {
  fs.rmSync(reportDir, { recursive: true, force: true })
}
