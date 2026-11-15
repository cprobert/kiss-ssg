/**
 * The request in an `--import` URL's `run` query.
 *
 * @param {string} url
 * @returns {import('./run-state.js').RunRequest|null} `null` when the URL carries none, or not one that parses
 */
export function decodeRun(url: string): import("./run-state.js").RunRequest | null;
/**
 * Whether an error is a kiss build failure: the engine marks the rejection of
 * a failed `complete()` with a global symbol, so another copy's is recognised.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isBuildFailure(err: unknown): boolean;
/**
 * Store the request and take ownership of an uncaught build failure, in a
 * process the command owns and nowhere else: a `fork()` or a `Worker` the
 * script starts inherits `execArgv`, so it would otherwise take the mode too.
 *
 * @param {string} url this module's own `import.meta.url`
 * @param {{ ppid?: number, main?: boolean }} [where]
 * @returns {boolean} whether this process took the request
 */
export function activate(url: string, { ppid, main }?: {
    ppid?: number;
    main?: boolean;
}): boolean;
