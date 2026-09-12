// The decision core behind `bin/kiss-ssg.js`: what the argv asked for, what the
// reports file says, and what to exit with. Pure — the bin around it spawns the
// site's own build script, writes the temp file and prints. Keeping the three
// answers here is what makes them testable without a child process.

export const HELP = `kiss-ssg <command> <script> [args…]

  check <script>   run the site's own build script with the build staged and
                   then discarded, and print one JSON report per Kiss instance
                   it created. Nothing published is touched: the build folder is
                   neither emptied nor written.
  aikb <script>    record the site's knowledge base from a passing build. The
                   same staged, discarded run as check — it publishes nothing —
                   but it rewrites config.folders.aikb: the site map, and the
                   report snapshot the diff measures against. It refuses to
                   record a failed build.

Options, for both commands:

  --summary          one line per site instead of the JSON
  --against <file>   diff this build against an earlier report, and say which
                     pages were added, removed or changed
  --help             this text

Everything after the script is passed through to it, so a site that takes its own
arguments is checked the way it is run — --summary excepted, which is read
wherever it appears. A site that needs that word itself takes it after a bare --:
kiss-ssg check menu.js -- --summary

--against takes a file this or another build wrote: a KISS_REPORT JSON Lines
file, the JSON array check itself prints, or a single report object. Pages are
matched by output path and compared by the hash of the bytes they wrote, per
build folder. In --summary the diff prints under each site's line (+ added,
- removed, ~ changed, = N unchanged); otherwise stdout becomes
{ "reports": [...], "diff": [...] } instead of the bare array. It never changes
the exit code — a diff is a description of the build, not a verdict on it.

check diffs without being asked: a site that has recorded its knowledge base is
compared against <folders.aikb>/last-build.json unless --against names another
file. aikb has just overwritten that file, so it diffs only when --against is
given explicitly.

Exits 1 if any site failed to build, if the script itself exited non-zero, or if
it never settled a build (a script with no awaited complete() reports nothing).`

const OPTIONS = { '--summary': 'summary' }
// Options that take the next word. Kept apart from the boolean ones so the
// parse loop cannot mistake a filename for a flag, or a flag for a filename.
const VALUE_OPTIONS = { '--against': 'against' }

/**
 * @typedef {Object} CheckArgs
 * @property {'check'|'aikb'|'help'} command
 * @property {string|null} script the site's build script
 * @property {string[]} args everything after it, passed through to the script
 * @property {boolean} summary print `formatReport` lines instead of JSON
 * @property {string|null} against an earlier report to diff this build against
 * @property {string|null} error a usage error: print it with the help and exit 1
 */

/**
 * @param {string[]} [argv] `process.argv.slice(2)`
 * @returns {CheckArgs}
 */
