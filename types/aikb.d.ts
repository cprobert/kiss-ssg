/**
 * How a page's model was written in the `.page()` call that registered it —
 * not what it resolved to. By the time a page is on the stack `options.model`
 * has been replaced by the resolved data, so a map built from the stack alone
 * would say `inline` for every page in the site.
 *
 * @param {unknown} model the *registered* model option
 * @returns {string} `file:<name>`, `folder:<name>`, `url:<url>`, `inline` or `none`
 */
export function classifyModel(model: unknown): string;
/**
 * How a page's controller was written in the `.page()` call that registered it.
 *
 * @param {unknown} controller the *registered* controller option
 * @returns {string} `file:<name>`, `inline` or `none`
 */
export function classifyController(controller: unknown): string;
/**
 * The pair of classifications one page contributes, captured while the
 * registered options are still the registered options.
 *
 * @param {Record<string, any>} [options]
 * @returns {{ model: string, controller: string }}
 */
export function pageOrigin(options?: Record<string, any>): {
    model: string;
    controller: string;
};
/**
 * Builds the map for one settled build. Every list is sorted and nothing here
 * reads a clock: two identical builds produce the same object.
 *
 * @param {Object} input
 * @param {{ view: string, buildTo: string|null, origin?: { model: string, controller: string } }[]} [input.stack] the prepared pages
 * @param {import('./dependency-graph.js').DependencyGraph|null} [input.graph] filled by rendering, so this only works on a settled build
 * @param {any} input.config the resolved config
 * @param {import('./pipeline.js').PipelineStep[]} [input.pipeline] defaults to `config.assets.pipeline`
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling paths are reported against, if there was one
 * @returns {SiteMap}
 */
export function buildSiteMap({ stack, graph, config, pipeline, buildDir, stagingDir, }: {
    stack?: {
        view: string;
        buildTo: string | null;
        origin?: {
            model: string;
            controller: string;
        };
    }[];
    graph?: import("./dependency-graph.js").DependencyGraph | null;
    config: any;
    pipeline?: import("./pipeline.js").PipelineStep[];
    buildDir: string;
    stagingDir?: string | null;
}): SiteMap;
/**
 * Every subject in the map that carries judgement, sorted. A subject is a
 * controller **file**, a **URL** model or a **pipeline step**: the three things
 * a build can point at but never explain. Plain pages, partials and JSON
 * models are deliberately not subjects — a note saying "renders the about
 * page" is noise, and a rule that demands one teaches people to write noise.
 *
 * @param {SiteMap} map
 * @returns {NoteSubject[]}
 */
export function noteSubjects(map: SiteMap): NoteSubject[];
/**
 * Where a subject's note lives — a mechanical derivation from the subject's
 * id, so a person can work out the path without running anything:
 * `stockist.js` → `notes/controllers/stockist.md`,
 * `https://api.example.com/v2/events?x=1` → `notes/models/api.example.com-v2-events.md`,
 * `tailwind` → `notes/pipeline/tailwind.md`.
 *
 * @param {NoteSubject} subject
 * @param {string} [notesDir] defaults to `notes` — the path relative to the AIKB folder
 * @returns {string}
 */
export function notePathFor(subject: NoteSubject, notesDir?: string): string;
/**
 * The two note rules, evaluated against a folder on disk. **missing** is a
 * subject in the map with no note; **dead** is a note whose subject is not in
 * the map — a controller that was deleted, an API that is no longer called.
 * Neither is a build failure: they are findings, reported on the build report
 * and read back by whoever is closing a piece of work.
 *
 * @param {SiteMap} map
 * @param {string} notesDir the `notes` folder, as a path from the cwd
 * @returns {{ missing: string[], dead: string[] }} both sorted
 */
export function evaluateNotes(map: SiteMap, notesDir: string): {
    missing: string[];
    dead: string[];
};
/**
 * The human half of the map: the same data as `site-map.json`, as markdown a
 * person can read in a pull request. Deterministic — no clock, every list
 * already sorted by `buildSiteMap`.
 *
 * @param {SiteMap} map
 * @returns {string} the file's text, one trailing newline
 */
export function renderSiteMap(map: SiteMap): string;
/**
 * The one file the engine writes and then never touches again. Written for a
 * person who has just found the folder and does not know what it is, so it
 * says which files are machine-owned, what a note is for and where one goes.
 * Its tables go through the same renderer the map's do, so the file it writes
 * needs no reformatting in the repository it is committed to.
 *
 * @returns {string} the file's text, one trailing newline
 */
