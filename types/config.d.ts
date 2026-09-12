/**
 * @param {KissFoldersInput} [userFolders]
 * @returns {KissFolders} every folder key present and path-normalised
 */
export function resolveFolders(userFolders?: KissFoldersInput): KissFolders;
/**
 * @param {KissConfigInput} [userConfig]
 * @returns {KissConfig} the defaults with `userConfig` merged over them
 * @throws if `cleanBuild` is not `true`, `false` or `'atomic'`, if
 * `assets.pipeline` is not an array of `{ run: string }` steps, or if the build
 * folder contains the source folder
 */
export function resolveConfig(userConfig?: KissConfigInput): KissConfig;
/**
 * @param {KissFolders} folders
 * @returns {string[]} the folders `Kiss` creates on start-up, skipping any set
 * to `null`. `aikb` is not among them: an empty `AIKB/` in every site that has
 * never recorded one would be a promise the build does not keep.
 */
export function foldersToEnsure(folders: KissFolders): string[];
/**
 * Where the engine reads and writes. Every key is present once `resolveConfig`
 * has run; `null` is a real value — it switches a folder off, so nothing is
 * created, scanned or copied for it.
 *
 * @typedef {Object} KissFolders
 * @property {string|null} src the folder the six derived ones below come from
 * @property {string|null} pages `.hbs` views, the root `options.view` is relative to
 * @property {string|null} build where the site is written
 * @property {string|null} assets copied (and Sass-compiled) into `build`
 * @property {string|null} layouts registered as Handlebars layouts
 * @property {string|null} partials registered as Handlebars partials
 * @property {string|null} models `.json` models `options.model` names
 * @property {string|null} controllers `.js` controllers `options.controller` names
 * @property {string|null} aikb where `kiss-ssg aikb` records the site's knowledge base; source-side and committed, so it is not derived from `src` and is not created on start-up
 */
/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
 * `build` and `aikb` are never derived: one is the output, the other is
 * committed source beside it.
 *
 * @typedef {Partial<KissFolders>} KissFoldersInput
 */
/**
 * The fetch policy for `http(s)` models (`config.fetch`). Per instance, not per
 * page, and merged exactly one level deep.
 *
 * @typedef {Object} KissFetch
 * @property {Record<string, string>} headers sent with every URL-model request
 * @property {number} timeout ms before the request is aborted and the page fails
 * @property {number} retries extra attempts after a network error or a 5xx
 * @property {string|false} cache a directory to cache successful bodies in, or `false`
 */
/**
 * The asset block (`config.assets`): the cache-busting policy for the files
 * `.copyAssets()` emits, read by the `{{asset}}` helper — both off = today's
 * build — plus the pipeline of external commands run before the copy.
 *
 * @typedef {Object} KissAssets
 * @property {boolean} hash rename every emitted `.css`/`.js` to carry a content hash
 * @property {string|null} version leave names alone; `{{asset}}` appends `?v=<version>`
 * @property {import('./pipeline.js').PipelineStep[]} pipeline ordered commands run before the asset copy
 */
/**
 * The Markdown block (`config.markdown`): the options handed to this instance's
 * Remarkable, behind both `.md` partials and the `{{markdown}}` helper. Merged
 * exactly one level deep, and passed through as-is — the three keys below are
 * the ones kiss has a default for, not the ones it accepts, so any other
 * Remarkable option (`typographer`, `langPrefix`) reaches the renderer too.
 *
 * @typedef {Object} KissMarkdown
 * @property {boolean} html render raw HTML in the source rather than escaping it
 * @property {boolean} xhtmlOut close single tags XHTML-style (`<br />`)
 * @property {boolean} breaks turn a newline inside a paragraph into a `<br />`
 */
/**
 * The link block (`config.links`): what the broken-internal-link scan does on a
 * settled non-dev build. A block rather than a bare boolean because the second
 * knob a real deploy wants (paths the host generates and the build never sees)
 * would otherwise be a breaking rename. Merged exactly one level deep.
 *
 * @typedef {Object} KissLinks
 * @property {boolean} check scan every written page for internal references that resolve to nothing
 */
