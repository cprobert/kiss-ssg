export default Kiss;
export type BuildReport = import("./build-report.js").BuildReport;
export type BuildPage = import("./build-report.js").BuildPage;
export type BuildAsset = import("./build-report.js").BuildAsset;
export type BuildReportFailure = import("./build-report.js").BuildReportFailure;
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
    private _watcher;
    /** @private */
    private _devServer;
    /** @private @type {Promise<any>} */
    private _assetQueue;
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
    private _discardStaging;
    /** @private */
    private _preparePage;
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
