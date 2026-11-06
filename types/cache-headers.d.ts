/**
 * The build-relative paths of every file kiss content-hashed that is in the
 * build folder: the asset manifest's renamed `.css`/`.js` entries, and the
 * consent client when there is one, and `{{image}}`'s variants. A file that is
 * not on disk under the build folder (a copy into a folder outside it, a
 * variant whose encode failed) is left out, because no host serves it from
 * here.
 *
 * @param {{ manifest: Record<string, string>, consentClient?: string|null, images?: string[], root: string }} input
 * `manifest` is `assetManifest.toObject()`; `images` the variants' build-relative
 * paths; `root` is where the build is being written (the staging folder under
 * `'atomic'`)
 * @returns {string[]} `/`-rooted, sorted, without duplicates
 */
export function hashedFiles({ manifest, consentClient, images, root, }: {
    manifest: Record<string, string>;
    consentClient?: string | null;
    images?: string[];
    root: string;
}): string[];
/**
 * @param {string[]} files from `hashedFiles`
 * @returns {CacheHeaderRule[]}
 */
export function cacheHeaderRules(files: string[]): CacheHeaderRule[];
/**
 * The host-neutral list: `{ version, rules }`, sorted and newline-terminated,
 * so two identical builds write identical bytes.
 *
 * @param {CacheHeaderRule[]} rules
 * @returns {string}
 */
export function renderCacheHeadersJson(rules: CacheHeaderRule[]): string;
/**
 * kiss's block for a `_headers` file (Netlify and Cloudflare Pages): one path
 * per hashed file, its header indented below it, between the two marker lines.
 *
 * @param {CacheHeaderRule[]} rules
 * @returns {string}
 */
export function renderHeadersBlock(rules: CacheHeaderRule[]): string;
/**
 * The site's own `_headers` with kiss's block appended. A block an earlier
 * build left (under `cleanBuild: false`) is replaced, never repeated. With no
 * site file, kiss's block is the whole file. `markers` names the block's two
 * lines, so the security headers (`lib/security-headers.js`) keep a block of
 * their own beside this one.
 *
 * @param {string|null} existing the site's file, or `null` when it has none
 * @param {string} block from `renderHeadersBlock`
 * @param {{ start: string, end: string }} [markers]
 * @returns {string}
 */
export function mergeHeadersFile(existing: string | null, block: string, markers?: {
    start: string;
    end: string;
}): string;
/**
 * A `_headers` file with kiss's block taken out, and the blank line
 * `mergeHeadersFile` put before it, so a merge and a removal undo each other.
 *
 * @param {string} existing
 * @param {{ start: string, end: string }} [markers]
 * @returns {string}
 */
export function removeHeadersBlock(existing: string, markers?: {
    start: string;
    end: string;
}): string;
/**
 * Take back what an earlier build wrote and this one did not: kiss's block in
 * `_headers`, and each generated file in `files`. Under `cleanBuild: false`
 * the folder is kept, so a header the site has since turned off would
 * otherwise stay live. A `_headers` left empty is removed; a generated name
 * that anything claimed this build (the asset copy, a pipeline step) is left.
 *
 * @param {Object} input
 * @param {string} input.root
 * @param {{ start: string, end: string }} input.markers kiss's block in `_headers`
 * @param {string[]} input.files generated file names, build-relative
 * @param {string[]} input.written every path this build wrote
 * @param {{ kind?(file: string): string|null }} [input.outputs]
 * @returns {Promise<void>}
 */
export function retireHeaders({ root, markers, files, written, outputs, }: {
    root: string;
    markers: {
        start: string;
        end: string;
    };
    files: string[];
    written: string[];
    outputs?: {
        kind?(file: string): string | null;
    };
}): Promise<void>;
/**
 * The Firebase fragment: patterns, never paths, because a person merges it
 * into `firebase.json` once and a hashed name changes on every edit. One
 * pattern for kiss's hash shape, one for the consent client when the site has
 * one.
 *
 * @param {{ consent: boolean }} options
 * @returns {string}
 */
