/**
 * Whether a copied file is one this module minifies: a `.css`, `.js` or
 * `.mjs` that is not already `*.min.*`.
 *
 * @param {string} relative the file's build-relative name
 * @returns {boolean}
 */
export function shouldMinify(relative: string): boolean;
/**
 * One file's bytes, minified. A script is an ES module when it is `.mjs` or
 * when terser cannot read it as a classic script, so `import`/`export` and a
 * top-level `await` survive.
 *
 * @param {string} relative the file's name, which decides CSS or JS
 * @param {string} text
 * @returns {Promise<string>}
 * @throws when the minifier cannot parse the file
 */
export function minifyText(relative: string, text: string): Promise<string>;
/**
 * Minifies `file` in place. Never fails the build: a file the minifier cannot
 * read is left exactly as it was, and the caller is told why.
 *
 * @param {string} file the path on disk
 * @param {string} relative its build-relative name
 * @returns {Promise<{ ok: true, before: number, after: number } | { ok: false, error: string }>}
 */
export function minifyFile(file: string, relative: string): Promise<{
    ok: true;
    before: number;
    after: number;
} | {
    ok: false;
    error: string;
}>;
