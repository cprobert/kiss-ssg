/**
 * @typedef {Object} CssArgs
 * @property {string|null} target
 * @property {string|null} out
 * @property {boolean} help
 * @property {string|null} error a usage error
 */
/**
 * @param {string[]} [argv] everything after `css`
 * @returns {CssArgs}
 */
export function parseCssArgs(argv?: string[]): CssArgs;
/**
 * The build folder the target names, or why it is not one.
 *
 * @param {string} target
 * @param {{ cwd: string, isDirectory: (p: string) => boolean, exists: (p: string) => boolean }} where
 * @returns {{ folder: string } | { error: string }}
 */
export function resolveCssTarget(target: string, { cwd, isDirectory, exists }: {
    cwd: string;
    isDirectory: (p: string) => boolean;
    exists: (p: string) => boolean;
}): {
    folder: string;
} | {
    error: string;
};
/**
 * The stylesheet links and the inline style blocks of one page, in document
 * order. A `<link>` counts when its `rel` tokens include `stylesheet`; a
 * `<style>` counts unless it carries a `data-kiss-` attribute (kiss's own, the
 * consent theme) or sits inside a `<template>`, a `<script>` or a comment.
 *
 * @param {string} html
 * @returns {{ links: string[], inline: string[] }} the raw `href` values
 * (entities decoded) and the raw CSS text of each block
 */
export function extractStyles(html: string): {
    links: string[];
    inline: string[];
};
/**
 * Where one `href` on the page at `page` (build-relative, `blog/index.html`)
 * points, resolved the way a browser resolves it against the page's URL: a
 * root-relative or relative path is a file in the build, its query and hash
 * dropped; an `http(s):` or `//` URL is another origin's stylesheet; any
 * other scheme (`data:`) is neither.
 *
 * @param {string} href
 * @param {string} page
 * @returns {{ kind: 'local', path: string } | { kind: 'third-party', url: string } | { kind: 'skip' }}
 */
export function resolveHref(href: string, page: string): {
    kind: "local";
    path: string;
} | {
    kind: "third-party";
    url: string;
} | {
    kind: "skip";
};
/**
 * An inline block as compared across pages: whitespace collapsed to one
 * space and trimmed, so the same block indented differently is the same.
 *
 * @param {string} css
 * @returns {string}
 */
export function normaliseCss(css: string): string;
/**
 * @param {string} text
 * @returns {string} the first 16 hex digits of its SHA-256
 */
export function hashText(text: string): string;
/**
 * @param {string|Buffer} bytes
 * @returns {number} its size under Brotli at quality 11
 */
export function brotliSize(bytes: string | Buffer): number;
/**
 * The directive that governs a `<style>` element in one
 * Content-Security-Policy value: `style-src-elem`, else `style-src`, else
 * `default-src` (CSP Level 3's fallback order), or `null` when the policy has
 * none of them and so does not restrict styles.
 *
 * @param {string} policy
 * @returns {string|null} the directive as written, whitespace collapsed
 */
export function styleDirective(policy: string): string | null;
/**
 * The directives in a `_headers` file (Netlify's and Cloudflare Pages'
 * format) that block inline `<style>` blocks: every
 * `Content-Security-Policy:` line under any path, whose governing style
 * directive has no `'unsafe-inline'`. Read simply: the path a rule applies
 * to is not matched against the pages.
 *
 * @param {string} text
 * @returns {string[]} the distinct blocking directives, sorted
 */
export function inlineStyleBlockers(text: string): string[];
/**
 * Every rule written out in two or more different stylesheets: the same
 * selector list with the same declarations in the same order, inside the same
 * enclosing at-rules, all compared with whitespace normalised. A rule written
 * twice in one stylesheet is not a duplicate across stylesheets.
 *
 * @param {{ path: string, css: string }[]} sheets
 * @param {{ limit?: number }} [options]
 * @returns {{ total: number, listed: DuplicateRule[], errors: { path: string, message: string }[] }}
 * `listed` is the first `limit` by context, selector and files
 */
export function findDuplicateRules(sheets: {
    path: string;
    css: string;
}[], { limit }?: {
    limit?: number;
}): {
    total: number;
    listed: DuplicateRule[];
    errors: {
        path: string;
        message: string;
    }[];
};
/**
 * @typedef {Object} StylesheetEntry
 * @property {string} path build-relative
 * @property {number} pages how many pages link it
 * @property {boolean} missing a page links it and the build has no such file
 * @property {number|null} bytes
 * @property {number|null} brotli
 * @property {{ bytes: number, brotli: number }|null} purged its size once
 * PurgeCSS has removed what the pages that link it and the build's scripts
 * never use
 * @property {number|null} removable the share of its Brotli size the purge
 * removes, 0 to 1, to three places
 * @property {string|null} error why it could not be purged
 */
/**
 * @typedef {Object} InlineEntry
 * @property {string} hash of the normalised block
 * @property {number} bytes of the normalised block
 * @property {number} pages how many pages carry it
 * @property {string[]} paths up to three of them, sorted
 * @property {string} text the normalised block
 */
/**
 * @typedef {Object} Finding
 * @property {'stylesheet-one-page'|'inline-style-repeated'|'rule-duplicated'|'inline-style-blocked-by-csp'} check
 * @property {string} detail
 * @property {string[]} [pages]
 * @property {string[]} [files]
 */
/**
 * The share of `before` that `after` removes, to three places.
 *
 * @param {number} before
 * @param {number} after
 * @returns {number}
 */
