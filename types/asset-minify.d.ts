/**
 * Whether a copied file is one this module minifies: a `.css`, `.js` or
 * `.mjs` that is not already `*.min.*`.
 *
 * @param {string} relative the file's build-relative name
 * @returns {boolean}
 */
export function shouldMinify(relative: string): boolean;
/**
 * A stylesheet with its formatting taken out: the whitespace PostCSS keeps
 * between nodes, and every comment between rules and declarations but a `/*!`
 * licence one (a comment inside a selector, value or params stays). No selector,
 * at-rule parameter or value is touched, so nothing a browser reads changes.
 * It is what a stylesheet clean-css cannot read gets instead: clean-css 5
 * does not understand native nesting, which Tailwind v4 writes, and PostCSS
 * does (the clean room, 2026-11-08: a purged Tailwind sheet shipped at
 * 10,613 bytes; compacted, 8,492, with no computed-style difference).
 *
 * @param {string} text
 * @returns {string}
 * @throws when PostCSS cannot parse it either
 */
export function compactCss(text: string): string;
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
