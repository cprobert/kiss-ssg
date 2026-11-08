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
 * Every candidate class name in a page or a script, for PurgeCSS.
 *
 * Three sets, joined:
 * - **The whole tokens.** These keep the classes that hold `/ [ ] . :`.
 * - **What follows each `=` in a token.** An unquoted attribute
 *   (`class=bg-ink-900/80`) is one token with its name in front.
 * - **The pieces PurgeCSS's default extractor finds.** With these, nothing
 *   the old extractor kept is ever removed now: a script's
 *   `{active:true}` still keeps `.active`.
 *
 * Extra candidates can only keep a rule that is not needed. A missing one
 * breaks a page, so the set errs towards keeping.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function classTokens(content: string): string[];
/**
 * The classes written into `class` attributes, decoded, each with its first
 * page. These are classes an element really carries, unlike `classTokens`,
 * which is every word that might be one. Parsed, not matched, so `class = y`
 * in a sentence is not an attribute.
 *
 * @param {{ page: string, html: string }[]} pages
 * @returns {Map<string, string>} class → the first page that uses it
 */
export function pageClasses(pages: {
    page: string;
    html: string;
}[]): Map<string, string>;
/**
 * The class names in one selector, unescaped. Strings and attribute
 * selectors are skipped, so `[href$=".pdf"]` names no class.
 *
 * @param {string} selector
 * @returns {string[]}
 */
export function selectorClasses(selector: string): string[];
/**
 * A class a page carries whose every rule the purge removed.
 *
 * @typedef {Object} PurgeLoss
 * @property {string} class the class, as the page writes it
 * @property {string} page the first page that carries it
 */
/**
 * The classes the purge took from the pages that carry them: a class written
 * in a page's `class` attribute, for which the stylesheet had at least one
 * selector the pages could match, and the purged stylesheet has no selector
 * at all. "Could match" means every class in that selector appears somewhere
 * in the content, so `.card .title` on a site with no `.card` was rightly
 * removed and is not a loss. A class that keeps any rule is not one either:
 * a framework component whose unused variants were removed is the purge
 * working.
 *
 * @param {Object} input
 * @param {string} input.before the stylesheet before the purge
 * @param {string} input.after the stylesheet after it
 * @param {Map<string, string>} input.used from `pageClasses`
 * @param {Set<string>} input.tokens `classTokens` over every page and script
 * @returns {Promise<PurgeLoss[]>}
 */
export function purgeLosses({ before, after, used, tokens }: {
    before: string;
    after: string;
    used: Map<string, string>;
    tokens: Set<string>;
}): Promise<PurgeLoss[]>;
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
export const DYNAMIC_ATTRIBUTES: string[];
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
/**
 * A class a page carries whose every rule the purge removed.
 */
export type PurgeLoss = {
    /**
     * the class, as the page writes it
     */
    class: string;
    /**
     * the first page that carries it
     */
    page: string;
};
