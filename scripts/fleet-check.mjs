#!/usr/bin/env node
// The fleet check: does a real site build the same on this branch as on the
// base? This repository's examples and docs site resolve kiss from the working
// tree, so they cannot show what a site installing kiss from npm gets. This
// can: it installs a packed tarball of each ref into a copy of the site.
//
//   node scripts/fleet-check.mjs <site folder> --base <ref> [--branch <ref>]
//                                [--out <folder>] [--entry "<script> [args]"]
//
// What it does, in order:
//   1. Copies the site into <out>/site: `git clone --local` when the site is a
//      git repository (its committed state), otherwise a copy without
//      node_modules and .git. The site's own folder is never written to.
//   2. Packs each ref from THIS repository without touching its working tree:
//      `git archive <ref>` into <out>/<label>/src, then `npm pack` there. A ref
//      is its committed content, so uncommitted work is not what is checked.
//   3. For base, then branch, back to back in the same copy: removes
//      node_modules/kiss-ssg, installs the tarball (`npm install --no-save`),
//      runs `kiss-ssg check <entry>` from the installed package and keeps the
//      reports it prints, then runs the plain build and keeps a copy of each
//      build folder the reports name. Two builds taken together: a report kept
//      from earlier is not a baseline (the same tarball gave different page
//      hashes hours apart on 2026-11-06).
//   4. Compares the reports (`diffReports` from lib/check.js, plus the page
//      hashes one by one and each report's summary counts) and the build
//      folders byte for byte, then again with each engine's version string
//      replaced by `<version>`.
//
// Exit 0 when nothing differs, 1 when something does, 2 when the check could
// not run (a usage error, a failed clone, pack or install, no report). The
// decisions live in the exported functions, tested in
// test/unit/fleet-check.test.js; the git, npm and node calls are thin.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { isMain } from './is-main.mjs'
import { resolveSiteEntry, splitEntry } from './bench.mjs'
import { diffReports, formatDiff, readReportsFile } from '../lib/check.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const USAGE = `Usage: node scripts/fleet-check.mjs <site folder> --base <ref> [--branch <ref>] [--out <folder>] [--entry "<script> [args]"]

  <site folder>  a kiss site; it is copied, never written to
  --base <ref>   the ref of this repository to compare against (e.g. main)
  --branch <ref> the ref under test (default HEAD; committed content only)
  --out <folder> where the copy, tarballs and build folders go (default: a new
                 folder in the OS temp); must be empty or not exist
  --entry <s>    the site's build script, when package.json's build script is
                 not a bare \`node <script>\`

Exit 0: identical. Exit 1: something differs. Exit 2: the check could not run.`

/**
 * @typedef {Object} FleetArgs
 * @property {string|null} site
 * @property {string|null} base
 * @property {string} branch
 * @property {string|null} out
 * @property {string|null} entry
 * @property {boolean} help
 * @property {string|null} error
 */

const VALUED = {
  '--base': 'base',
  '--branch': 'branch',
  '--out': 'out',
  '--entry': 'entry',
}

/**
 * @param {string[]} argv `process.argv.slice(2)`
 * @returns {FleetArgs}
 */
export function parseArgs(argv = []) {
  /** @type {FleetArgs} */
  const parsed = {
    site: null,
    base: null,
    branch: 'HEAD',
    out: null,
    entry: null,
    help: false,
    error: null,
  }
  const fail = (/** @type {string} */ message) => {
    parsed.error = message
    return parsed
  }
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (arg.startsWith('-')) {
      const eq = arg.indexOf('=')
      const flag = eq === -1 ? arg : arg.slice(0, eq)
      const key = VALUED[flag]
      if (!key) return fail(`unknown option: ${flag}`)
      const value = eq === -1 ? argv[++at] : arg.slice(eq + 1)
      if (value === undefined || value === '' || value.startsWith('--'))
        return fail(`${flag} needs a value`)
      parsed[key] = value
      continue
    }
    if (parsed.site) return fail(`one site at a time: ${arg}`)
    parsed.site = arg
  }
  if (parsed.help) return parsed
  if (!parsed.site) return fail('name the site folder')
  if (!parsed.base) return fail('--base <ref> is required')
  return parsed
}

