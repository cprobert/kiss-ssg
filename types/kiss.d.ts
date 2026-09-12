export default Kiss;
export type BuildReport = import("./build-report.js").BuildReport;
export type BuildPage = import("./build-report.js").BuildPage;
export type BuildAsset = import("./build-report.js").BuildAsset;
export type BuildReportFailure = import("./build-report.js").BuildReportFailure;
export type BuildPipelineStep = import("./build-report.js").BuildPipelineStep;
export type BuildAikb = import("./build-report.js").BuildAikb;
export type BuildLinks = import("./build-report.js").BuildLinks;
export type BuildBrokenLink = import("./build-report.js").BuildBrokenLink;
export type BuildRedirects = import("./build-report.js").BuildRedirects;
export type SiteMap = import("./aikb.js").SiteMap;
export type PipelineStep = import("./pipeline.js").PipelineStep;
export type KissConfig = import("./config.js").KissConfig;
export type KissConfigInput = import("./config.js").KissConfigInput;
export type KissFolders = import("./config.js").KissFolders;
/**
 * The documented options of one page. Only `view` is required. Any key not
 * listed here is allowed too — `PageOptions` adds an index signature for them —
 * and reaches the template as top-level render context.
 */
export type PageOptionsKnown = {
    /**
     * a `.hbs` filename relative to `config.folders.pages`, or a template string
     */
    view: string;
    /**
     * this page's identity, what `{{link "<id>"}}` resolves. Default: the view's route without its extension (`blog/listing.hbs` → `blog/listing`); on a `.pages()` fan-out the registration's `id` is the *prefix* its items' default ids use (`<prefix>/<slug>`) and a *record*'s own `id` wins outright, the way `aliases` belongs to the record. An inline template and a `generate: false` page have no id
     */
    id?: string;
    /**
     * a `.json` filename, a models folder name, an `http(s)://` URL, a plain object or an array — and the resolved data itself by the time a controller sees it
     */
    model?: any;
    /**
     * a `.js` filename relative to `config.folders.controllers`, or the function itself
     */
    controller?: string | KissController;
    /**
     * filled from `model.title` when the model has one and this is unset
     */
    title?: string;
    description?: string;
    /**
     * output folder, inferred from `view` when omitted
     */
    path?: string;
    /**
     * output filename, inferred from `view` when omitted
     */
    slug?: string;
    /**
     * output extension, default `html`
     */
    ext?: string;
    /**
     * `false` skips building this one page entirely
     */
    generate?: boolean;
    /**
     * per-page config overrides, merged over the site config for this page alone
     */
    config?: KissConfigInput;
    /**
     * keep this page out of `sitemap.xml`
     */
    ignoreSitemap?: boolean;
    /**
     * default `'1.00'`
     */
    sitemapPriority?: string;
    /**
     * omitted from the XML unless set
     */
    sitemapChangefreq?: string;
    /**
     * default: one timestamp shared by every page
     */
    sitemapLastmod?: string;
    /**
     * keep this page out of `llms.txt`
     */
    ignoreLlms?: boolean;
    /**
     * the `llms.txt` section this page is listed under, overriding its path
     */
    llmsSection?: string;
    /**
     * keep this page out of the `.feed()` document
     */
    ignoreFeed?: boolean;
    /**
     * the page's date; `.feed()` orders by it and leaves out a page without one (the field name is `.feed()`'s `dateField`)
     */
    date?: Date | number | string;
    /**
     * old URL paths this page now answers (`['/old-slug']`); each becomes one `301` line in `<build>/_redirects`. On a `.pages()` fan-out it belongs to the *record*, not to the registration
     */
    aliases?: string[];
};
/**
 * The options `.page()` takes: {@link PageOptionsKnown} plus any extra keys of
 * your own, which the page renders with.
 */