/**
 * Every documented config key except `folders`. Both the resolved and the input
 * config are built from this one shape, so the two cannot drift apart.
 *
 * @typedef {Object} KissSettings
 * @property {boolean} dev start a livereload dev server and file watcher; skip minification
 * @property {boolean} verbose log the resolved config, and write `debug.json` from `.viewStats()`
 * @property {boolean|'atomic'} cleanBuild `true` empties `folders.build` in the constructor, `'atomic'` builds into a staging sibling and swaps it in when `complete()` resolves
 * @property {boolean} extensionLess build non-index pages to `<path>/<slug>/index.html`
 * @property {string} [siteUrl] required by `.sitemap()` and the `canonical`/`absUrl` helpers
 * @property {{ includePaths: string[] }} sass load paths handed to Sass (its `loadPaths`)
 * @property {KissFetch} fetch
 * @property {KissAssets} assets
 * @property {KissMarkdown & Record<string, any>} markdown
 * @property {KissLinks} links gates the broken-internal-link scan on a settled non-dev build
 * @property {number} port dev server port
 * @property {number} livereloadPort live reload port, also injected into the dev-mode reload script
 * @property {string} devHost interface the dev and live reload servers bind to
 */
/**
 * A fully resolved config: `kiss.config`, and what every view sees as
 * `this.config`. Extra keys are part of the contract rather than an oversight —
 * anything a site passes through (`new Kiss({ season })`) reaches its views as
 * `{{config.season}}` — so an unknown key is `any` instead of an error.
 *
 * @typedef {KissSettings & { folders: KissFolders } & Record<string, any>} KissConfig
 */
/**
 * The config a site passes to `new Kiss(config)`: every key optional, extra keys
 * allowed. An omitted key — or one explicitly `undefined` — takes its default
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch`, `assets`,
 * `markdown` and `links` are partial here because each is merged exactly one level deep,
 * so a site sets the one key it cares about and keeps the defaults around it.
 *
 * @typedef {Partial<Omit<KissSettings, 'sass'|'fetch'|'assets'|'markdown'|'links'>> & {
 *   sass?: { includePaths?: string[] },
 *   fetch?: Partial<KissFetch>,
 *   assets?: Partial<KissAssets>,
 *   markdown?: Partial<KissMarkdown> & Record<string, any>,
 *   links?: Partial<KissLinks>,
 *   folders?: KissFoldersInput,
 * } & Record<string, any>} KissConfigInput
 */
export const DEFAULT_FOLDERS: Readonly<{
    src: "./src";
    pages: "./src/pages";
    build: "./public";
    assets: "./src/assets";
    layouts: "./src/layouts";
    partials: "./src/partials";
    models: "./src/models";
    controllers: "./src/controllers";
    aikb: "./AIKB";
}>;
export const DEFAULT_FETCH: Readonly<{
    headers: {};
    timeout: 10000;
    retries: 0;
    cache: false;
}>;
export const DEFAULT_ASSETS: Readonly<{
    hash: false;
    version: any;
    pipeline: any[];
}>;
export const DEFAULT_MARKDOWN: Readonly<{
    html: true;
    xhtmlOut: true;
    breaks: false;
}>;
export const DEFAULT_LINKS: Readonly<{
    check: true;
}>;
export const DEFAULT_CONFIG: Readonly<{
    dev: false;
    verbose: false;
    cleanBuild: true;
    extensionLess: false;
    sass: {
        includePaths: any[];
    };
    fetch: Readonly<{
        headers: {};
        timeout: 10000;
        retries: 0;
        cache: false;
    }>;
    assets: Readonly<{
        hash: false;
        version: any;
        pipeline: any[];
    }>;
    markdown: Readonly<{
        html: true;
        xhtmlOut: true;
        breaks: false;
    }>;
    links: Readonly<{
        check: true;
    }>;
    port: 3001;
    livereloadPort: 35729;
    devHost: "127.0.0.1";
}>;
export const CLEAN_BUILD_VALUES: readonly (string | boolean)[];
/**
 * Where the engine reads and writes. Every key is present once `resolveConfig`
 * has run; `null` is a real value — it switches a folder off, so nothing is
 * created, scanned or copied for it.
 */
export type KissFolders = {
    /**
     * the folder the six derived ones below come from
     */
    src: string | null;
    /**
     * `.hbs` views, the root `options.view` is relative to
     */
    pages: string | null;
    /**
     * where the site is written
     */
    build: string | null;
    /**
     * copied (and Sass-compiled) into `build`
     */
    assets: string | null;
    /**
     * registered as Handlebars layouts
     */
    layouts: string | null;
    /**
     * registered as Handlebars partials
     */
    partials: string | null;
    /**
     * `.json` models `options.model` names
     */
    models: string | null;
    /**
     * `.js` controllers `options.controller` names
     */
    controllers: string | null;
    /**
     * where `kiss-ssg aikb` records the site's knowledge base; source-side and committed, so it is not derived from `src` and is not created on start-up
     */
    aikb: string | null;
};
/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
 * `build` and `aikb` are never derived: one is the output, the other is
 * committed source beside it.
 */
export type KissFoldersInput = Partial<KissFolders>;
/**
 * The fetch policy for `http(s)` models (`config.fetch`). Per instance, not per
 * page, and merged exactly one level deep.
 */