export function renderAikbReadme(): string;
/**
 * Evaluates the note rules and, unless this is a check, writes the generated
 * half of the folder. A failure to write is logged and reported as
 * `written: false` — never a build failure. The site the author asked for is
 * still the site they get, minus its map.
 *
 * @param {Object} input
 * @param {SiteMap} input.map
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {any} input.logger
 * @param {boolean} [input.write] `false` under check mode: evaluate, write nothing
 * @returns {Promise<AikbResult>}
 */
export function writeAikb({ map, folder, logger, write }: {
    map: SiteMap;
    folder: string;
    logger: any;
    write?: boolean;
}): Promise<AikbResult>;
/**
 * The report as `last-build.json` keeps it: every timing dropped, so two
 * identical builds write the same bytes and git only ever shows a real change.
 * Key order is otherwise the report's own.
 *
 * @param {import('./build-report.js').BuildReport} report
 * @returns {Record<string, any>}
 */
export function lastBuildRecord(report: import("./build-report.js").BuildReport): Record<string, any>;
/**
 * Writes `last-build.json`. Separate from `writeAikb` because it needs the
 * finished report, and the report needs `writeAikb`'s verdict — the map is
 * evaluated first so the report can carry it, and the report is written second.
 *
 * @param {Object} input
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {import('./build-report.js').BuildReport} input.report
 * @param {any} input.logger
 * @returns {Promise<boolean>} whether the file was written
 */
export function writeLastBuild({ folder, report, logger }: {
    folder: string;
    report: import("./build-report.js").BuildReport;
    logger: any;
}): Promise<boolean>;
/**
 * One page as the map records it.
 */
export type SiteMapPage = {
    /**
     * the file it writes, against the real build folder
     */
    buildTo: string | null;
    /**
     * the `.hbs` filename — an inline template is elided to its first line
     */
    view: string;
    /**
     * `file:<name>`, `folder:<name>`, `url:<url>`, `inline` or `none`
     */
    model: string;
    /**
     * `file:<name>`, `inline` or `none`
     */
    controller: string;
    /**
     * the partials and layouts this page actually rendered, sorted
     */
    partials: string[];
};
/**
 * A model or controller and the pages that used it.
 */
export type SiteMapSource = {
    /**
     * the same classification a page row carries
     */
    source: string;
    /**
     * the output paths that used it, sorted
     */
    pages: string[];
};
/**
 * One `config.assets.pipeline` step, as the map records it.
 */
export type SiteMapPipelineStep = {
    /**
     * the step's `name`, or the first word of its `run`
     */
    name: string;
    /**
     * the command
     */
    run: string;
};
/**
 * Where the site is read from and written to.
 */
export type SiteMapSite = {
    /**
     * `config.siteUrl`, or `null` when unset
     */
    siteUrl: string | null;
    /**
     * the real build folder, never the staging sibling
     */
    build: string;
    /**
     * every `config.folders` key but `build`, sorted
     */
    folders: Record<string, string | null>;
};
/**
 * The whole map: what one settled build knew about the shape of its site.
 */
export type SiteMap = {
    site: SiteMapSite;
    /**
     * sorted by output path
     */
    pages: SiteMapPage[];
    /**
     * partial name → the pages that rendered it
     */
    partials: Record<string, string[]>;
    /**
     * sorted by source
     */
    models: SiteMapSource[];
    /**
     * sorted by source
     */
    controllers: SiteMapSource[];
    /**
     * in the order the steps run
     */
    pipeline: SiteMapPipelineStep[];
};
/**
 * A thing with judgement in it, which therefore wants a note.
 */
export type NoteSubject = {
    /**
     * the folder its note lives in
     */
    kind: "controllers" | "models" | "pipeline";
    /**
     * the controller filename, the model URL, or the step name
     */
    id: string;
};
/**
 * What the build report carries under `aikb`.
 */
export type AikbResult = {
    /**
     * the AIKB folder, as configured
     */
    folder: string;
    /**
     * `false` under check mode, and when a write failed
     */
    written: boolean;
    /**
     * both sorted
     */
    notes: {
        missing: string[];
        dead: string[];
    };
};
