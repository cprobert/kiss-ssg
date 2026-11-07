/**
 * The program a command runs: its first token, whole when it is quoted
 * (`"C:\Program Files\nodejs\node.exe" -e …` is one program, not two words).
 * The one thing of a command kiss prints or records (`lib/aikb.js`): the
 * rest is its arguments, which is where a token typed into a command sits.
 *
 * @param {unknown} run the command, as the author wrote it
 * @returns {string} the program, or `''` for an empty command
 */
export function programOf(run: unknown): string;
/**
 * The name a step is logged and reported under: its own `name`, or the
 * program its command runs (`npx`, `node`, `sass`), which is what an operator
 * reading a log would call it anyway.
 *
 * @param {PipelineStep} step
 * @returns {string}
 */
export function stepName(step: PipelineStep): string;
/**
 * The pipeline of one `Kiss` instance: the steps it runs before every asset
 * copy, and the watch processes it keeps for the session.
 *
 * @param {Object} options
 * @param {PipelineStep[]} [options.steps] `config.assets.pipeline`
 * @param {any} options.logger the injected logger
 * @param {boolean} [options.dev] `config.dev` — the only mode that starts watch processes
 * @returns {{
 *   run: (env?: Record<string, string>) => Promise<PipelineResult[]>,
 *   close: () => Promise<void>,
 *   watching: () => string[],
 * }}
 */
export function createPipeline({ steps, logger, dev }: {
    steps?: PipelineStep[];
    logger: any;
    dev?: boolean;
}): {
    run: (env?: Record<string, string>) => Promise<PipelineResult[]>;
    close: () => Promise<void>;
    watching: () => string[];
};
/**
 * One step of `config.assets.pipeline`.
 */
export type PipelineStep = {
    /**
     * used in logs and in the `<pipeline: name>` failure; defaults to the first word of `run`
     */
    name?: string;
    /**
     * the shell command run before the asset copy, in order, awaited
     */
    run: string;
    /**
     * a long-lived command started once in `dev` mode, after `run` succeeded
     */
    watch?: string;
    /**
     * the folder both commands run in; defaults to `process.cwd()`
     */
    cwd?: string;
    /**
     * the files `run` writes into the build folder, build-relative; kiss deletes each before the step and claims it after (`AIKB/kiss.md`)
     */
    outputs?: string[];
};
/**
 * What one step did. `error` is present exactly when `ok` is `false`.
 */
export type PipelineResult = {
    name: string;
    ok: boolean;
    /**
     * ms the step's `run` took
     */
    duration: number;
    error?: Error;
};
