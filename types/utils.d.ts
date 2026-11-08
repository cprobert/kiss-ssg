/**
 * @param {string} lines
 * @returns {string} every line trimmed, rejoined with `\n` and newline-terminated
 */
export function trimLines(lines: string): string;
/**
 * The whole naming contract for a page's output path: stable, and collision-free
 * per distinct input.
 *
 * @param {unknown} slug
 * @returns {string} lowercase `a-z0-9` and `-`, accented Latin transliterated; a
 * short stable hash (`p-9736ca69`) when the input has no Latin decomposition at
 * all, and `''` for an empty or whitespace-only input
 */
export function toSlug(slug: unknown): string;
/**
 * @param {string} str
 * @returns {string} each space-separated word capitalised
 */
export function toTitleCase(str: string): string;
/**
 * @param {string} path
 * @returns {string} the path without a leading or trailing `/`
 */
export function trimPath(path: string): string;
/**
 * @param {string} path
 * @returns {string} each `/`-separated segment through `toSlug`; a falsy path is
 * returned as it came
 */
export function sanitizePath(path: string): string;
/**
 * @param {string} path
 * @returns {string} the path with `\` as `/` and a leading `./` stripped
 */
export function posixPath(path: string): string;
/**
 * @param {string} dir a literal directory, glob-escaped before matching
 * @param {string} pattern the glob to match under it
 * @returns {string[]} matching paths, posix-normalised and sorted
 */
export function globFiles(dir: string, pattern: string): string[];
/**
 * @param {unknown} value a URL or a build path
 * @returns {string} the page-identity key: no leading or trailing `/`, no file
 * extension, no trailing `index` segment; the home page is `''`
 */
export function toURLKey(value: unknown): string;
/**
 * @param {string} siteUrl
 * @param {string} [urlPath]
 * @param {Object} [options]
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`: keep
 * the directory index's trailing `/` (the default, what Netlify serves), or
 * drop it (what Firebase with `trailingSlash: false` serves)
 * @returns {string} the two joined by exactly one `/`, repeated slashes
 * collapsed, a trailing `index` segment replaced by a trailing `/` (or by
 * nothing) and an explicit trailing `/` preserved; an empty path gives
 * `siteUrl` with one trailing slash whatever the policy
 */
export function toAbsoluteUrl(siteUrl: string, urlPath?: string, { trailingSlash }?: {
    trailingSlash?: boolean;
}): string;
/**
 * @param {unknown} pageURL a page's build-relative URL, e.g. `courses/index.html`
 * @returns {string} the same path with the last segment's file extension
 * removed; every other character, `index` segment and slash left alone
 */
export function toCanonicalPath(pageURL: unknown): string;
/**
 * @param {unknown} pageURL a page's build-relative URL, e.g. `courses/index.html`
 * @param {Object} [options]
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`, the
 * same policy `toAbsoluteUrl` takes — the two must agree or a page is linked
 * at one URL and canonicalised at another
 * @returns {string} the root-relative path the host serves it at: `/`,
 * `/about.html`, `/about/` (or `/about`), `/courses/` (or `/courses`),
 * `/data/index.json`
 */
export function servedPathFor(pageURL: unknown, { trailingSlash }?: {
    trailingSlash?: boolean;
}): string;
/**
 * @param {string} fromPageURL the linking page's build-relative URL
 * @param {string} toPageURL the linked page's build-relative URL
 * @returns {string} e.g. `tab-2.html`, `../l2/index.html`; a page linking
 * itself gets its own file name
 */
export function relativePathFor(fromPageURL: string, toPageURL: string): string;
/**
 * @param {unknown} input
 * @returns {string} MD5 hex digest of the string, or of its JSON if it is not one
 */
export function hashId(input: unknown): string;
/**
 * Whether a model is a URL kiss fetches.
 *
 * @param {unknown} model a page's `model`, as the author wrote it
 * @returns {boolean} true for a string whose scheme is `http:` or `https:`,
 * in any case and after any leading space (both of which fetch takes), false
 * for anything else: `httpdata.json` and `http-archive` are a file and a
 * folder, and `httpx://…` is not fetched
 */
export function isUrlModel(model: unknown): boolean;
/**
 * A URL as kiss shows it, never as it fetches it.
 *
 * @param {unknown} url a model URL, as the author wrote it
 * @returns {string} the URL with no `user:pass@` and no fragment, and its
 * query reduced to its parameters' names, each value replaced by `[redacted]`
 * (`?access_token=SECRET&type=course` →
 * `?access_token=[redacted]&type=[redacted]`); a parameter with no `=` becomes
 * `[redacted]`, and an empty query is dropped. Scheme, host, port and path
 * are kept, in the form the WHATWG URL
 * parser gives them (host lowercased, a default port dropped, the path
 * percent-encoded); a secret in the path cannot be told from a path segment
 * and is shown as written. A string the parser rejects, or one whose scheme
 * is not `http:` or `https:`, goes by its last `@`: when that `@` comes after
 * the string's first `?` or `#`, only the scheme is kept
 * (`https://[redacted]`); otherwise everything between the scheme and
 * that `@` is dropped, the rest is cut at its first `?` or `#`, and given
 * `?[redacted]` when what was cut began with `?`. The scheme is kept with
 * the slashes or backslashes that follow it, as written.
 */
export function redactUrl(url: unknown): string;
/**
 * A string as a RegExp that matches it literally: every character a RegExp
 * reads specially is escaped. One rule for the engine's modules (named
 * export only, not part of the public `utils` object).
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeRegExp(text: string): string;
export function isInside(directory: string): (file: string) => boolean;
/**
 * The word every redacted value is replaced with: a model URL's query
 * (`redactUrl`) and `fetch.headers` values (`lib/config.js`,
 * `redactFetchHeaders`).
 */
export const REDACTED: "[redacted]";
export default utils;
declare namespace utils {
    export { trimLines };
    export { toSlug };
    export { toTitleCase };
    export { trimPath };
    export { sanitizePath };
    export { posixPath };
    export { globFiles };
    export { hashId };
    export { toURLKey };
    export { toAbsoluteUrl };
    export { toCanonicalPath };
    export { servedPathFor };
    export { relativePathFor };
}