export function parseArgs(argv = []) {
  // Annotated, or `command: 'help'` infers `string` and every return below
  // fails against the `'check'|'aikb'|'help'` union the typedef promises.
  /** @type {CheckArgs} */
  const parsed = {
    command: 'help',
    script: null,
    args: [],
    summary: false,
    against: null,
    error: null,
  }
  const [command, ...rest] = argv
  if (command === undefined) {
    parsed.error = 'nothing to do'
    return parsed
  }
  if (command === '--help' || command === '-h' || command === 'help')
    return parsed
  // Two commands, one parse: `aikb` runs the identical staged build and takes
  // the identical options, and differs only in the one env var the bin adds and
  // in what it says afterwards.
  if (command !== 'check' && command !== 'aikb') {
    parsed.error = `unknown command: ${command}`
    return parsed
  }

  parsed.command = command
  let at = 0
  // Before the script, an unrecognised flag is a usage error rather than
  // something to pass on: there is no script yet for it to belong to.
  for (; at < rest.length; at++) {
    if (!rest[at].startsWith('-')) break
    if (rest[at] === '--') break
    const option = OPTIONS[rest[at]]
    if (option) {
      parsed[option] = true
      continue
    }
    const valued = VALUE_OPTIONS[rest[at]]
    if (valued) {
      // `--` is the end of our options, never a filename — a bare `--against`
      // at the end of the line is a typo, and reading the script as the file
      // would check the site against its own build script.
      const value = rest[at + 1]
      if (value === undefined || value === '--') {
        parsed.error = `${rest[at]} needs a report file: kiss-ssg ${command} ${rest[at]} <file> <script>`
        return parsed
      }
      parsed[valued] = value
      at++
      continue
    }
    parsed.error = `unknown option: ${rest[at]}`
    return parsed
  }
  if (rest[at] === '--') at++
  parsed.script = rest[at] ?? null
  // Everything after the script belongs to the script — except `--summary`,
  // which reads as a request about the report wherever it is written, and is
  // the one word `--` exists to hand through (`check site.js -- --summary`).
  const passed = rest.slice(at + 1)
  const separator = passed.indexOf('--')
  const ours = separator === -1 ? passed : passed.slice(0, separator)
  if (ours.includes('--summary')) parsed.summary = true
  parsed.args = [
    ...ours.filter((arg) => arg !== '--summary'),
    ...(separator === -1 ? [] : passed.slice(separator + 1)),
  ]
  if (!parsed.script)
    parsed.error = `${command} needs the site's build script: kiss-ssg ${command} <script>`
  return parsed
}

/**
 * Reads the JSON Lines file `KISS_REPORT` collects — one line per `Kiss`
 * instance that settled a build. Blank lines (a trailing newline, above all)
 * are skipped; a malformed one throws, because a report nobody can read is a
 * finding rather than an absence.
 *
 * @param {string} [text]
 * @returns {import('./build-report.js').BuildReport[]}
 */
export function readReports(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

/**
 * Reads whatever file `--against` was given. Three shapes reach this, and all
 * three are a report file somebody kept: the JSON Lines `KISS_REPORT` appends
 * to, the JSON array `check` itself prints, and a single report object (what a
 * site that keeps its last build in one file has). Sniffing beats asking the
 * caller which one they have — the extension is `.json` for two of the three,
 * and being wrong about it is a usage error over something the bytes already
 * say.
 *
 * JSON Lines is the fallback rather than the first guess because a one-line
 * file holding a single report is valid JSON too: `JSON.parse` answers that
 * case correctly, and only a multi-line file it cannot parse is JSON Lines.
 * A file that is neither still throws, from `readReports`, naming the line.
 *
 * @param {string} [text]
 * @returns {import('./build-report.js').BuildReport[]}
 */
export function readReportsFile(text = '') {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return readReports(text)
  }
  if (Array.isArray(parsed)) return parsed
  return parsed && typeof parsed === 'object' ? [parsed] : []
}

/**
 * The report file `check` diffs against when nobody named one: the knowledge
 * base's own snapshot of the last recorded build. Pure — the bin decides
 * whether the path exists, because a site that has never recorded one is the
 * ordinary case and a missing file there is not an error.
 *
 * The first report that names a folder wins. A script that builds several sites
 * writes one report each, but they share a working tree and therefore a
 * knowledge base: `diffReports` already pairs the file's contents with this
 * run's reports by `buildDir`, so one baseline covers all of them.
 *
 * @param {import('./build-report.js').BuildReport[]} [reports]
 * @returns {string|null} the path, or `null` when no site recorded a folder
 */
export function defaultBaseline(reports = []) {
  for (const report of reports ?? []) {
    const folder = report?.aikb?.folder
    if (folder) return `${folder}/last-build.json`
  }
  return null
}

/**
 * What `kiss-ssg aikb` says about one site under `--summary`, printed under
 * that site's `formatReport` line. A record either happened or it did not, and
 * a run that wrote nothing has to say why — silence after a command whose whole
 * job is to write a folder reads as success.
 *
 * @param {import('./build-report.js').BuildReport} report
 * @returns {string}
 */
