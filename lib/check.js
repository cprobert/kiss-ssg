// The decision core behind `bin/kiss-ssg.js`: what the argv asked for, what the
// reports file says, and what to exit with. Pure — the bin around it spawns the
// site's own build script, writes the temp file and prints. Keeping the three
// answers here is what makes them testable without a child process.

export const HELP = `kiss-ssg check <script> [args…]

Runs the site's own build script with the build staged and then discarded, and
prints one JSON report per Kiss instance it created. Nothing published is
touched: the build folder is neither emptied nor written.

  --summary   one line per site instead of the JSON
  --help      this text

Everything after the script is passed through to it, so a site that takes its own
arguments is checked the way it is run — --summary excepted, which is read
wherever it appears. A site that needs that word itself takes it after a bare --:
kiss-ssg check menu.js -- --summary

Exits 1 if any site failed to build, if the script itself exited non-zero, or if
it never settled a build (a script with no awaited complete() reports nothing).`

const OPTIONS = { '--summary': 'summary' }

/**
 * @typedef {Object} CheckArgs
 * @property {'check'|'help'} command
 * @property {string|null} script the site's build script
 * @property {string[]} args everything after it, passed through to the script
 * @property {boolean} summary print `formatReport` lines instead of JSON
 * @property {string|null} error a usage error: print it with the help and exit 1
 */

/**
 * @param {string[]} [argv] `process.argv.slice(2)`
 * @returns {CheckArgs}
 */
export function parseArgs(argv = []) {
  // Annotated, or `command: 'help'` infers `string` and every return below
  // fails against the `'check'|'help'` union the typedef promises.
  /** @type {CheckArgs} */
  const parsed = {
    command: 'help',
    script: null,
    args: [],
    summary: false,
    error: null,
  }
  const [command, ...rest] = argv
  if (command === undefined) {
    parsed.error = 'nothing to do'
    return parsed
  }
  if (command === '--help' || command === '-h' || command === 'help')
    return parsed
  if (command !== 'check') {
    parsed.error = `unknown command: ${command}`
    return parsed
  }

  parsed.command = 'check'
  let at = 0
  // Before the script, an unrecognised flag is a usage error rather than
  // something to pass on: there is no script yet for it to belong to.
  for (; at < rest.length; at++) {
    if (!rest[at].startsWith('-')) break
    if (rest[at] === '--') break
    const option = OPTIONS[rest[at]]
    if (!option) {
      parsed.error = `unknown option: ${rest[at]}`
      return parsed
    }
    parsed[option] = true
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
    parsed.error =
      "check needs the site's build script: kiss-ssg check <script>"
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