export type PageOptions = PageOptionsKnown & Record<string, any>;
/**
 * The options `.pages()` takes. Identical to {@link PageOptions}: the fan-out
 * requirement is that the model *resolves* to an array — a `.json` file or
 * models folder holding one, a URL that returns one, or an array passed
 * directly — which is a property of the resolved data, not of the option.
 */
export type PagesOptions = PageOptions;
/**
 * What a controller returns: any subset of the page's options, merged over
 * them. Returning nothing leaves the options as they were.
 */
export type PageOptionsPatch = Partial<PageOptionsKnown> & Record<string, any>;
/**
 * A page's controller, run once its model has resolved and before the page is
 * prepared. Synchronous: the patch is spread over the options as it is
 * returned, so a promise would be spread rather than awaited. A controller that
 * throws fails that page and makes `complete()` reject.
 */
export type KissController = (options: PageOptions) => PageOptionsPatch | void;
/**
 * One entry of the array `.generate()` and `.complete()` hand back: one
 * resolved model, in registration order. The construction-time asset copy is
 * queued first, so entry 0 is that copy rather than your first page — look
 * models up with `.getModelByID()` instead of by position.
 */
export type BuildDatum = {
    /**
     * the model filename or URL; an object model gets a hash, a page with no model has no id
     */
    id?: string;
    /**
     * the resolved model, or `null` when it failed to resolve
     */
    data: any;
    /**
     * why the model failed to resolve
     */
    error?: Error;
};
export type BuildData = BuildDatum[];
/**
 * One thing that failed to build. `buildTo` is `null` when the failure happened
 * before the page had an output path — a controller, a `.pages()` item, a
 * `generate`/`sitemap` callback, or the dev server.
 */
export type BuildFailure = {
    view: string;
    buildTo: string | null;
    error: Error;
};
/**
 * What `complete()` rejects with when anything failed to build: an
 * `AggregateError` over the underlying errors, carrying the whole list on
 * `failures` and the same build as data on `report`.
 */
export type BuildError = AggregateError & {
    failures: BuildFailure[];
    report: BuildReport;
};
/**
 * One `<url>` of the sitemap, as handed to `.sitemap()`'s callback.
 */
export type SitemapUrl = {
    loc: string;
    lastmod: string;
    priority: string;
    changefreq?: string;
};
export type SitemapOptions = {
    /**
     * default `true`; `false` leaves an existing `sitemap.xml` alone
     */
    overwrite?: boolean;
};
/**
 * The options `.llms()` takes. `title` and `summary` are required — without
 * either, kiss logs an error and writes nothing, exactly as it does for a
 * sitemap with no `siteUrl`.
 */
export type LlmsOptions = {
    /**
     * the site's name — the file's `# ` heading
     */
    title: string;
    /**
     * what the site is, as a `> ` blockquote: the text itself, or a path (relative to `process.cwd()`) to a `.md`/`.txt` file holding it
     */
    summary: string;
    /**
     * a trailing `## Notes` section; same text-or-file rule as `summary`
     */
    notes?: string;
    /**
     * top-level path segment → section heading (`{ courses: 'Courses' }`); the key `root` names the section holding pages with no path (default `Pages`). An unmapped segment is title-cased.
     */
    sections?: Record<string, string>;
    /**
     * default `true`; `false` leaves an existing `llms.txt` alone
     */
    overwrite?: boolean;
};
/**
 * The options `.feed()` takes. `title` is required — without it, kiss logs an
 * error and writes nothing, exactly as it does for a sitemap with no `siteUrl`.
 */