export type KissFetch = {
    /**
     * sent with every URL-model request
     */
    headers: Record<string, string>;
    /**
     * ms before the request is aborted and the page fails
     */
    timeout: number;
    /**
     * extra attempts after a network error or a 5xx
     */
    retries: number;
    /**
     * a directory to cache successful bodies in, or `false`
     */
    cache: string | false;
};
/**
 * The asset block (`config.assets`): the cache-busting policy for the files
 * `.copyAssets()` emits, read by the `{{asset}}` helper — both off = today's
 * build — plus the pipeline of external commands run before the copy.
 */
export type KissAssets = {
    /**
     * rename every emitted `.css`/`.js` to carry a content hash
     */
    hash: boolean;
    /**
     * leave names alone; `{{asset}}` appends `?v=<version>`
     */
    version: string | null;
    /**
     * ordered commands run before the asset copy
     */
    pipeline: import("./pipeline.js").PipelineStep[];
};
/**
 * The Markdown block (`config.markdown`): the options handed to this instance's
 * Remarkable, behind both `.md` partials and the `{{markdown}}` helper. Merged
 * exactly one level deep, and passed through as-is — the three keys below are
 * the ones kiss has a default for, not the ones it accepts, so any other
 * Remarkable option (`typographer`, `langPrefix`) reaches the renderer too.
 */
export type KissMarkdown = {
    /**
     * render raw HTML in the source rather than escaping it
     */
    html: boolean;
    /**
     * close single tags XHTML-style (`<br />`)
     */
    xhtmlOut: boolean;
    /**
     * turn a newline inside a paragraph into a `<br />`
     */
    breaks: boolean;
};
/**
 * The link block (`config.links`): what the broken-internal-link scan does on a
 * settled non-dev build. A block rather than a bare boolean because the second
 * knob a real deploy wants (paths the host generates and the build never sees)
 * would otherwise be a breaking rename. Merged exactly one level deep.
 */
export type KissLinks = {
    /**
     * scan every written page for internal references that resolve to nothing
     */
    check: boolean;
};
/**
 * Every documented config key except `folders`. Both the resolved and the input
 * config are built from this one shape, so the two cannot drift apart.
 */
export type KissSettings = {
    /**
     * start a livereload dev server and file watcher; skip minification
     */
    dev: boolean;
    /**
     * log the resolved config, and write `debug.json` from `.viewStats()`
     */
    verbose: boolean;
    /**
     * `true` empties `folders.build` in the constructor, `'atomic'` builds into a staging sibling and swaps it in when `complete()` resolves
     */
    cleanBuild: boolean | "atomic";
    /**
     * build non-index pages to `<path>/<slug>/index.html`
     */
    extensionLess: boolean;
    /**
     * required by `.sitemap()` and the `canonical`/`absUrl` helpers
     */
    siteUrl?: string;
    /**
     * load paths handed to Sass (its `loadPaths`)
     */
    sass: {
        includePaths: string[];
    };
    fetch: KissFetch;
    assets: KissAssets;
    markdown: KissMarkdown & Record<string, any>;
    /**
     * gates the broken-internal-link scan on a settled non-dev build
     */
    links: KissLinks;
    /**
     * dev server port
     */
    port: number;
    /**
     * live reload port, also injected into the dev-mode reload script
     */
    livereloadPort: number;
    /**
     * interface the dev and live reload servers bind to
     */
    devHost: string;
};
/**
 * A fully resolved config: `kiss.config`, and what every view sees as
 * `this.config`. Extra keys are part of the contract rather than an oversight —
 * anything a site passes through (`new Kiss({ season })`) reaches its views as
 * `{{config.season}}` — so an unknown key is `any` instead of an error.
 */
export type KissConfig = KissSettings & {
    folders: KissFolders;
} & Record<string, any>;
/**
 * The config a site passes to `new Kiss(config)`: every key optional, extra keys
 * allowed. An omitted key — or one explicitly `undefined` — takes its default
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch`, `assets`,
 * `markdown` and `links` are partial here because each is merged exactly one level deep,
 * so a site sets the one key it cares about and keeps the defaults around it.
 */
export type KissConfigInput = Partial<Omit<KissSettings, "sass" | "fetch" | "assets" | "markdown" | "links">> & {
    sass?: {
        includePaths?: string[];
    };
    fetch?: Partial<KissFetch>;
    assets?: Partial<KissAssets>;
    markdown?: Partial<KissMarkdown> & Record<string, any>;
    links?: Partial<KissLinks>;
    folders?: KissFoldersInput;
} & Record<string, any>;
