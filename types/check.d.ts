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
export function parseArgs(argv?: string[]): CheckArgs;
/**
 * Reads the JSON Lines file `KISS_REPORT` collects — one line per `Kiss`
 * instance that settled a build. Blank lines (a trailing newline, above all)
 * are skipped; a malformed one throws, because a report nobody can read is a
 * finding rather than an absence.
 *
 * @param {string} [text]
 * @returns {import('./build-report.js').BuildReport[]}
 */
export function readReports(text?: string): import("./build-report.js").BuildReport[];
/**
 * The whole verdict. A build nobody reported is a failure of its own: a script
 * that never awaited `complete()` exits 0 on a broken site, which is the exact
 * silence the check exists to break.
 *
 * @param {import('./build-report.js').BuildReport[]} reports
 * @param {number|null} scriptStatus the script's own exit code
 * @returns {0|1}
 */
export function exitCodeFor(reports: import("./build-report.js").BuildReport[], scriptStatus: number | null): 0 | 1;
export const HELP: "kiss-ssg check <script> [args\u2026]\n\nRuns the site's own build script with the build staged and then discarded, and\nprints one JSON report per Kiss instance it created. Nothing published is\ntouched: the build folder is neither emptied nor written.\n\n  --summary   one line per site instead of the JSON\n  --help      this text\n\nEverything after the script is passed through to it, so a site that takes its own\narguments is checked the way it is run \u2014 --summary excepted, which is read\nwherever it appears. A site that needs that word itself takes it after a bare --:\nkiss-ssg check menu.js -- --summary\n\nExits 1 if any site failed to build, if the script itself exited non-zero, or if\nit never settled a build (a script with no awaited complete() reports nothing).";
export type CheckArgs = {
    command: "check" | "help";
    /**
     * the site's build script
     */
    script: string | null;
    /**
     * everything after it, passed through to the script
     */
    args: string[];
    /**
     * print `formatReport` lines instead of JSON
     */
    summary: boolean;
    /**
     * a usage error: print it with the help and exit 1
     */
    error: string | null;
};
