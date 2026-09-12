/**
 * One page the build queued.
 *
 * @typedef {Object} BuildPage
 * @property {string} view the `.hbs` filename — an inline template is elided to its first line
 * @property {string|null} buildTo the file it writes, against the real build folder
 * @property {boolean} ok `false` when a failure names this output path
 * @property {string|null} hash sha1 of the bytes written, or `null` when nothing was
 * @property {string|null} id the page's identity, what `{{link "<id>"}}` resolves — `null` for an inline template, a `generate: false` page, and a default id two pages arrived at (which no page claims)
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
 * What this build did about the site's knowledge base, as the report carries
 * it: where that knowledge base lives, whether this build actually wrote it
 * (only a passing `KISS_AIKB` record does), the four note findings, and the
 * subjects those findings are about.
 *
 * @typedef {Object} BuildAikb
 * @property {string} folder the AIKB folder, as configured
 * @property {boolean} written `false` under check mode, and when a write failed
 * @property {{ missing: string[], dead: string[], stale: string[], dangling: string[] }} notes all four sorted; `missing`, `dead` and `stale` are note paths, `dangling` is `<note path>: <token>`
 * @property {import('./aikb.js').SiteMapSubject[]} subjects `{ kind, id, note, hash }` per subject of *this* build — the hash to stamp a note with, which `site-map.json` cannot yet carry because it still describes the last record
 */
/**
 * One internal reference in a written page that resolves to nothing: no file
 * under the build folder, no page the build queued, no asset the manifest
 * emitted.
 *
 * @typedef {Object} BuildBrokenLink
 * @property {string} page the page holding the reference, against the real build folder
 * @property {string} href the reference exactly as the page wrote it
 */
/**
 * What the broken-internal-link scan found. `null` on the report when no scan
 * ran — a dev build, a watch rebuild (a scoped re-render has not rewritten
 * every page) or `config.links.check: false`.
 *
 * @typedef {Object} BuildLinks
 * @property {number} checked internal references resolved
 * @property {BuildBrokenLink[]} broken sorted by page, then href
 */
/**
 * What the build did about page `aliases`: the redirects file it wrote, and the
 * two advisory findings about what a rename left behind. `null` on the report
 * when no page has an alias and neither finding fired.
 *
 * @typedef {Object} BuildRedirects
 * @property {string|null} file the `_redirects` written, against the real build folder, or `null` when no page has an alias
 * @property {number} aliases alias paths written into that file
 * @property {string[]} removed sorted; pages in the last record that this build does not build and no alias covers
 * @property {string[]} collisions sorted; aliases equal to a path this build actually writes
 * @property {{ id: string, from: string, to: string }[]} moved sorted by `from`; pages the last record and this build share an `id` with, whose path changed and whose old path no alias covers
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
 * @property {BuildAikb|null} aikb the site's knowledge base, or `null` when there is none to report on
 * @property {BuildLinks|null} links the broken-internal-link scan, or `null` when this build ran none
 * @property {BuildRedirects|null} redirects the redirects file and the two rename findings, or `null` when there is nothing to say
 * @property {string|null} feed the feed file written, or `null` if none was
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
 * @param {{ view: string, buildTo: string|null, id?: string|null, page?: { hash?: string|null } }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
 * @param {string|null} [input.llms] the llms.txt written by this build
 * @param {BuildAikb|null} [input.aikb] the site's knowledge base, `null` when there is none to report on
 * @param {BuildLinks|null} [input.links] what the broken-internal-link scan found, `null` when none ran
 * @param {BuildRedirects|null} [input.redirects] what the build did about page `aliases`, `null` when there is nothing to say
 * @param {string|null} [input.feed] the feed file written by this build
 * @returns {BuildReport}
 */
export function buildReport({ stack, failures, manifest, buildDir, stagingDir, mode, startedAt, sitemap, pipeline, llms, aikb, links, redirects, feed, }: {
    stack?: {
        view: string;
        buildTo: string | null;
        id?: string | null;
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
    links?: BuildLinks | null;
    redirects?: BuildRedirects | null;
    feed?: string | null;
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
    /**
     * the page's identity, what `{{link "<id>"}}` resolves — `null` for an inline template, a `generate: false` page, and a default id two pages arrived at (which no page claims)
     */
    id: string | null;
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
 * What this build did about the site's knowledge base, as the report carries
 * it: where that knowledge base lives, whether this build actually wrote it
 * (only a passing `KISS_AIKB` record does), the four note findings, and the
 * subjects those findings are about.
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
     * all four sorted; `missing`, `dead` and `stale` are note paths, `dangling` is `<note path>: <token>`
     */
    notes: {
        missing: string[];
        dead: string[];
        stale: string[];
        dangling: string[];
    };
    /**
     * `{ kind, id, note, hash }` per subject of *this* build — the hash to stamp a note with, which `site-map.json` cannot yet carry because it still describes the last record
     */
    subjects: import("./aikb.js").SiteMapSubject[];
};
/**
 * One internal reference in a written page that resolves to nothing: no file
 * under the build folder, no page the build queued, no asset the manifest
 * emitted.
 */
export type BuildBrokenLink = {
    /**
     * the page holding the reference, against the real build folder
     */
    page: string;
    /**
     * the reference exactly as the page wrote it
     */
    href: string;
};
/**
 * What the broken-internal-link scan found. `null` on the report when no scan
 * ran — a dev build, a watch rebuild (a scoped re-render has not rewritten
 * every page) or `config.links.check: false`.
 */
export type BuildLinks = {
    /**
     * internal references resolved
     */
    checked: number;
    /**
     * sorted by page, then href
     */
    broken: BuildBrokenLink[];
};
/**
 * What the build did about page `aliases`: the redirects file it wrote, and the
 * two advisory findings about what a rename left behind. `null` on the report
 * when no page has an alias and neither finding fired.
 */
export type BuildRedirects = {
    /**
     * the `_redirects` written, against the real build folder, or `null` when no page has an alias
     */
    file: string | null;
    /**
     * alias paths written into that file
     */
    aliases: number;
    /**
     * sorted; pages in the last record that this build does not build and no alias covers
     */
    removed: string[];
    /**
     * sorted; aliases equal to a path this build actually writes
     */
    collisions: string[];
    /**
     * sorted by `from`; pages the last record and this build share an `id` with, whose path changed and whose old path no alias covers
     */
    moved: {
        id: string;
        from: string;
        to: string;
    }[];
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
     * the site's knowledge base, or `null` when there is none to report on
     */
    aikb: BuildAikb | null;
    /**
     * the broken-internal-link scan, or `null` when this build ran none
     */
    links: BuildLinks | null;
    /**
     * the redirects file and the two rename findings, or `null` when there is nothing to say
     */
    redirects: BuildRedirects | null;
    /**
     * the feed file written, or `null` if none was
     */
    feed: string | null;
};
