/**
 * The script a command was asked to run, resolved the way Node resolves an
 * entry point: the name as given, then with `.js`, `.mjs` and `.cjs`.
 *
 * @param {string} name the script as typed
 * @param {string} cwd the folder the person is standing in
 * @param {string} [command] named in the message, which says the script comes first
 * @returns {{ file: string, error: null }|{ file: null, error: string }}
 */
export function resolveScript(name: string, cwd: string, command?: string): {
    file: string;
    error: null;
} | {
    file: null;
    error: string;
};
/**
 * Whether the engine a site resolves can read the command's request: a
 * capability, not a version. `check`, `aikb` and `images` also export the
 * alias variables, so an older engine still serves them; `build` exports none,
 * and an engine that ignored the request would build for real in the wrong mode.
 *
 * @param {ReturnType<typeof import('./check.js').describeEngine>} engine
 * @param {{ cwd: string, command?: string, exists?: (file: string) => boolean }} where
 * @returns {string|null} a refusal, or `null` to go ahead. No engine found is a pass, as `check` has always gone ahead.
 */
export function engineGate(engine: ReturnType<typeof import("./check.js").describeEngine>, { cwd, command, exists }: {
    cwd: string;
    command?: string;
    exists?: (file: string) => boolean;
}): string | null;
/**
 * Everything `runScript` needs to start the child.
 *
 * @typedef {Object} SpawnPlan
 * @property {string[]} execArgv node's own arguments: the preload, with the request in its URL
 * @property {string[]} args the script, then its arguments
 * @property {Record<string, string|undefined>} env
 * @property {'inherit'|[number, number, number]} stdio
 */
/**
 * The request and the child's environment for one command.
 *
 * `check`, `aikb` and `images` run staged and discarded, so their request is
 * `mode: 'check'`, and the five aliases are exported beside it for an engine
 * that predates the preload. `build` runs for real, exports none and removes
 * them from the caller's environment.
 *
 * @param {Object} input
 * @param {'build'|'check'|'aikb'|'images'} input.command
 * @param {string} input.script
 * @param {string[]} [input.args]
 * @param {string} [input.reportFile] the JSON Lines file each settled build appends to
 * @param {string} [input.imagesFile] the sweep file, for `images`
 * @param {boolean} [input.refresh] `images --refresh`
 * @param {Record<string, string|undefined>} [input.env]
 * @param {number} [input.owner] this command's pid
 * @param {string} [input.preload] the `--import` URL of this copy's `run-preload.js`
 * @returns {SpawnPlan}
 */
export function spawnPlan({ command, script, args, reportFile, imagesFile, refresh, env, owner, preload, }: {
    command: "build" | "check" | "aikb" | "images";
    script: string;
    args?: string[];
    reportFile?: string;
    imagesFile?: string;
    refresh?: boolean;
    env?: Record<string, string | undefined>;
    owner?: number;
    preload?: string;
}): SpawnPlan;
/**
 * @typedef {Object} RunResult
 * @property {number|null} status the child's exit code; `null` when it never started or ended by signal
 * @property {string|null} signal
 * @property {Error|null} error the spawn's own error
 */
/**
 * Start the script and wait for it. On the command's own SIGINT or SIGTERM the
 * child is ended (SIGTERM, then SIGKILL after the grace, on POSIX; the tree by
 * `taskkill` on Windows) and the run resolves with a non-zero status: an
 * interrupted build must not let `&& firebase deploy` run.
 *
 * @param {SpawnPlan} plan
 * @param {{ spawn?: typeof nodeSpawn, cwd?: string, platform?: string, signals?: NodeJS.EventEmitter, kill?: (pid: number, signal: string) => void, grace?: number }} [options]
 * `signals` is where SIGINT and SIGTERM are heard: the process. `kill` sends a
 * signal to the child's pid, and `grace` is how long the child gets after
 * SIGTERM before SIGKILL on POSIX, in ms.
 * @returns {Promise<RunResult>}
 */
export function runScript(plan: SpawnPlan, { spawn, cwd, platform, signals, kill, grace, }?: {
    spawn?: typeof nodeSpawn;
    cwd?: string;
    platform?: string;
    signals?: NodeJS.EventEmitter;
    kill?: (pid: number, signal: string) => void;
    grace?: number;
}): Promise<RunResult>;
/**
 * Everything `runScript` needs to start the child.
 */
export type SpawnPlan = {
    /**
     * node's own arguments: the preload, with the request in its URL
     */
    execArgv: string[];
    /**
     * the script, then its arguments
     */
    args: string[];
    env: Record<string, string | undefined>;
    stdio: "inherit" | [number, number, number];
};
export type RunResult = {
    /**
     * the child's exit code; `null` when it never started or ended by signal
     */
    status: number | null;
    signal: string | null;
    /**
     * the spawn's own error
     */
    error: Error | null;
};
import { spawn as nodeSpawn } from 'node:child_process';
