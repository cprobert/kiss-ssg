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
export function parseSpeedArgs(argv?: string[]): SpeedArgs;
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
export function resolveTarget(target: string, { cwd, isDirectory, isFile }: {
    cwd: string;
    isDirectory: (p: string) => boolean;
    isFile: (p: string) => boolean;
}): SpeedTarget;
/**
 * Whether `version` (`process.versions.node`) is at least `floor`.
 *
 * @param {string} version
 * @param {string} [floor]
 * @returns {boolean}
 */
export function nodeAtLeast(version: string, floor?: string): boolean;
/**
 * The KPIs of one Lighthouse run, read off its result object (the LHR), or
 * why there are none. A page that did not load still returns an LHR, with a
 * `runtimeError` and a `null` score: that is a failed run, never a zero.
 *
 * @param {any} lhr
 * @returns {{ version: string|null, values: Record<string, number> } | { error: string }}
 */
export function kpisFrom(lhr: any): {
    version: string | null;
    values: Record<string, number>;
} | {
    error: string;
};
/**
 * The median: the middle value, or the mean of the two middle values.
 *
 * @param {number[]} values
 * @returns {number}
 */
export function median(values: number[]): number;
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
export function summarise(runs: Record<string, number>[]): {
    median: Record<string, number>;
    spread: Record<string, Spread>;
};
/**
 * The file `--out` writes and `--against` reads.
 *
 * @param {{ lighthouse: string|null, runs: number, pages: SpeedPage[] }} measured
 * @returns {SpeedRecord}
 */
export function speedRecord({ lighthouse, runs, pages }: {
    lighthouse: string | null;
    runs: number;
    pages: SpeedPage[];
}): SpeedRecord;
/**
 * Reads an `--out` file back. Throws, naming the problem, on anything else.
 *
 * @param {string} text
 * @returns {SpeedRecord}
 */
export function readSpeedFile(text: string): SpeedRecord;
/**
 * @param {SpeedRecord} record
 * @returns {0|1}
 */
export function speedExitCode(record: SpeedRecord): 0 | 1;
/**
 * @param {Metric['unit']} unit
 * @param {number} value
 * @returns {string}
 */
export function formatValue(unit: Metric["unit"], value: number): string;
/**
 * The table on stdout: one row per page, medians, and the score's spread.
 *
 * @param {SpeedRecord} record
 * @returns {string}
 */
export function formatSpeed(record: SpeedRecord): string;
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
export function diffSpeed(before: SpeedRecord, after: SpeedRecord): SpeedDiff;
/**
 * @param {SpeedDiff} diff
 * @returns {string}
 */
export function formatSpeedDiff(diff: SpeedDiff): string;
/**
 * Why Chrome did not start, when the reason is a missing prerequisite rather
 * than a failed run: chrome-launcher's own codes for "no Chrome found".
 *
 * @param {any} err
 * @returns {boolean}
 */
export function isChromeMissing(err: any): boolean;
/**
 * @param {any} err
 * @returns {string}
 */
export function chromeMissingMessage(err: any): string;
/**
 * Lighthouse and chrome-launcher, from the SITE's folder: kiss-ssg never
 * depends on either. chrome-launcher is resolved from Lighthouse's own
 * location, because it is Lighthouse's dependency and need not be hoisted.
 *
 * @param {string} cwd the site's folder
 * @param {{ nodeVersion?: string }} [options]
 * @returns {Promise<{ lighthouse: Function, chromeLauncher: any } | { error: string }>}
 */
export function loadLighthouse(cwd: string, { nodeVersion }?: {
    nodeVersion?: string;
}): Promise<{
    lighthouse: Function;
    chromeLauncher: any;
} | {
    error: string;
}>;
/**
 * Serves `root` as the site root on 127.0.0.1, on a port the OS chooses, with
 * the dev server's static rules and no live reload.
 *
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serveFolder(root: string): Promise<{
    url: string;
    close: () => Promise<void>;
}>;
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
export function measure({ base, pages, runs, lighthouse, chromeLauncher, progress, }: {
    base: string;
    pages: string[];
    runs: number;
    lighthouse: Function;
    chromeLauncher: any;
    progress?: (line: string) => void;
}): Promise<{
    lighthouse: string | null;
    pages: SpeedPage[];
    fatal: string | null;
}>;
/**
 * The whole command, for the bin: `{ code, out, err }` to print and exit with.
 * `load` and `serve` are injectable so a test can run it without Lighthouse.
 *
 * @param {string[]} argv everything after `speed`
 * @param {{ cwd?: string, progress?: (line: string) => void, load?: typeof loadLighthouse, serve?: typeof serveFolder }} [options]
 * @returns {Promise<{ code: 0|1|2, out: string, err: string }>}
 */
