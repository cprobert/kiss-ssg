/**
 * @typedef {Object} SecurityHeadersWriteResult
 * @property {'none'|'written'} status `none` when `securityHeaders` is off
 * @property {Record<string, string>} headers what kiss wrote, after the
 * site's own headers were taken out
 * @property {string[]} skipped headers the site already sets, left to it
 * @property {string[]} files every path written, `security-headers.json` first
 * @property {string[]} formats the formats that ran
 * @property {boolean} unset the headers are on and no host was set
 * @property {string[]} uncovered hosts kiss cannot write headers for
 */
/**
 * The header names a `_headers` file sets for every page (`/*`), lower-cased.
 * kiss's own blocks are left out: they are rewritten on every build.
 *
 * @param {string|null} file the `_headers` text
 * @returns {Set<string>}
 */
export function siteWideHeaderNames(file: string | null): Set<string>;
/**
 * The baseline less every header the site already sets for every page.
 *
 * @param {Set<string>} siteNames from `siteWideHeaderNames`
 * @returns {{ headers: Record<string, string>, skipped: string[] }}
 */
export function securityHeaders(siteNames: Set<string>): {
    headers: Record<string, string>;
    skipped: string[];
};
/**
 * kiss's security block for a `_headers` file: one `/*` rule.
 *
 * @param {Record<string, string>} headers
 * @returns {string}
 */
export function renderSecurityBlock(headers: Record<string, string>): string;
/**
 * The Firebase fragment, to merge into `firebase.json`'s `headers` array.
 * Firebase overwrites HSTS on its own `*.web.app` subdomains; only a custom
 * domain serves this value.
 *
 * @param {Record<string, string>} headers
 * @returns {string}
 */
export function renderFirebaseSecurityHeaders(headers: Record<string, string>): string;
/**
 * Write this build's security headers into `root`. Runs after the cache
 * headers, so a `_headers` the cache writer made is merged into, not replaced.
 *
 * @param {Object} input
 * @param {import('./config.js').KissConfig} input.config
 * @param {string} input.root where the build is being written
 * @param {{ claim(file: string, owner: string): void }} [input.outputs]
 * @returns {Promise<SecurityHeadersWriteResult>}
 */
export function writeSecurityHeaders({ config, root, outputs }: {
    config: import("./config.js").KissConfig;
    root: string;
    outputs?: {
        claim(file: string, owner: string): void;
    };
}): Promise<SecurityHeadersWriteResult>;
/** The baseline, in the order it is written. */
export const SECURITY_HEADERS: Readonly<{
    'Strict-Transport-Security': "max-age=63072000";
    'X-Content-Type-Options': "nosniff";
    'Referrer-Policy': "strict-origin-when-cross-origin";
    'Permissions-Policy': "geolocation=(), camera=(), microphone=()";
}>;
/** The marker lines around kiss's security block in `_headers`. */
export const SECURITY_BLOCK: Readonly<{
    start: "# kiss-ssg: security headers (generated, do not edit)";
    end: "# kiss-ssg: end of security headers";
}>;
export type SecurityHeadersWriteResult = {
    /**
     * `none` when `securityHeaders` is off
     */
    status: "none" | "written";
    /**
     * what kiss wrote, after the
     * site's own headers were taken out
     */
    headers: Record<string, string>;
    /**
     * headers the site already sets, left to it
     */
    skipped: string[];
    /**
     * every path written, `security-headers.json` first
     */
    files: string[];
    /**
     * the formats that ran
     */
    formats: string[];
    /**
     * the headers are on and no host was set
     */
    unset: boolean;
    /**
     * hosts kiss cannot write headers for
     */
    uncovered: string[];
};