/**
 * The site's build script and its arguments, from `--entry` or from
 * package.json's `build` script by bench's rules (a bare `node <script>` only;
 * `node router`, with no extension, is read as `router`, which node resolves).
 *
 * @param {any} pkg the site's package.json, or null
 * @param {string|null} [explicit] `--entry`
 * @returns {string[]|null} `[script, ...args]`, or null when it cannot tell
 */
export function siteEntry(pkg, explicit = null) {
  const entry = resolveSiteEntry(pkg, explicit)
  if (!entry) return null
  const words = splitEntry(entry)
  return words.length > 0 ? words : null
}

/**
 * Whether `target` is `root` or inside it. A build folder outside the site
 * copy is refused: the check removes and copies build folders, and must
 * never do that to a folder it does not own.
 *
 * @param {string} root
 * @param {string} target
 */
export function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * The reports with every pipeline step's duration set to 0, copied rather than
 * changed in place. `diffReports` never reads a duration, so this changes no
 * verdict; it keeps the printed comparison free of a number that differs
 * between any two runs.
 *
 * @param {any[]} reports
 * @returns {any[]}
 */
export function zeroDurations(reports = []) {
  return reports.map((report) =>
    Array.isArray(report?.pipeline)
      ? {
          ...report,
          pipeline: report.pipeline.map((step) => ({ ...step, duration: 0 })),
        }
      : report,
  )
}

/**
 * One report as the counts a person compares at a glance.
 *
 * @param {any} report
 * @returns {string}
 */
export function reportLine(report) {
  const count = (/** @type {any} */ list) =>
    Array.isArray(list) ? list.length : 'n/a'
  return (
    `${report?.buildDir}: ok=${report?.ok} pages=${count(report?.pages)} ` +
    `failures=${count(report?.failures)} links.broken=${count(report?.links?.broken)} ` +
    `audit.findings=${count(report?.audit?.findings)}`
  )
}

// A CheckDiff that says nothing moved.
function diffIsEmpty(diff) {
  const pkg = diff.packages
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    diff.assets.length === 0 &&
    !diff.consent &&
    (!pkg || pkg.added.length + pkg.removed.length + pkg.changed.length === 0)
  )
}

/**
 * The page hashes of every report, compared one by one by output path. A null
 * hash on either side counts as changed, as `diffReports` counts it: a page
 * with no bytes is never "the same".
 *
 * @param {any[]} before
 * @param {any[]} after
 */
export function compareHashes(before = [], after = []) {
  const hashes = (/** @type {any[]} */ reports) => {
    const map = new Map()
    for (const report of reports)
      for (const page of report?.pages ?? [])
        if (typeof page?.buildTo === 'string')
          map.set(page.buildTo, page.hash ?? null)
    return map
  }
  const a = hashes(before)
  const b = hashes(after)
  const changed = []
  for (const [page, hash] of a)
    if (b.has(page) && (hash === null || hash !== b.get(page)))
      changed.push(page)
  const removed = [...a.keys()].filter((page) => !b.has(page))
  const added = [...b.keys()].filter((page) => !a.has(page))
  return {
    before: a.size,
    after: b.size,
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
  }
}

/**
 * The whole report comparison. Something differs when `diffReports` moved a
 * page, an asset, a package or the consent text; when a page hash differs;
 * when the two runs built different folders; or when a report's summary
 * counts differ (an audit finding gained with every page unchanged is still a
 * change in what the site is told).
 *
 * @param {any[]} before the base engine's reports
 * @param {any[]} after the branch engine's reports
 */
export function compareReports(before = [], after = []) {
  const was = zeroDurations(before)
  const now = zeroDurations(after)
  const diffs = diffReports(was, now)
  const hashes = compareHashes(was, now)
  const baseLines = was.map(reportLine)
  const branchLines = now.map(reportLine)
  const folders = (/** @type {any[]} */ reports) =>
    reports
      .map((r) => r?.buildDir)
      .sort()
      .join('\n')
  const foldersDiffer = folders(was) !== folders(now)
  const linesDiffer =
    [...baseLines].sort().join('\n') !== [...branchLines].sort().join('\n')
  const differs =
    foldersDiffer ||
    linesDiffer ||
    diffs.some((d) => !diffIsEmpty(d)) ||
    hashes.changed.length + hashes.added.length + hashes.removed.length > 0
  return {
    baseLines,
    branchLines,
    diffs,
    formatted: diffs.map((d) => `${d.buildDir}\n${formatDiff(d)}`),
    hashes,
    foldersDiffer,
    linesDiffer,
    differs,
  }
}