export function renderFirebaseCacheHeaders({ consent }: {
    consent: boolean;
}): string;
/**
 * The files in the build folder that the Firebase pattern matches but kiss did
 * not hash: a host would cache each for a year, with no way to change it.
 *
 * @param {string[]} built every file under the build folder, `/`-rooted
 * @param {string[]} hashed from `hashedFiles`
 * @returns {string[]} sorted
 */
export function firebaseLookalikes(built: string[], hashed: string[]): string[];
/**
 * The formats to run, as a list: `[]` for `undefined`, `null` and `'none'`; a
 * bare name or function as a list of one; duplicates collapsed, so `netlify`
 * and `cloudflare` together write `_headers` once.
 *
 * @param {*} format `config.cacheHeaders.format`
 * @returns {Array<string|Function>}
 */
export function resolveCacheHeaderFormats(format: any): Array<string | Function>;
/**
 * Write the cache-header files for this build into `root`.
 *
 * @param {Object} input
 * @param {import('./config.js').KissConfig} input.config
 * @param {string} input.root where the build is being written
 * @param {Record<string, string>} input.manifest `assetManifest.toObject()`
 * @param {string|null} [input.consentClient] the consent client's name
 * @param {string[]} [input.images] `{{image}}`'s variants, build-relative
 * @param {{ kind(file: string): string|null, claim(file: string, owner: string): void }} [input.outputs]
 * @returns {Promise<CacheHeadersWriteResult>}
 */
export function writeCacheHeaders({ config, root, manifest, consentClient, images, outputs, }: {
    config: import("./config.js").KissConfig;
    root: string;
    manifest: Record<string, string>;
    consentClient?: string | null;
    images?: string[];
    outputs?: {
        kind(file: string): string | null;
        claim(file: string, owner: string): void;
    };
}): Promise<CacheHeadersWriteResult>;
/** The value every hashed file is served with. */
export const IMMUTABLE: "public, max-age=31536000, immutable";
/** How many hex characters the consent client's name carries. */
export const CONSENT_HASH_LENGTH: 10;
/**
 * The block kiss appends to a `_headers` the site keeps in its assets. Between
 * these two lines is kiss's; everything else is the site's, kept byte for
 * byte.
 */
export const BLOCK_START: "# kiss-ssg: cache headers for hashed files (generated, do not edit)";
export const BLOCK_END: "# kiss-ssg: end of cache headers";
export const CACHE_HEADER_FORMATS: Readonly<{
    netlify: {
        file: string;
        kind: string;
    };
    cloudflare: {
        file: string;
        kind: string;
    };
    firebase: {
        file: string;
        kind: string;
    };
}>;
/**
 * One cache-header rule: an exact path (Netlify, Cloudflare Pages) or a
 * pattern (Firebase), and the headers it sets.
 */
export type CacheHeaderRule = {
    /**
     * a build-relative URL path, `/`-rooted
     */
    path?: string;
    /**
     * an RE2 pattern over the request path (Firebase)
     */
    regex?: string;
    headers: Record<string, string>;
};
export type CacheHeadersWriteResult = {
    /**
     * `none` when there is no hashed file:
     * nothing is written, not even the list
     */
    status: "none" | "written";
    /**
     * the exact-path rules, the list
     * `cache-headers.json` carries
     */
    rules: CacheHeaderRule[];
    /**
     * every path written, `cache-headers.json` first
     */
    files: string[];
    /**
     * the formats that ran, `'custom'` for a function
     */
    formats: string[];
    /**
     * hashed files exist and no format was chosen, by
     * `host` or by `cacheHeaders.format`
     */
    unset: boolean;
    /**
     * a `_headers` the site keeps was appended to
     */
    merged: boolean;
    /**
     * unhashed files the Firebase pattern also
     * matches, which a host would cache for a year
     */
    lookalikes: string[];
    /**
     * the hosts that have no cache-header
     * encoding yet (`vercel`)
     */
    uncovered: string[];
};
