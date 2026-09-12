/**
 * Whether this site has ever been recorded — the opt-in test, and the reason
 * an ordinary build of a site that has a knowledge base still reports on it.
 *
 * `site-map.json` is the marker rather than the folder itself, because only a
 * record ever writes that file: a repository whose `AIKB/` holds hand-written
 * module notes (this one's does) has not opted in, and a build of the docs site
 * inside it must not start claiming it has. Synchronous and side-effect-free —
 * it is one `stat` on the way to assembling the report.
 *
 * @param {string|null|undefined} folder `config.folders.aikb`
 * @returns {boolean}
 */
export function isRecorded(folder: string | null | undefined): boolean;
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
 * @param {(kind: string, id: string) => Buffer|string|null} [input.readSubject] the bytes a subject's hash is taken over; defaults to reading the controller file off disk
 * @returns {SiteMap}
 */
export function buildSiteMap({ stack, graph, config, pipeline, buildDir, stagingDir, readSubject, }: {
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
    readSubject?: (kind: string, id: string) => Buffer | string | null;
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
 * The `---` block at the top of a note: one `key: value` per line, which is
 * all a stamp ever is. Deliberately **not** a YAML parser — the same handful
 * of lines `test/unit/plugin-manifests.test.js` reads out of a `SKILL.md`
 * header, and nothing more. A note with no block, or a block that says
 * nothing, is not an error: it is simply an unstamped note.
 *
 * @param {string} text the note's whole text
 * @returns {Record<string, string>|null} `null` when there is no block at all
 */
export function readFrontmatter(text: string): Record<string, string> | null;
/**
 * The four note rules, evaluated against a folder on disk. **missing** is a
 * subject in the map with no note; **dead** is a note whose subject is not in
 * the map — a controller that was deleted, an API that is no longer called;
 * **stale** is a note stamped with a subject hash that is no longer the
 * subject's hash, which is the note whose subject changed underneath it; and
 * **dangling** is a note citing a file that resolves to nothing. None of the
 * four is a build failure: they are findings, reported on the build report and
 * read back by whoever is closing a piece of work.
 *
 * The two new ones are mechanical on purpose. "Is this note still true?" is a
 * question only a person can answer; "was this note written against a
 * different controller?" and "does this path exist?" are questions a build can
 * answer for free, every time, and they are the two ways a note rots quietly.
 *
 * @param {SiteMap} map
 * @param {string} notesDir the `notes` folder, as a path from the cwd
 * @param {Object} [options]
 * @param {string|null} [options.aikbDir] the knowledge base's folder — `site.md` is scanned for dangling references too, and paths under the folder always resolve
 * @returns {{ missing: string[], dead: string[], stale: string[], dangling: string[] }} all four sorted
 */
export function evaluateNotes(map: SiteMap, notesDir: string, { aikbDir }?: {
    aikbDir?: string | null;
}): {
    missing: string[];
    dead: string[];
    stale: string[];
    dangling: string[];
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
 * Evaluates the note rules and, when this build is a record, writes the
 * generated half of the folder. A failure to write is logged and reported as
 * `written: false` — never a build failure. The site the author asked for is
 * still the site they get, minus its map.
 *
 * @param {Object} input
 * @param {SiteMap} input.map
 * @param {string} input.folder the AIKB folder, as a path from the cwd
 * @param {any} input.logger
 * @param {boolean} [input.write] `false` on an ordinary build: evaluate, write nothing
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
 * A subject as the map records it: what it is, where its note goes, and what
 * the subject looked like when this build ran.
 */
export type SiteMapSubject = {
    /**
     * the folder its note lives in
     */
    kind: "controllers" | "models" | "pipeline";
    /**
     * the controller filename, the model URL, or the step name
     */
    id: string;
    /**
     * the note's path, relative to the AIKB folder
     */
    note: string;
    /**
     * sha1 hex of what the subject *is* — the controller file's bytes, or the step's command — and `null` when there is nothing to hash (a URL model) or nothing to read (a controller file that is not there)
     */
    hash: string | null;
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
    /**
     * every thing that wants a note, sorted as `noteSubjects` sorts
     */
    subjects: SiteMapSubject[];
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
     * `false` on every build but a passing `KISS_AIKB` record, and when a write failed
     */
    written: boolean;
    /**
     * all four sorted
     */
    notes: {
        missing: string[];
        dead: string[];
        stale: string[];
        dangling: string[];
    };
    /**
     * the map's subject rows, so the hash to stamp a note with is on the report of the build that found the finding
     */
    subjects: SiteMapSubject[];
};
