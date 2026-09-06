/**
 * @param {KissFoldersInput} [userFolders]
 * @returns {KissFolders} every folder key present and path-normalised
 */
export function resolveFolders(userFolders?: KissFoldersInput): KissFolders;
/**
 * @param {KissConfigInput} [userConfig]
 * @returns {KissConfig} the defaults with `userConfig` merged over them
 * @throws if `cleanBuild` is not `true`, `false` or `'atomic'`, or if the build
 * folder contains the source folder
 */
export function resolveConfig(userConfig?: KissConfigInput): KissConfig;
/**
 * @param {KissFolders} folders
 * @returns {string[]} the folders `Kiss` creates on start-up, skipping any set to `null`
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
 */
/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
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
 * The cache-busting policy for the files `.copyAssets()` emits
 * (`config.assets`), read by the `{{asset}}` helper. Both off = today's build.
 *
 * @typedef {Object} KissAssets
 * @property {boolean} hash rename every emitted `.css`/`.js` to carry a content hash
 * @property {string|null} version leave names alone; `{{asset}}` appends `?v=<version>`
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
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch` and
 * `assets` are partial here because each is merged exactly one level deep, so a
 * site sets the one key it cares about and keeps the defaults around it.
 *
 * @typedef {Partial<Omit<KissSettings, 'sass'|'fetch'|'assets'>> & {
 *   sass?: { includePaths?: string[] },
 *   fetch?: Partial<KissFetch>,
 *   assets?: Partial<KissAssets>,
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
};
/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
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
 * The cache-busting policy for the files `.copyAssets()` emits
 * (`config.assets`), read by the `{{asset}}` helper. Both off = today's build.
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
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch` and
 * `assets` are partial here because each is merged exactly one level deep, so a
 * site sets the one key it cares about and keeps the defaults around it.
 */
export type KissConfigInput = Partial<Omit<KissSettings, "sass" | "fetch" | "assets">> & {
    sass?: {
        includePaths?: string[];
    };
    fetch?: Partial<KissFetch>;
    assets?: Partial<KissAssets>;
    folders?: KissFoldersInput;
} & Record<string, any>;
