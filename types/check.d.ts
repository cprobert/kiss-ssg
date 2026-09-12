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
export function readReportsFile(text?: string): import("./build-report.js").BuildReport[];
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
export function defaultBaseline(reports?: import("./build-report.js").BuildReport[]): string | null;
/**
 * What `kiss-ssg aikb` says about one site under `--summary`, printed under
 * that site's `formatReport` line. A record either happened or it did not, and
 * a run that wrote nothing has to say why — silence after a command whose whole
 * job is to write a folder reads as success.
 *
 * @param {import('./build-report.js').BuildReport} report
 * @returns {string}
 */
export function recordedLine(report: import("./build-report.js").BuildReport): string;
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
export function diffReports(before?: import("./build-report.js").BuildReport[], after?: import("./build-report.js").BuildReport[]): CheckDiff[];
/**
 * The human rendering of one `CheckDiff`, indented to sit under the
 * `formatReport` line for the same site. One character per verdict, so a page
 * that moved reads as one line out and one line in rather than as prose.
 *
 * @param {CheckDiff} diff
 * @returns {string}
 */
export function formatDiff(diff: CheckDiff): string;
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
export const HELP: "kiss-ssg <command> <script> [args\u2026]\n\n  check <script>   run the site's own build script with the build staged and\n                   then discarded, and print one JSON report per Kiss instance\n                   it created. Nothing published is touched: the build folder is\n                   neither emptied nor written.\n  aikb <script>    record the site's knowledge base from a passing build. The\n                   same staged, discarded run as check \u2014 it publishes nothing \u2014\n                   but it rewrites config.folders.aikb: the site map, and the\n                   report snapshot the diff measures against. It refuses to\n                   record a failed build.\n\nOptions, for both commands:\n\n  --summary          one line per site instead of the JSON\n  --against <file>   diff this build against an earlier report, and say which\n                     pages were added, removed or changed\n  --help             this text\n\nEverything after the script is passed through to it, so a site that takes its own\narguments is checked the way it is run \u2014 --summary excepted, which is read\nwherever it appears. A site that needs that word itself takes it after a bare --:\nkiss-ssg check menu.js -- --summary\n\n--against takes a file this or another build wrote: a KISS_REPORT JSON Lines\nfile, the JSON array check itself prints, or a single report object. Pages are\nmatched by output path and compared by the hash of the bytes they wrote, per\nbuild folder. In --summary the diff prints under each site's line (+ added,\n- removed, ~ changed, = N unchanged); otherwise stdout becomes\n{ \"reports\": [...], \"diff\": [...] } instead of the bare array. It never changes\nthe exit code \u2014 a diff is a description of the build, not a verdict on it.\n\ncheck diffs without being asked: a site that has recorded its knowledge base is\ncompared against <folders.aikb>/last-build.json unless --against names another\nfile. aikb has just overwritten that file, so it diffs only when --against is\ngiven explicitly.\n\nExits 1 if any site failed to build, if the script itself exited non-zero, or if\nit never settled a build (a script with no awaited complete() reports nothing).";
export type CheckArgs = {
    command: "check" | "aikb" | "help";
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
     * an earlier report to diff this build against
     */
    against: string | null;
    /**
     * a usage error: print it with the help and exit 1
     */
    error: string | null;
};
/**
 * One build folder's worth of difference between two reports.
 */
export type CheckDiff = {
    /**
     * the folder both sides were built for
     */
    buildDir: string;
    /**
     * output paths only the new build wrote
     */
    added: string[];
    /**
     * output paths only the old build wrote
     */
    removed: string[];
    /**
     * output paths whose bytes differ
     */
    changed: string[];
    /**
     * how many pages wrote byte-identical output
     */
    unchanged: number;
};
