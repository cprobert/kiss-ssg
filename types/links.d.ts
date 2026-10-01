/**
 * Decodes the entity subset Handlebars emits into attribute values and text:
 * `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` and the numeric forms. Shared with
 * `lib/audit.js`, so a title and an href are decoded alike.
 *
 * @param {string} value raw text as written to the page
 * @returns {string} the text with that subset decoded; any other entity, and
 * any numeric one outside Unicode, is left as written
 */
export function decodeEntities(value: string): string;
/**
 * Every reference the rendered HTML asks a browser to fetch, as written.
 *
 * @param {string} html one page's output, exactly as it was written to disk
 * @returns {string[]} sorted and deduplicated raw reference strings; empties,
 * bare `#fragment`s and the `data:`/`javascript:`/`mailto:`/`tel:` schemes are
 * dropped here, because none of them can name a file this build wrote
 */
export function extractReferences(html: string): string[];
/**
 * Whether a reference names something this build was supposed to write.
 *
 * An absolute URL on the site's own origin is **internal**: `{{canonical}}` and
 * `{{absUrl}}` emit one on every page, so treating every scheme as external
 * would miss exactly the slug rename this exists to catch.
 *
 * @param {string} ref a reference as `extractReferences` returned it
 * @param {{ siteUrl?: string|null }} [options] the site's `config.siteUrl`
 * @returns {{ kind: 'external'|'internal', path: string|null }} `path` is the
 * reference with its query and fragment removed — root-relative or relative,
 * kept as written — and `null` for anything external
 */
export function classifyReference(ref: string, { siteUrl }?: {
    siteUrl?: string | null;
}): {
    kind: "external" | "internal";
    path: string | null;
};
/**
 * Whether an internal reference resolves to something under the build folder.
 *
 * @param {string} ref the `path` `classifyReference` returned
 * @param {Object} options
 * @param {string} options.pageBuildTo the page holding the reference, as it was
 * written — a staging path under `cleanBuild: 'atomic'` and under check mode
 * @param {string} options.buildDir the folder those pages were written into
 * @param {boolean} [options.extensionLess] `config.extensionLess`; it orders the
 * two extension-less fallbacks and nothing else — both are always tried
 * @param {(file: string) => boolean} [options.exists] injected for tests;
 * defaults to `fs.existsSync`
 * @param {Set<string>} [options.known] build-relative paths this build knows it
 * produced, whether or not they are on disk yet
 * @returns {boolean}
 */
export function resolveReference(ref: string, { pageBuildTo, buildDir, extensionLess, exists, known, }?: {
    pageBuildTo: string;
    buildDir: string;
    extensionLess?: boolean;
    exists?: (file: string) => boolean;
    known?: Set<string>;
}): boolean;
/**
 * One page's output as the scan needs it: where it was written, and what it
 * referenced. `links` is `KissPage.links`, extracted at write time.
 *
 * @typedef {Object} LinkPage
 * @property {string} buildTo
 * @property {string[]} links
 */
/**
 * Resolves every internal reference in a build's own output.
 *
 * @param {Object} options
 * @param {LinkPage[]} options.pages only pages that actually wrote bytes
 * @param {string} options.buildDir the folder they were written into
 * @param {string|null} [options.siteUrl] `config.siteUrl`, for the origin test
 * @param {boolean} [options.extensionLess] `config.extensionLess`
 * @param {string[]} [options.manifestTargets] the asset manifest's **values** —
 * the names actually emitted, which under `assets.hash` are the only strings a
 * template may legitimately have written
 * @param {string[]} [options.hostServed] `config.links.hostServed` — patterns
 * for paths the host serves that no build folder holds
 * @param {(file: string) => boolean} [options.exists] injected for tests
 * @returns {{ checked: number, hostServed: number, broken: { page: string, href: string }[] }}
 * `checked` counts every reference classified internal; `hostServed` the ones
 * among them that resolved to nothing in the build but match a `hostServed`
 * pattern; `broken` is sorted by page, then href
 */
export function checkLinks({ pages, buildDir, siteUrl, extensionLess, manifestTargets, hostServed: patterns, exists, }: {
    pages: LinkPage[];
    buildDir: string;
    siteUrl?: string | null;
    extensionLess?: boolean;
    manifestTargets?: string[];
    hostServed?: string[];
    exists?: (file: string) => boolean;
}): {
    checked: number;
    hostServed: number;
    broken: {
        page: string;
        href: string;
    }[];
};
/**
 * A predicate over root-relative paths for `config.links.hostServed`. A
 * pattern is the whole path, not a prefix: `**` matches across `/`, `*` within
 * one segment, and every other character is literal — the two wildcards a
 * host's own rewrite rules use, and nothing a reader has to look up.
 *
 * @param {readonly string[]} [patterns]
 * @returns {(sitePath: string|null) => boolean}
 */
export function hostServedMatcher(patterns?: readonly string[]): (sitePath: string | null) => boolean;
export function attribute(name: string): RegExp;
/**
 * One page's output as the scan needs it: where it was written, and what it
 * referenced. `links` is `KissPage.links`, extracted at write time.
 */
export type LinkPage = {
    buildTo: string;
    links: string[];
};
