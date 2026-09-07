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
 * @returns {string} the two joined by exactly one `/`, repeated slashes
 * collapsed, a trailing `index` segment replaced by a trailing `/` and an
 * explicit trailing `/` preserved; an empty path gives `siteUrl` with one
 * trailing slash
 */
export function toAbsoluteUrl(siteUrl: string, urlPath?: string): string;
/**
 * @param {unknown} pageURL a page's build-relative URL, e.g. `courses/index.html`
 * @returns {string} the same path with the last segment's file extension
 * removed; every other character, `index` segment and slash left alone
 */
export function toCanonicalPath(pageURL: unknown): string;
/**
 * @param {unknown} input
 * @returns {string} MD5 hex digest of the string, or of its JSON if it is not one
 */
export function hashId(input: unknown): string;
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
}
