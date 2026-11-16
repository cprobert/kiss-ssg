/**
 * What a command asks of the engine it runs (spec § 4.2). `mode` is `null`
 * when nothing says; `owner` is the command's pid, `null` for an alias.
 *
 * @typedef {Object} RunRequest
 * @property {'build'|'dev'|'check'|null} mode
 * @property {true} [aikb] record the site's knowledge base
 * @property {string} [report] the JSON Lines file each settled build appends to
 * @property {string} [images] the sweep file `kiss-ssg images` reads
 * @property {true} [imagesRefresh] re-encode the cache
 * @property {true} [restart] a dev restart, not the first start
 * @property {number|null} [owner] the pid of the command that started this process
 */
/**
 * What the run state needs of a `Kiss`, and no more: it is handed instances
 * made by any copy of kiss-ssg, so it asks for `close()`, `logger` and
 * `config`. The message also reads two private fields, and only reads them.
 *
 * @typedef {Object} RunInstance
 * @property {{ dev?: boolean, folders: { build: string } }} config
 * @property {{ error: (message: string) => void }} logger
 * @property {() => Promise<void>} close
 */
/**
 * @typedef {Object} RunState
 * @property {number} v
 * @property {RunRequest|null} request
 * @property {Set<RunInstance>} live every instance that still has something for `close()` to do: from construction until `close()`, or until a non-dev build settles with nothing left to close (`released`), and again from `track`
 * @property {Set<RunInstance>} unsettled every non-dev instance whose build has not settled
 * @property {{ beforeExit: boolean, uncaught: boolean, channel: boolean }} armed
 */
/**
 * The shared state, created on first touch.
 *
 * @returns {RunState}
 * @throws if another copy of kiss-ssg wrote a shape this one does not read
 */
export function runState(): RunState;
/**
 * The run this process was started for: the command's request when its
 * preload stored one, otherwise the same shape built from the `KISS_CHECK`,
 * `KISS_AIKB`, `KISS_REPORT`, `KISS_IMAGES` and `KISS_IMAGES_REFRESH` aliases
 * by the rule `CHECK_MODE_OFF` states. The one place the engine reads process
 * state to learn what it was asked to do.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {RunRequest}
 */
export function currentRun(env?: Record<string, string | undefined>): RunRequest;
/**
 * The message for a build the process ended without settling (spec § 4.5).
 *
 * @param {RunInstance} instance a `Kiss`
 * @returns {string}
 */
export function unsettledMessage(instance: RunInstance): string;
/**
 * A new instance. A dev instance is live but never unsettled: it serves until
 * it is stopped. The first unsettled one arms the one `beforeExit` listener.
 *
 * @param {RunInstance} instance a `Kiss`
 */
export function register(instance: RunInstance): void;
/**
 * An instance's build settled, resolved or rejected.
 *
 * @param {RunInstance} instance
 */
export function settled(instance: RunInstance): void;
/**
 * An instance has nothing left for `close()` to do, so it need not stay live to
 * be closed when the process ends: a non-dev build that settled and promoted.
 * The caller decides, because the fields that say so are `Kiss`'s own.
 *
 * @param {RunInstance} instance
 */
export function released(instance: RunInstance): void;
/**
 * A released instance has something for `close()` to do again (it started
 * watching). Never unsettled: its build already settled.
 *
 * @param {RunInstance} instance
 */
export function track(instance: RunInstance): void;
/**
 * An instance was closed.
 *
 * @param {RunInstance} instance
 */
export function closed(instance: RunInstance): void;
/**
 * What a command asks of the engine it runs (spec § 4.2). `mode` is `null`
 * when nothing says; `owner` is the command's pid, `null` for an alias.
 */
export type RunRequest = {
    mode: "build" | "dev" | "check" | null;
    /**
     * record the site's knowledge base
     */
    aikb?: true;
    /**
     * the JSON Lines file each settled build appends to
     */
    report?: string;
    /**
     * the sweep file `kiss-ssg images` reads
     */
    images?: string;
    /**
     * re-encode the cache
     */
    imagesRefresh?: true;
    /**
     * a dev restart, not the first start
     */
    restart?: true;
    /**
     * the pid of the command that started this process
     */
    owner?: number | null;
};
/**
 * What the run state needs of a `Kiss`, and no more: it is handed instances
 * made by any copy of kiss-ssg, so it asks for `close()`, `logger` and
 * `config`. The message also reads two private fields, and only reads them.
 */
export type RunInstance = {
    config: {
        dev?: boolean;
        folders: {
            build: string;
        };
    };
    logger: {
        error: (message: string) => void;
    };
    close: () => Promise<void>;
};
export type RunState = {
    v: number;
    request: RunRequest | null;
    /**
     * every instance that still has something for `close()` to do: from construction until `close()`, or until a non-dev build settles with nothing left to close (`released`), and again from `track`
     */
    live: Set<RunInstance>;
    /**
     * every non-dev instance whose build has not settled
     */
    unsettled: Set<RunInstance>;
    armed: {
        beforeExit: boolean;
        uncaught: boolean;
        channel: boolean;
    };
};