/**
 * Two build folders, as maps from a file's path to its bytes, compared byte
 * for byte, and the files that differ compared again with each engine's
 * version string replaced by `<version>`. The bytes are read as latin1, one
 * character per byte, so the replacement never makes two different binaries
 * decode equal (utf8 would turn every invalid sequence into the same U+FFFD).
 *
 * @param {Map<string, Buffer>} filesA the base engine's build
 * @param {Map<string, Buffer>} filesB the branch engine's build
 * @param {string} versionA the base engine's version
 * @param {string} versionB the branch engine's version
 */
export function compareFolders(filesA, filesB, versionA, versionB) {
  const onlyA = [...filesA.keys()].filter((f) => !filesB.has(f)).sort()
  const onlyB = [...filesB.keys()].filter((f) => !filesA.has(f)).sort()
  const bytes = []
  const beyondVersion = []
  const blank = (/** @type {Buffer} */ buf, /** @type {string} */ version) =>
    version
      ? buf.toString('latin1').split(version).join('<version>')
      : buf.toString('latin1')
  for (const file of [...filesA.keys()].filter((f) => filesB.has(f)).sort()) {
    const a = /** @type {Buffer} */ (filesA.get(file))
    const b = /** @type {Buffer} */ (filesB.get(file))
    if (a.equals(b)) continue
    bytes.push(file)
    const textA = blank(a, versionA)
    const textB = blank(b, versionB)
    if (textA === textB) continue
    let at = 0
    while (at < textA.length && textA[at] === textB[at]) at++
    beyondVersion.push({
      file,
      at,
      a: textA.slice(Math.max(0, at - 60), at + 120),
      b: textB.slice(Math.max(0, at - 60), at + 120),
    })
  }
  return {
    countA: filesA.size,
    countB: filesB.size,
    onlyA,
    onlyB,
    bytes,
    beyondVersion,
    differs: onlyA.length + onlyB.length + beyondVersion.length > 0,
  }
}

/**
 * The exit code: 1 when either comparison found a difference, else 0.
 *
 * @param {{ differs: boolean }} reports
 * @param {{ differs: boolean }} folders
 * @returns {0|1}
 */
export function exitCodeFor(reports, folders) {
  return reports.differs || folders.differs ? 1 : 0
}

/**
 * The few lines a person pastes into a pulse log.
 *
 * @param {{ site: string, base: { ref: string, sha: string, version: string },
 *   branch: { ref: string, sha: string, version: string },
 *   reports: ReturnType<typeof compareReports>,
 *   folders: ReturnType<typeof compareFolders> }} input
 * @returns {string}
 */