export function recordedLine(report) {
  if (report?.aikb?.written) return `  recorded ${report.aikb.folder}`
  // Order matters: a failed build is the reason worth naming, whether or not
  // the site even has a folder configured.
  if (!report?.ok) return '  not recorded — build failed'
  if (!report?.aikb) return '  not recorded — folders.aikb is null'
  return '  not recorded'
}

/**
 * One build folder's worth of difference between two reports.
 *
 * @typedef {Object} CheckDiff
 * @property {string} buildDir the folder both sides were built for
 * @property {string[]} added output paths only the new build wrote
 * @property {string[]} removed output paths only the old build wrote
 * @property {string[]} changed output paths whose bytes differ
 * @property {number} unchanged how many pages wrote byte-identical output
 */

// A page with no output path (a `.pages()` item that failed before it had one)
// is not a row in either side of the diff: there is no file to have added,
// removed or changed. Later entries win, the way the last write to a path does.
function hashesByPath(report) {
  const hashes = new Map()
  for (const page of report?.pages ?? [])
    if (typeof page?.buildTo === 'string')
      hashes.set(page.buildTo, page.hash ?? null)
  return hashes
}

/**
 * What this build did to the last one, per build folder — pure, so the whole
 * comparison is testable without a filesystem.
 *
 * Reports are paired by `buildDir` because one script may build several sites
 * and their page paths are not comparable across folders. An `after` report
 * with no partner is a site the old file never saw, so every page it wrote is
 * an addition; a `before` report with no partner is ignored — this run did not
 * build that site, which is not the same as having removed its pages.
 *
 * A `null` hash on either side counts as changed rather than unchanged: a page
 * that failed, was skipped, or came from a report written before hashes existed
 * has no bytes to compare, and "unchanged" is the one answer that would be a
 * lie.
 *
 * @param {import('./build-report.js').BuildReport[]} [before]
 * @param {import('./build-report.js').BuildReport[]} [after]
 * @returns {CheckDiff[]} one entry per `after` report, in `after` order
 */
export function diffReports(before = [], after = []) {
  // Last one wins: a KISS_REPORT file is appended to across builds, so when it
  // holds several reports for one folder the newest is the baseline a
  // developer means by "since the last build".
  const partners = new Map()
  for (const report of before ?? [])
    if (report) partners.set(report.buildDir, report)

  return (after ?? []).map((report) => {
    const was = hashesByPath(partners.get(report?.buildDir))
    const now = hashesByPath(report)
    const added = []
    const changed = []
    let unchanged = 0
    for (const [buildTo, hash] of now) {
      if (!was.has(buildTo)) added.push(buildTo)
      else if (
        hash === null ||
        was.get(buildTo) === null ||
        hash !== was.get(buildTo)
      )
        changed.push(buildTo)
      else unchanged++
    }
    const removed = [...was.keys()].filter((buildTo) => !now.has(buildTo))
    return {
      buildDir: report?.buildDir,
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
      unchanged,
    }
  })
}

/**
 * The human rendering of one `CheckDiff`, indented to sit under the
 * `formatReport` line for the same site. One character per verdict, so a page
 * that moved reads as one line out and one line in rather than as prose.
 *
 * @param {CheckDiff} diff
 * @returns {string}
 */
export function formatDiff(diff) {
  return [
    ...diff.added.map((buildTo) => `  + ${buildTo}`),
    ...diff.removed.map((buildTo) => `  - ${buildTo}`),
    ...diff.changed.map((buildTo) => `  ~ ${buildTo}`),
    `  = ${diff.unchanged} unchanged`,
  ].join('\n')
}

/**
 * The whole verdict. A build nobody reported is a failure of its own: a script
 * that never awaited `complete()` exits 0 on a broken site, which is the exact
 * silence the check exists to break.
 *
 * @param {import('./build-report.js').BuildReport[]} reports
 * @param {number|null} scriptStatus the script's own exit code
 * @returns {0|1}
 */
export function exitCodeFor(reports, scriptStatus) {
  if (scriptStatus !== 0) return 1
  if (!reports || reports.length === 0) return 1
  return reports.every((report) => report?.ok === true) ? 0 : 1
}