export type FeedOptions = {
    /**
     * the feed's `<title>` — the site's name, or the section's
     */
    title: string;
    /**
     * the feed's `<description>`
     */
    description?: string;
    /**
     * a top-level `path` segment to include (`'blog'`); omit for every page
     */
    section?: string;
    /**
     * default `20`; how many items the feed carries, newest first
     */
    limit?: number;
    /**
     * default `feed.xml`, relative to `config.folders.build`
     */
    filename?: string;
    /**
     * default `'date'`; the page option (or model field) each item's date is read from
     */
    dateField?: string;
    /**
     * default `true`; `false` leaves an existing feed file alone
     */
    overwrite?: boolean;
};
export type WatchOptions = {
    /**
     * the script whose own change triggers a whole-site rebuild; defaults to `process.argv[1]`
     */
    entry?: string;
};
/**
 * A site. Everything is driven from one instance: `.page()`/`.pages()`/`.scan()`
 * queue pages, `.generate()` renders them, `.complete()` resolves once the whole
 * build has settled (and rejects if any part of it failed).
 */
declare class Kiss {
    /**
     * Resolves the config, sets up this instance's Handlebars environment,
     * Markdown renderer and asset manifest, creates the folders, queues the
     * asset copy, registers helpers and partials — and, in `dev` mode, starts the
     * dev server and the file watcher.
     *
     * @param {KissConfigInput} [config]
     * @throws if the config is invalid — see `resolveConfig`
     */
    constructor(config?: KissConfigInput);
    /** @private */
    private _stack;
    /** @private */
    private _promises;
    /** @private */
    private _generating;
    /** @private */
    private _callbacks;
    /** @private */
    private _drainDepth;
    /** @private */
    private _generateRequested;
    /** @private */
    private _registrations;
    /** @private */
    private _scanned;
    /** @private */
    private _scanning;
    /** @private */
    private _scanRequested;
    /** @private */
    private _partialNames;
    /**
     * Which pages rendered which partials, learned from rendering. Read by
     * `_handleChange` to scope a partial edit; cleared by `_replay()`.
     * @type {DependencyGraph} @private
     */
    private _graph;
    /** @private @type {{ byId: Map<string, any>, withdrawn: Map<string, string[]> }|null} */
    private _idIndex;
    /** @private */
    private _idNoticed;
    /** @private */
    private _failures;
    /** @private */
    private _failuresReported;
    /** @private */
    private _replaying;
    /** @private */
    private _unswept;
    /** @private */
    private _rebuildInFlight;
    /** @private */
    private _pendingReplay;
    /** @private */
    private _pendingTargets;
    /** @private */
    private _closing;
    /** @private */
    private _sitemapRequest;
    /** @private */
    private _llmsRequest;
    /** @private */
    private _feedRequest;
    /** @private */
    private _watcher;
    /** @private */
    private _devServer;
    /** @private @type {Promise<any>} */
    private _assetQueue;
    /** @private @type {ReturnType<typeof createPipeline>|null} */
    private _pipeline;
    /** @private @type {import('./pipeline.js').PipelineResult[]} */
    private _pipelineResults;
    /** @private */
    private _stagingDir;
    /** @private */
    private _oldDir;
    /** @private */
    private _buildTarget;
    /** @private */
    private _buildSettled;
    /** @private */
    private _startedAt;
    /** @private */
    private _report;
    /** @private */
    private _sitemapPath;
    /** @private */
    private _llmsPath;
    /** @private */
    private _feedPath;
    /** @private @type {BuildLinks|null} */
    private _links;
    /** @private */
    private _redirectsPath;
    /** @private @type {BuildRedirects|null} */
    private _redirectsResult;
    /** @private */
    private _redirectsRun;
    /** @private */
    private _promotedFrom;
    /** @private */
    private _checkMode;
    /** @type {KissConfig} */
    config: KissConfig;
    logger: any;
    verbose: boolean;
    /**
     * This instance's own Handlebars environment — register your own helpers
     * on it. Helpers registered on the `handlebars` module itself are not seen.
     * @type {typeof Handlebars}
     */
    handlebars: typeof Handlebars;
    /** @private */
    private _assetManifest;
    /**
     * This instance's own Markdown renderer, behind `.md` partials and the
     * `markdown` helper. Typed `any` because `remarkable` ships no types.
     * @type {any}
     */
    remarkable: any;
    /** @private */
    private _setupFolders;
    /** @private */
    private _sweepStaleSiblings;
    /**
     * Re-registers every partial and layout from disk, unregistering any name
     * whose file has since gone. Runs at construction and on every watch rebuild.
     *
     * @returns {string[]} the names now registered
     */
    registerPartials(): string[];
    /** @private */
    private _pipelineEnv;
    /** @private */
    private _queuePipeline;
    /**
     * Compiles every `*.scss`/`*.sass` under `sourceDir` to a sibling `.css` and
     * copies everything else straight through. Runs once at construction for
     * `folders.assets` → `folders.build`; call it again for extra asset
     * directories. Calls run one after another, in registration order.
     *
     * @param {string} sourceDir
     * @param {string} targetDir
     * @returns {this}
     */
    copyAssets(sourceDir: string, targetDir: string): this;
    /** @private */
    private _stagedPath;
    /** @private */
    private _reportedPath;
    /** @private */
    private _promote;
    /** @private */
    private _finishBuild;
    /** @private */
    private _buildAikb;
    /** @private */
    private _checkLinks;
    /** @private */
    private _writeRedirects;
    /** @private */
    private _lastBuildRecord;
    /** @private */
    private _redirectFindings;
    /** @private */
    private _discardStaging;
    /**
     * @private
     * @param {any} options
     * @param {any} [origin]
     * @param {string|null} [idPrefix] given only by `_prepareMultiplePages`: what
     * this fan-out's items prefix their default ids with, in place of the view
     * route. Its presence is also what tells a fan-out item from a `.page()` page.
     */
    private _preparePage;
    /** @private */
    private _idIndexFor;
    /**
     * @private
     * @param {string} id
     * @returns {{ entry: any }|{ withdrawn: true, views: string[] }|null}
     */
    private _lookupPage;
    /** @private */
    private _stackForRecord;
    /** @private */
    private _prepareMultiplePages;
    /**
     * Queues one page. Nothing is rendered until `.generate()`.
     *
     * @param {PageOptions} options `options.view` is required
     * @returns {this}
     */
    page(options: PageOptions): this;
    /**
     * Queues one page per item of an array model, appending `-N` to the slug
     * unless the controller sets one. A bad item fails only its own page.
     *
     * @param {PagesOptions} options
     * @returns {this}
     */
    pages(options: PagesOptions): this;
    /**
     * Queues every `.hbs` under `config.folders.pages` not already registered by
     * `view`, with default options. Repeated on every whole-site watch rebuild,
     * so page files added or deleted mid-session are picked up.
     *
     * @returns {this}
     */
    scan(): this;
    /**
     * Logs the queued-promise and prepared-page counts, and — with
     * `verbose: true` — writes `debug.json` into the build folder.
     *
     * @returns {this}
     */
    viewStats(): this;
    /** @private */
    private _drain;
    /** @private */
    private _generatePending;
    /** @private */
    private _settle;
    /** @private */
    private _runCallback;
    /**
     * Renders and writes every queued page exactly once, then fires `callback`.
     * Page failures do not surface here — they surface from `.complete()`.
     *
     * @param {(data: BuildData) => void|Promise<void>} [callback] fires once every
     * page has been attempted; a throw (or a rejection) in it is a build failure
     * of its own, reported by `.complete()` as `<generate callback>`
     * @returns {this}
     */
    generate(callback?: (data: BuildData) => void | Promise<void>): this;
    /**
     * Awaits the whole build — every queued page, anything a callback queued, any
     * `.sitemap()` — rendering whatever no `.generate()` pass reached. Under
     * `cleanBuild: 'atomic'` this is the moment the staged build is promoted.
     *
     * @param {(data: BuildData) => void} [callback] never fired for a failed build
     * @returns {Promise<BuildData>} one entry per queued model, in registration order
     * @throws {BuildError} rejects — once per build — if any page, controller or
     * callback failed; `err.failures` is the whole list
     */
    complete(callback?: (data: BuildData) => void): Promise<BuildData>;
    /**
     * The last settled build, as data: what `.complete()` resolved or rejected
     * with, in a JSON-safe shape a script can act on. `null` until the first
     * `.complete()` has settled; a watch rebuild replaces it with its own. The
     * same object is on the rejection as `err.report`.
     *
     * @returns {BuildReport|null}
     */
    report(): BuildReport | null;
    /**
     * Writes `sitemap.xml` into the build folder, one `<url>` per registered page.
     * Requires `config.siteUrl` — without it this logs an error and skips.
     *
     * @param {SitemapOptions|null} [options]
     * @param {(urls: SitemapUrl[]) => void|Promise<void>} [callback] not fired
     * when the sitemap was skipped for want of a `siteUrl`
     * @returns {this}
     */
    sitemap(options?: SitemapOptions | null, callback?: (urls: SitemapUrl[]) => void | Promise<void>): this;
    /**
     * Writes `llms.txt` into the build folder — the llmstxt.org index an answer
     * engine reads first — from the same registry, titles and URLs the sitemap is
     * built from, so the two can never disagree. Requires `config.siteUrl`, and
     * `options.title`/`options.summary`; without any of them this logs an error
     * and skips. Like `.sitemap()`, it can be called before or after
     * `.generate()`, and it is re-run by a whole-site watch rebuild.
     *
     * @param {LlmsOptions} options
     * @param {(text: string) => void|Promise<void>} [callback] receives the
     * rendered file; not fired when llms.txt was skipped for want of an option
     * @returns {this}
     */
    llms(options: LlmsOptions, callback?: (text: string) => void | Promise<void>): this;
    /**
     * Writes an RSS 2.0 feed into the build folder — the third file derived from
     * the same registry as `sitemap.xml` and `llms.txt`, so an item can never
     * name a URL the site does not serve. One `<item>` per page that carries a
     * date, newest first. Requires `config.siteUrl` and `options.title`; without
     * either this logs an error and skips. Like `.sitemap()` and `.llms()`, it
     * can be called before or after `.generate()`, and it is re-run by a
     * whole-site watch rebuild.
     *
     * @param {FeedOptions} options
     * @param {(text: string) => void|Promise<void>} [callback] receives the
     * rendered document; not fired when the feed was skipped for want of an option
     * @returns {this}
     */
    feed(options: FeedOptions, callback?: (text: string) => void | Promise<void>): this;
    /**
     * Pulls one resolved model out of the array `.generate()`/`.complete()` hand
     * back — the way to read a model without relying on its position.
     *
     * @param {string} id the model filename or URL you passed
     * @param {BuildData} data
     * @returns {any} the resolved model, or `{ error }` if there is no such id
     */
    getModelByID(id: string, data: BuildData): any;
    /** @private */
    private _replay;
    /** @private */
    private _requestReplay;
    /** @private */
    private _requestRebuild;
    /** @private */
    private _runRebuildQueue;
    /** @private */
    private _rebuild;
    /** @private */
    private _handleChange;
    /**
     * Starts the file watcher (once). Only meaningful with `dev: true`, which
     * also starts the dev server. Started for you in dev mode.
     *
     * @param {WatchOptions} [options]
     * @returns {this}
     */
    watch({ entry }?: WatchOptions): this;
    /** @private */
    private _builtAssetPath;
    /** @private */
    private _reload;
    /**
     * Stops the watcher and dev server, and removes an un-promoted staging
     * folder. Resolves once any in-flight rebuild has finished, so nothing is
     * written after it. A closed instance stays closed.
     *
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
}
import utils from './utils.js';
import Handlebars from 'handlebars';
export { Kiss as 'module.exports', utils };
