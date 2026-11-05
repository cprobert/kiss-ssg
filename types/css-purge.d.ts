/**
 * The purge block (`config.assets.purge`), resolved.
 *
 * @typedef {Object} KissPurge
 * @property {string[]} files the stylesheets to purge, by the path a template
 * asks for (`css/bootstrap.css`)
 * @property {(string|RegExp)[]} [safelist] selectors PurgeCSS always keeps:
 * the classes a script adds that no file spells out (default none)
 * @property {boolean} [scripts] also scan the build's `.js` files for class
 * names (default `true`)
 */
/**
 * One stylesheet purged.
 *
 * @typedef {Object} PurgeResult
 * @property {string} name the path a template asks for
 * @property {string} from the build-relative output before the purge
 * @property {string} to the build-relative output after it (the same when
 * the build does not hash)
 * @property {number} before bytes
 * @property {number} after bytes
 */
/**
 * `assets.purge` as given, checked and filled in. `null` (the default) and
 * `false` purge nothing.
 *
 * @param {*} purge
 * @returns {KissPurge|null}
 * @throws if it is not `null`, `false` or an object with a non-empty `files`
 * list of strings, if `safelist` is not a list of strings and RegExps, or if
 * `scripts` is not a boolean
 */
export function resolvePurge(purge: any): KissPurge | null;
/**
 * Purge one stylesheet's CSS against the given HTML and scripts.
 *
 * @param {string} css
 * @param {{ html: string[], scripts: string[], safelist: (string|RegExp)[] }} content
 * @returns {Promise<string>}
 */
export function purgeCss(css: string, { html, scripts, safelist }: {
    html: string[];
    scripts: string[];
    safelist: (string | RegExp)[];
}): Promise<string>;
/**
 * Purge every stylesheet `purge.files` names, in the build at `root`.
 * Writes the purged bytes, re-hashed under `hash`, and moves the manifest's
 * name to the new output. It does not touch a page: the caller rewrites each
 * page from `from` to `to`.
 *
 * @param {Object} input
 * @param {KissPurge} input.purge
 * @param {string} input.root where the build is being written
 * @param {{ lookup(name: string): string|null, retarget(name: string, output: string): void }} input.manifest
 * @param {string[]} input.pages the written HTML pages, absolute paths
 * @param {boolean} input.hash `assets.hash`
 * @param {boolean} input.minify `assets.minify`
 * @param {{ owner(file: string): string|null, release(file: string, owner: string): void, claim(file: string, owner: string, kind?: any): void }} [input.outputs]
 * @returns {Promise<PurgeResult[]>}
 * @throws when a named stylesheet is not in the build, or PurgeCSS fails
 */
export function purgeStylesheets({ purge, root, manifest, pages, hash, minify, outputs, }: {
    purge: KissPurge;
    root: string;
    manifest: {
        lookup(name: string): string | null;
        retarget(name: string, output: string): void;
    };
    pages: string[];
    hash: boolean;
    minify: boolean;
    outputs?: {
        owner(file: string): string | null;
        release(file: string, owner: string): void;
        claim(file: string, owner: string, kind?: any): void;
    };
}): Promise<PurgeResult[]>;
/**
 * The purge block (`config.assets.purge`), resolved.
 */
export type KissPurge = {
    /**
     * the stylesheets to purge, by the path a template
     * asks for (`css/bootstrap.css`)
     */
    files: string[];
    /**
     * selectors PurgeCSS always keeps:
     * the classes a script adds that no file spells out (default none)
     */
    safelist?: (string | RegExp)[];
    /**
     * also scan the build's `.js` files for class
     * names (default `true`)
     */
    scripts?: boolean;
};
/**
 * One stylesheet purged.
 */
export type PurgeResult = {
    /**
     * the path a template asks for
     */
    name: string;
    /**
     * the build-relative output before the purge
     */
    from: string;
    /**
     * the build-relative output after it (the same when
     * the build does not hash)
     */
    to: string;
    /**
     * bytes
     */
    before: number;
    /**
     * bytes
     */
    after: number;
};