export function removableShare(before: number, after: number): number;
/**
 * Every finding, sorted by check and then detail.
 *
 * @param {Object} input
 * @param {number} input.pages how many pages the build has
 * @param {{ path: string, pages: string[] }[]} input.stylesheets each linked
 * stylesheet and the pages that link it
 * @param {{ text: string, pages: string[] }[]} input.inline each distinct
 * inline block and the pages that carry it
 * @param {{ total: number, listed: DuplicateRule[] }} input.duplicates
 * @param {string[]} input.blockers the CSP directives that block inline blocks
 * @returns {Finding[]}
 */
export function buildFindings({ pages, stylesheets, inline, duplicates, blockers, }: {
    pages: number;
    stylesheets: {
        path: string;
        pages: string[];
    }[];
    inline: {
        text: string;
        pages: string[];
    }[];
    duplicates: {
        total: number;
        listed: DuplicateRule[];
    };
    blockers: string[];
}): Finding[];
/**
 * @typedef {Object} CssAudit
 * @property {1} version
 * @property {number} pages
 * @property {StylesheetEntry[]} stylesheets sorted by path
 * @property {{ url: string, pages: number }[]} thirdParty sorted by URL
 * @property {InlineEntry[]} inline most pages first, then largest, then hash
 * @property {Finding[]} findings
 */
/**
 * The audit as the table on stdout.
 *
 * @param {CssAudit} audit
 * @returns {string}
 */
export function formatCssAudit(audit: CssAudit): string;
/**
 * The audit of the build folder at `root`.
 *
 * @param {string} root
 * @param {{ purge?: typeof purgeCss }} [options] `purge` is injectable for tests
 * @returns {Promise<CssAudit>}
 */
export function auditCss(root: string, { purge }?: {
    purge?: typeof purgeCss;
}): Promise<CssAudit>;
/**
 * The whole command: `{ code, out, err }` for `bin/kiss-ssg.js` to print.
 *
 * @param {string[]} argv everything after `css`
 * @param {{ cwd?: string, purge?: typeof purgeCss }} [options]
 * @returns {Promise<{ code: number, out: string, err: string }>}
 */
export function runCss(argv: string[], { cwd, purge }?: {
    cwd?: string;
    purge?: typeof purgeCss;
}): Promise<{
    code: number;
    out: string;
    err: string;
}>;
export const CSS_HELP: "kiss-ssg css <build-folder> [--out <file>]\n\nAudits how a built site partitions its CSS, from the files on disk, with no\nbrowser: the same answer on every run over the same folder.\n\n  <build-folder>     a site's build folder (public/ by default). Build the site\n                     first: css never runs the build\n\nPrints, for every same-origin stylesheet a page links: its Brotli size, how\nmany pages link it, and the share of it PurgeCSS could remove against the\npages that link it and the build's scripts. Then the inline <style> blocks\n(kiss's own, data-kiss-*, are left out), and the findings:\n\n  stylesheet-one-page          a stylesheet only one page links\n  inline-style-repeated        one inline block on two or more pages\n  rule-duplicated              one rule written out in two or more stylesheets\n  inline-style-blocked-by-csp  the _headers Content-Security-Policy blocks the\n                               inline blocks the pages carry\n\nOptions:\n\n  --out <file>       also write the audit as JSON\n  --help             this text\n\nExits 0 when the audit ran (the findings are advice, not a verdict), and 2 on a\nusage error or a target that is not a folder.";
/** How many duplicated rules the findings list before they only count. */
export const DUPLICATE_LIMIT: 50;
/** How many page paths an inline block and a finding name. */
export const PAGE_SAMPLE: 3;
/** How much of an inline block a finding quotes. */
export const QUOTE_LENGTH: 60;
export type CssArgs = {
    target: string | null;
    out: string | null;
    help: boolean;
    /**
     * a usage error
     */
    error: string | null;
};
export type StylesheetEntry = {
    /**
     * build-relative
     */
    path: string;
    /**
     * how many pages link it
     */
    pages: number;
    /**
     * a page links it and the build has no such file
     */
    missing: boolean;
    bytes: number | null;
    brotli: number | null;
    /**
     * its size once
     * PurgeCSS has removed what the pages that link it and the build's scripts
     * never use
     */
    purged: {
        bytes: number;
        brotli: number;
    } | null;
    /**
     * the share of its Brotli size the purge
     * removes, 0 to 1, to three places
     */
    removable: number | null;
    /**
     * why it could not be purged
     */
    error: string | null;
};
export type InlineEntry = {
    /**
     * of the normalised block
     */
    hash: string;
    /**
     * of the normalised block
     */
    bytes: number;
    /**
     * how many pages carry it
     */
    pages: number;
    /**
     * up to three of them, sorted
     */
    paths: string[];
    /**
     * the normalised block
     */
    text: string;
};
export type Finding = {
    check: "stylesheet-one-page" | "inline-style-repeated" | "rule-duplicated" | "inline-style-blocked-by-csp";
    detail: string;
    pages?: string[];
    files?: string[];
};
export type CssAudit = {
    version: 1;
    pages: number;
    /**
     * sorted by path
     */
    stylesheets: StylesheetEntry[];
    /**
     * sorted by URL
     */
    thirdParty: {
        url: string;
        pages: number;
    }[];
    /**
     * most pages first, then largest, then hash
     */
    inline: InlineEntry[];
    findings: Finding[];
};
export type DuplicateRule = {
    /**
     * the selector list, whitespace normalised
     */
    selector: string;
    /**
     * the enclosing at-rules (and, under CSS
     * nesting, rules), outermost first: `@media (min-width:600px)`
     */
    context: string | null;
    /**
     * the stylesheets it is written in, sorted
     */
    files: string[];
};
import { purgeCss } from './css-purge.js';