export function summaryLines({ site, base, branch, reports, folders }) {
  const h = reports.hashes
  const verdict = exitCodeFor(reports, folders) === 0 ? 'identical' : 'DIFFERS'
  return [
    `Fleet check: ${site}, ${base.ref} (${base.sha.slice(0, 7)}, ${base.version}) against ${branch.ref} (${branch.sha.slice(0, 7)}, ${branch.version}): ${verdict}.`,
    `- Reports: ${reports.baseLines.length} on base, ${reports.branchLines.length} on branch; ` +
      `${reports.linesDiffer ? 'summary counts differ' : 'summary counts equal'}; ` +
      `${reports.diffs.every(diffIsEmpty) ? 'diffReports moved nothing' : 'diffReports moved something'}.`,
    `- Page hashes: ${h.before} on base, ${h.after} on branch, ${h.changed.length} changed, ${h.added.length} added, ${h.removed.length} removed.`,
    `- Build folders: ${folders.countA} files on base, ${folders.countB} on branch, ` +
      `${folders.onlyA.length} only on base, ${folders.onlyB.length} only on branch, ` +
      `${folders.bytes.length} differ as bytes, ${folders.beyondVersion.length} still differ with the version string taken out.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The thin part: processes and the filesystem.
// ---------------------------------------------------------------------------

class FleetError extends Error {}

function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  })
  if (r.error) throw new FleetError(`${command} ${args[0]}: ${r.error.message}`)
  return r
}

function must(r, what) {
  if (r.status !== 0)
    throw new FleetError(
      `${what} failed (exit ${r.status})\n${String(r.stderr ?? '').trim()}`,
    )
  return r
}

// npm is npm.cmd on Windows, which Node will not spawn without a shell. One
// command string, every argument quoted: they are paths and our own flags.
function npm(args, cwd) {
  const quoted = args.map((a) => (/^[\w@./:=-]+$/.test(a) ? a : `"${a}"`))
  return process.platform === 'win32'
    ? run(`npm ${quoted.join(' ')}`, [], { cwd, shell: true })
    : run('npm', args, { cwd })
}

function git(args, cwd = ROOT, extra = {}) {
  return run('git', args, { cwd, ...extra })
}

function copySite(site, dest) {
  const isRepo =
    git(['rev-parse', '--is-inside-work-tree'], site).stdout.trim() ===
      'true' &&
    path.resolve(git(['rev-parse', '--show-toplevel'], site).stdout.trim()) ===
      path.resolve(site)
  if (isRepo) {
    must(git(['clone', '--quiet', '--local', site, dest], ROOT), 'git clone')
    return 'git clone --local (committed state)'
  }
  // A build folder in the copy is harmless: each build's folder is removed
  // before the build that writes it.
  fs.cpSync(site, dest, {
    recursive: true,
    filter: (src) => !['node_modules', '.git'].includes(path.basename(src)),
  })
  return 'copy without node_modules and .git (not a git repository)'
}

// `git archive` piped into `tar` run in the target folder: no path is handed
// to tar, so neither a drive letter nor which tar is on PATH matters.
function pack(ref, dir) {
  const sha = must(
    git(['rev-parse', '--verify', `${ref}^{commit}`]),
    `git rev-parse ${ref}`,
  ).stdout.trim()
  const src = path.join(dir, 'src')
  fs.mkdirSync(src, { recursive: true })
  const archive = must(
    git(['archive', '--format=tar', sha], ROOT, { encoding: 'buffer' }),
    `git archive ${ref}`,
  ).stdout
  must(run('tar', ['-xf', '-'], { cwd: src, input: archive }), 'tar')
  const version = JSON.parse(
    fs.readFileSync(path.join(src, 'package.json'), 'utf8'),
  ).version
  const packed = must(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', dir], src),
    `npm pack ${ref}`,
  )
  const filename = JSON.parse(packed.stdout)[0]?.filename
  if (!filename) throw new FleetError(`npm pack ${ref} named no tarball`)
  return { ref, sha, version, tarball: path.join(dir, filename) }
}

function walk(root, dir = root, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(root, full, out)
    else if (entry.isFile())
      out.set(
        path.relative(root, full).replaceAll('\\', '/'),
        fs.readFileSync(full),
      )
  }
  return out
}

// One engine, end to end in the copy: install, check, plain build, keep the
// build folders. Logs go to files in <out>, so stdout stays the comparison.
function buildWith(engine, label, siteDir, entry, out) {
  const log = (name, r) =>
    fs.writeFileSync(
      path.join(out, `${label}-${name}.log`),
      `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
    )
  fs.rmSync(path.join(siteDir, 'node_modules', 'kiss-ssg'), {
    recursive: true,
    force: true,
  })
  const install = npm(
    [
      'install',
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      engine.tarball,
    ],
    siteDir,
  )
  log('install', install)
  must(install, `npm install ${label}`)
  const installed = JSON.parse(
    fs.readFileSync(
      path.join(siteDir, 'node_modules', 'kiss-ssg', 'package.json'),
      'utf8',
    ),
  ).version
  if (installed !== engine.version)
    throw new FleetError(
      `${label}: node_modules/kiss-ssg is ${installed}, the tarball is ${engine.version}`,
    )

  const env = { ...process.env, NO_COLOR: '1' }
  const bin = path.join('node_modules', 'kiss-ssg', 'bin', 'kiss-ssg.js')
  const check = run(process.execPath, [bin, 'check', ...entry], {
    cwd: siteDir,
    env,
    timeout: 600000,
  })
  log('check', check)
  let reports
  try {
    reports = readReportsFile(check.stdout)
  } catch (err) {
    throw new FleetError(
      `${label}: could not read check's report (${err.message})`,
    )
  }
  if (reports.length === 0)
    throw new FleetError(`${label}: kiss-ssg check printed no report`)

  const folders = [...new Set(reports.map((r) => r.buildDir))]
  for (const folder of folders)
    if (!isInside(siteDir, path.resolve(siteDir, folder)))
      throw new FleetError(
        `${label}: build folder ${folder} is outside the site copy; refusing to remove it`,
      )
  for (const folder of folders)
    fs.rmSync(path.resolve(siteDir, folder), { recursive: true, force: true })
  const build = run(process.execPath, entry, {
    cwd: siteDir,
    env,
    timeout: 600000,
  })
  log('build', build)

  const files = new Map()
  for (const folder of folders) {
    const from = path.resolve(siteDir, folder)
    const rel = path.relative(siteDir, from).replaceAll('\\', '/') || '.'
    if (!fs.existsSync(from)) continue
    const kept = path.join(out, `${label}-build`, rel)
    fs.cpSync(from, kept, { recursive: true })
    for (const [file, bytes] of walk(from)) files.set(`${rel}/${file}`, bytes)
  }
  return {
    reports,
    files,
    checkStatus: check.status,
    buildStatus: build.status,
  }
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  if (args.error) {
    console.error(`fleet-check: ${args.error}\n\n${USAGE}`)
    return 2
  }
  const site = path.resolve(/** @type {string} */ (args.site))
  if (!fs.existsSync(site)) throw new FleetError(`no such site folder: ${site}`)
  const out = args.out
    ? path.resolve(args.out)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-fleet-'))
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0)
    throw new FleetError(`--out ${out} is not empty`)
  fs.mkdirSync(out, { recursive: true })

  const siteDir = path.join(out, 'site')
  const how = copySite(site, siteDir)
  const pkgPath = path.join(siteDir, 'package.json')
  const pkg = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    : null
  const entry = siteEntry(pkg, args.entry)
  if (!entry)
    throw new FleetError(
      `could not tell how ${site} builds: name it with --entry "<script> [args]"`,
    )

  console.error(`fleet-check: site copied to ${siteDir} by ${how}`)
  const base = pack(/** @type {string} */ (args.base), path.join(out, 'base'))
  const branch = pack(args.branch, path.join(out, 'branch'))
  console.error(
    `fleet-check: packed ${base.ref} ${base.version} and ${branch.ref} ${branch.version}; building ${entry.join(' ')}`,
  )
  const a = buildWith(base, 'base', siteDir, entry, out)
  const b = buildWith(branch, 'branch', siteDir, entry, out)

  const reports = compareReports(a.reports, b.reports)
  const folders = compareFolders(a.files, b.files, base.version, branch.version)

  console.log(`base   check exit ${a.checkStatus}, build exit ${a.buildStatus}`)
  for (const line of reports.baseLines) console.log(`base   ${line}`)
  console.log(`branch check exit ${b.checkStatus}, build exit ${b.buildStatus}`)
  for (const line of reports.branchLines) console.log(`branch ${line}`)
  console.log('\n--- diffReports (base -> branch)')
  for (const text of reports.formatted) console.log(text)
  for (const page of reports.hashes.changed)
    console.log(`hash changed: ${page}`)
  for (const page of reports.hashes.added) console.log(`hash added: ${page}`)
  for (const page of reports.hashes.removed)
    console.log(`hash removed: ${page}`)
  console.log('\n--- build folders')
  for (const file of folders.onlyA) console.log(`only on base: ${file}`)
  for (const file of folders.onlyB) console.log(`only on branch: ${file}`)
  for (const d of folders.beyondVersion) {
    console.log(`differs beyond the version: ${d.file} at ${d.at}`)
    console.log(`  base:   ${JSON.stringify(d.a)}`)
    console.log(`  branch: ${JSON.stringify(d.b)}`)
  }
  console.log(
    `\n${summaryLines({ site, base, branch, reports, folders })}\n\nKept in ${out}`,
  )
  return exitCodeFor(reports, folders)
}

if (isMain(import.meta.filename)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (err) {
    console.error(`fleet-check: ${err.message}`)
    process.exitCode = 2
  }
}
