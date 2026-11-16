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
 * The child's end of the dev channel (spec § 5.4): the command's `{ stop: true }`
 * and the channel closing both close every live instance and end the process
 * with 0. Then the channel is unref'd, so it does not keep the child alive: a
 * `message` listener otherwise holds the event loop open for ever and the
 * child could neither exit by itself nor reach `beforeExit`.
 *
 * @param {Pick<NodeJS.Process, 'on'> & { channel?: { unref?: () => void }, send?: unknown }} [proc]
 * @returns {boolean} whether the channel was wired by this call
 */
export function wireChannel(proc?: Pick<NodeJS.Process, "on"> & {
    channel?: {
        unref?: () => void;
    };
    send?: unknown;
}): boolean;
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