export function runSpeed(argv: string[], { cwd, progress, load, serve, }?: {
    cwd?: string;
    progress?: (line: string) => void;
    load?: typeof loadLighthouse;
    serve?: typeof serveFolder;
}): Promise<{
    code: 0 | 1 | 2;
    out: string;
    err: string;
}>;
export const SPEED_HELP: "kiss-ssg speed <build-folder | url> [options]\n\nMeasures pages with Lighthouse: its performance category, its mobile preset\nwith simulated throttling, each run in a fresh Chrome. Prints the median of the\nruns per page: the performance score (with its min-max spread), LCP, CLS, TBT,\nFCP, Speed Index, the total byte weight and the number of requests.\n\n  <build-folder>     a site's build folder (public/ by default), served as the\n                     site root on 127.0.0.1. Build the site first: speed never\n                     runs the build, so it measures what is on disk\n  <url>              an http(s) URL, measured as it is served. The only way the\n                     host's delivery (CDN, compression, caching) is measured\n\nOptions:\n\n  --page <path>      a page to measure, from the site root; repeat it for more.\n                     Default: / (for a URL, the URL's own path)\n  --runs <n>         runs per page, 1 to 9. Default: 3\n  --out <file>       also write the measurement as JSON, for a later --against\n  --against <file>   compare with an earlier --out file: before -> after per\n                     page and metric. A change is marked \"changed\" only when it\n                     is larger than the spread of both measurements\n  --help             this text\n\nLighthouse is not a dependency of kiss-ssg. Install it in the site:\n  npm install -D lighthouse\nIt needs Node 22.19 or newer, and a Chrome it can find (or CHROME_PATH).\n\nExits 0 when every page was measured, 1 when a page failed to load or\nLighthouse failed, and 2 on a usage error or a missing prerequisite.\n\nA lab measurement on this machine: compare runs made here with each other,\nnever with a site's field data.";
/** Lighthouse 13's own floor (`engines.node`), not kiss-ssg's. */
export const MIN_NODE: "22.19.0";
export const MIN_RUNS: 1;
export const MAX_RUNS: 9;
export const DEFAULT_RUNS: 3;
export const INSTALL_LINE: "npm install -D lighthouse";
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
export const METRICS: Metric[];
export type SpeedArgs = {
    /**
     * the build folder or URL
     */
    target: string | null;
    /**
     * the `--page` paths, or `null` for the default
     */
    pages: string[] | null;
    runs: number;
    out: string | null;
    against: string | null;
    help: boolean;
    /**
     * a usage error
     */
    error: string | null;
};
/**
 * What the target names. A URL is measured where it is; a folder is served
 * as the site root. A file — a site's build script — is refused, not run:
 * kiss has no way to learn a script's `folders.build` short of running the
 * script, which is a build, and speed measures what is already on disk.
 */
export type SpeedTarget = {
    kind: "url";
    base: string;
    page: string;
} | {
    kind: "folder";
    folder: string;
} | {
    kind: "error";
    error: string;
};
export type Spread = {
    min: number;
    max: number;
};
export type MeasuredPage = {
    page: string;
    median: Record<string, number>;
    spread: Record<string, Spread>;
};
export type FailedPage = {
    page: string;
    error: string;
};
export type SpeedPage = MeasuredPage | FailedPage;
export type SpeedRecord = {
    version: 1;
    lighthouse: string | null;
    runs: number;
    pages: SpeedPage[];
};
export type MetricChange = {
    key: string;
    label: string;
    unit: Metric["unit"];
    before: number;
    after: number;
    delta: number;
    noise: number;
    changed: boolean;
};
export type PageChange = {
    page: string;
    metrics: MetricChange[];
} | {
    page: string;
    only: "before" | "after";
} | {
    page: string;
    error: string;
};
export type SpeedDiff = {
    pages: PageChange[];
    warnings: string[];
};
/**
 * One KPI: its key in the JSON, its label in the table, and how to print it.
 * The keys are Lighthouse's own audit ids, so a reader of the JSON can look
 * any of them up; `score` and `requests` are the two Lighthouse has no audit
 * id for in this form.
 */
export type Metric = {
    key: string;
    label: string;
    unit: "score" | "ms" | "unitless" | "bytes" | "count";
};
