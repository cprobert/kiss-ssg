/**
 * Assembles the report for one settled build. Key order is fixed: the report is
 * read as text as often as it is read as data.
 *
 * @param {Object} input
 * @param {{ view: string, buildTo: string|null }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
 * @returns {BuildReport}
 */
export function buildReport({ stack, failures, manifest, buildDir, stagingDir, mode, startedAt, sitemap, pipeline, }: {
    stack?: {
        view: string;
        buildTo: string | null;
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
};
