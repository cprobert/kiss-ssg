/**
 * One page the build queued.
 *
 * @typedef {Object} BuildPage
 * @property {string} view the `.hbs` filename — an inline template is elided to its first line
 * @property {string|null} buildTo the file it writes, against the real build folder
 * @property {boolean} ok `false` when a failure names this output path
 * @property {string|null} hash sha1 of the bytes written, or `null` when nothing was
 */
/**
 * One file `.copyAssets()` put in the build, as the asset manifest records it.
 *
 * @typedef {Object} BuildAsset
 * @property {string} source the build-relative path a template asks for (`css/site.css`)
 * @property {string} target the file that is actually there (`css/site.a1b2c3d4.css`)
 */
/**
 * One thing that failed to build. The same entry as {@link BuildFailure} with
 * the `Error` reduced to its message — the object itself stays on the
 * `AggregateError` `complete()` rejects with, so this stays serialisable.
 *
 * @typedef {Object} BuildReportFailure
 * @property {string} view
 * @property {string|null} buildTo `null` when the failure happened before the page had an output path
 * @property {string} message
 */
/**
 * One `config.assets.pipeline` step this build ran, as the report carries it:
 * the step's `Error` is left behind on the failure entry that names it.
 *
 * @typedef {Object} BuildPipelineStep
 * @property {string} name the step's `name`, or the first word of its `run`
 * @property {boolean} ok the command exited 0
 * @property {number} duration ms the command took
 */
/**
 * What `.aikb()` did on this build, as the report carries it: where the site's
 * knowledge base lives, whether this build actually wrote it (a check computes
 * the map and writes nothing), and the two note findings.
 *
 * @typedef {Object} BuildAikb
 * @property {string} folder the AIKB folder, as configured
 * @property {boolean} written `false` under check mode, and when a write failed
 * @property {{ missing: string[], dead: string[] }} notes paths, both sorted
 */
/**
 * What `.report()` returns and `KISS_REPORT` writes: one settled build, in a
 * shape a script can act on without parsing log output.
 *
 * @typedef {Object} BuildReport
 * @property {boolean} ok nothing failed
 * @property {'build'|'check'} mode `'check'` when the build was staged and discarded rather than published
 * @property {string} buildDir the folder the site was built for — never the staging sibling
 * @property {number} duration ms from `new Kiss()` to the settled build
 * @property {BuildPage[]} pages every queued page, in registration order
 * @property {BuildReportFailure[]} failures
 * @property {BuildAsset[]} assets
 * @property {string|null} sitemap the `sitemap.xml` written, or `null` if none was
 * @property {BuildPipelineStep[]} pipeline every `config.assets.pipeline` step, in order; empty when there are none
 * @property {string|null} llms the `llms.txt` written, or `null` if none was
 * @property {BuildAikb|null} aikb what `.aikb()` wrote, or `null` when it was never called
 */
/**
 * @param {string|null|undefined} target
 * @param {string} buildDir
 * @param {string|null} [stagingDir]
 * @returns {string|null}
 */
export function reportedPath(target: string | null | undefined, buildDir: string, stagingDir?: string | null): string | null;
/**
 * @param {string} view
 * @returns {string}
 */
export function reportedView(view: string): string;
/**
 * Assembles the report for one settled build. Key order is fixed: the report is
 * read as text as often as it is read as data.
 *
 * @param {Object} input
 * @param {{ view: string, buildTo: string|null, page?: { hash?: string|null } }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
 * @param {string|null} [input.llms] the llms.txt written by this build
 * @param {BuildAikb|null} [input.aikb] what `.aikb()` wrote, `null` when it was never called
 * @returns {BuildReport}
 */
export function buildReport({ stack, failures, manifest, buildDir, stagingDir, mode, startedAt, sitemap, pipeline, llms, aikb, }: {
    stack?: {
        view: string;
        buildTo: string | null;
        page?: {
            hash?: string | null;
        };
    }[];
    failures?: import("./kiss.js").BuildFailure[];
    manifest?: {
        toObject: () => Record<string, string>;
    } | null;
    buildDir: string;
    stagingDir?: string | null;
    mode?: "build" | "check";
    startedAt?: number;
    sitemap?: string | null;
    pipeline?: import("./pipeline.js").PipelineResult[];
    llms?: string | null;
    aikb?: BuildAikb | null;
}): BuildReport;
/**
 * The one-line human rendering of a report, plus one line per failure — what
 * `kiss-ssg check --summary` prints in place of the JSON.
 *
 * @param {BuildReport} report
 * @returns {string}
 */
export function formatReport(report: BuildReport): string;
/**
 * One page the build queued.
 */
export type BuildPage = {
    /**
     * the `.hbs` filename — an inline template is elided to its first line
     */
    view: string;
    /**
     * the file it writes, against the real build folder
     */
    buildTo: string | null;
    /**
     * `false` when a failure names this output path
     */
    ok: boolean;
    /**
     * sha1 of the bytes written, or `null` when nothing was
     */
    hash: string | null;
};
/**
 * One file `.copyAssets()` put in the build, as the asset manifest records it.
 */
export type BuildAsset = {
    /**
     * the build-relative path a template asks for (`css/site.css`)
     */
    source: string;
    /**
     * the file that is actually there (`css/site.a1b2c3d4.css`)
     */
    target: string;
};
/**
 * One thing that failed to build. The same entry as {@link BuildFailure} with
 * the `Error` reduced to its message — the object itself stays on the
 * `AggregateError` `complete()` rejects with, so this stays serialisable.
 */
export type BuildReportFailure = {
    view: string;
    /**
     * `null` when the failure happened before the page had an output path
     */
    buildTo: string | null;
    message: string;
};
/**
 * One `config.assets.pipeline` step this build ran, as the report carries it:
 * the step's `Error` is left behind on the failure entry that names it.
 */
export type BuildPipelineStep = {
    /**
     * the step's `name`, or the first word of its `run`
     */
    name: string;
    /**
     * the command exited 0
     */
    ok: boolean;
    /**
     * ms the command took
     */
    duration: number;
};
/**
 * What `.aikb()` did on this build, as the report carries it: where the site's
 * knowledge base lives, whether this build actually wrote it (a check computes
 * the map and writes nothing), and the two note findings.
 */
export type BuildAikb = {
    /**
     * the AIKB folder, as configured
     */
    folder: string;
    /**
     * `false` under check mode, and when a write failed
     */
    written: boolean;
    /**
     * paths, both sorted
     */
    notes: {
        missing: string[];
        dead: string[];
    };
};
/**
 * What `.report()` returns and `KISS_REPORT` writes: one settled build, in a
 * shape a script can act on without parsing log output.
 */
export type BuildReport = {
    /**
     * nothing failed
     */
    ok: boolean;
    /**
     * `'check'` when the build was staged and discarded rather than published
     */
    mode: "build" | "check";
    /**
     * the folder the site was built for — never the staging sibling
     */
    buildDir: string;
    /**
     * ms from `new Kiss()` to the settled build
     */
    duration: number;
    /**
     * every queued page, in registration order
     */
    pages: BuildPage[];
    failures: BuildReportFailure[];
    assets: BuildAsset[];
    /**
     * the `sitemap.xml` written, or `null` if none was
     */
    sitemap: string | null;
    /**
     * every `config.assets.pipeline` step, in order; empty when there are none
     */
    pipeline: BuildPipelineStep[];
    /**
     * the `llms.txt` written, or `null` if none was
     */
    llms: string | null;
    /**
     * what `.aikb()` wrote, or `null` when it was never called
     */
    aikb: BuildAikb | null;
};
