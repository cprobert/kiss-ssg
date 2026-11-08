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
 * It is a heuristic for the classes a script names. The classes a page's
 * markup carries do not depend on it: `purgeCss` hands PurgeCSS those
 * exactly (`attributeClasses`). Three sets, joined:
 * - **The whole tokens.** These keep the classes that hold `/ [ ] . :`.
 * - **The value of an unquoted attribute** (`class=bg-ink-900/80`).
 * - **The pieces PurgeCSS's default extractor finds.** With these, nothing
 *   the old extractor kept is ever removed now: a script's `{active:true}`
 *   still keeps `.active`.
 *
 * A token holding a character reference is read again decoded: Handlebars
 * writes `{"open":"bg-ink-900/80"}` into an attribute as
 * `{&quot;open&quot;:&quot;bg-ink-900/80&quot;}`, which is one token until
 * the quotes come back.
 *
 * Extra candidates can only keep a rule that is not needed. A missing one
 * breaks a page, so the set errs towards keeping.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function classTokens(content: string): string[];
/**
 * The classes written into the pages' `class` attributes, decoded. These are
 * the classes an element really carries, unlike `classTokens`, which is every
 * word that might be one. Parsed with htmlparser2, never matched, so
 * `class = y` in a sentence is not an attribute and `[&>svg]:size-4` is one
 * class.
 *
 * @param {string[]} html
 * @returns {string[]}
 */
export function attributeClasses(html: string[]): string[];
/**
 * What `purgeCss` reads from content, remembered for one run.
 *
 * @typedef {Object} PurgeReads
 * @property {Map<string, string[]>} tokens `classTokens` per page or script
 * @property {Map<string, string[]>} classes `attributeClasses` per page
 * @property {WeakMap<readonly string[], string>} exact every page's exact
 * classes, deduplicated and joined, per page list: a build purges each of its
 * stylesheets against the same list
 */
/**
 * A fresh memory for one run of purges: one build's `purgeStylesheets`, or
 * one `kiss-ssg css` audit. PurgeCSS runs its extractor over every content
 * string for every stylesheet, so without it a build that purges three files
 * read every page four times. Keyed by the text, so a page is read once
 * whatever list it arrives in (the audit hands each stylesheet only the pages
 * that link it), and an edited page is simply new text. It lives as long as
 * its run, which is why it is passed in rather than kept here.
 *
 * @returns {PurgeReads}
 */
export function purgeReads(): PurgeReads;
/**
 * Purge one stylesheet's CSS against the given HTML and scripts.
 *
 * @param {string} css
 * @param {{ html: string[], scripts: string[], safelist: (string|RegExp)[], reads?: PurgeReads }} content
 * `reads` from `purgeReads()`, shared by every purge of one run
 * @returns {Promise<string>}
 */
export function purgeCss(css: string, { html, scripts, safelist, reads }: {
    html: string[];
    scripts: string[];
    safelist: (string | RegExp)[];
    reads?: PurgeReads;
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
 * What `purgeCss` reads from content, remembered for one run.
 */
export type PurgeReads = {
    /**
     * `classTokens` per page or script
     */
    tokens: Map<string, string[]>;
    /**
     * `attributeClasses` per page
     */
    classes: Map<string, string[]>;
    /**
     * every page's exact
     * classes, deduplicated and joined, per page list: a build purges each of its
     * stylesheets against the same list
     */
    exact: WeakMap<readonly string[], string>;
};
