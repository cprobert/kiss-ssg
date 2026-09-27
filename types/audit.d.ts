/**
 * The launch-readiness facts one page's output carries.
 *
 * @param {string} html one page's output, exactly as it was written to disk
 * @param {string} outputPath where it was written; its extension decides first
 * whether this is a page at all — a file extension is a statement about
 * processing, so a `.json` that happens to hold markup is still data
 * @returns {PageFacts}
 */
export function extractPageFacts(html: string, outputPath: string): PageFacts;
/**
 * Decides every launch-readiness finding for one settled build.
 *
 * @param {Object} options
 * @param {AuditPage[]} options.pages the pages that wrote bytes
 * @param {string} options.buildDir the folder they were written into —
 * `_writeRoot`, which is the staging folder under `'atomic'` and under check
 * @param {string|null} [options.siteUrl] the instance's `config.siteUrl`
 * @param {readonly string[]} [options.ignore] checks not to run
 * @param {boolean} [options.ownsFolder] `config.cleanBuild !== false`; when
 * false the three folder-walk checks are skipped and listed in `skipped`
 * @param {boolean} [options.debugWritten] `viewStats()` wrote `debug.json`
 * @returns {AuditResult}
 */
export function auditBuild({ pages, buildDir, siteUrl, ignore, ownsFolder, debugWritten, }: {
    pages: AuditPage[];
    buildDir: string;
    siteUrl?: string | null;
    ignore?: readonly string[];
    ownsFolder?: boolean;
    debugWritten?: boolean;
}): AuditResult;
/**
 * Every check the audit can run, in the order findings are reported. These ids
 * are public vocabulary: `config.audit.ignore`, the report's `check` field and
 * the summary lines all use them, so renaming one is a breaking change.
 */
export const CHECKS: readonly ["title-missing", "title-duplicate", "description-missing", "description-duplicate", "og-image-missing", "og-image-relative", "canonical-missing", "img-alt-missing", "h1-count", "heading-skip", "favicon-missing", "not-found-missing", "site-url-local", "debug-dump", "stray-file", "console-log"];
export type CheckId = (typeof CHECKS)[number];
/**
 * What one written page says about itself, extracted at write time from the
 * same minified bytes `KissPage.links` comes from.
 */
export type PageFacts = {
    /**
     * the output is an HTML document: an `.html`/`.htm`
     * path whose bytes carry `<html` or `<body`. Nothing else is audited as a page
     */
    html: boolean;
    /**
     * the first `<title>`'s text, decoded and
     * whitespace-collapsed; `''` when present and empty
     */
    title: string | null;
    /**
     * `<meta name="description">`'s content
     */
    description: string | null;
    /**
     * `og:image`'s content, via `property=` or `name=`
     */
    ogImage: string | null;
    /**
     * `<link rel="canonical">`'s href
     */
    canonical: string | null;
    /**
     * any `<link>` whose rel tokens include `icon`
     */
    icon: boolean;
    /**
     * the src of each `<img>` with no `alt`
     * attribute at all (`alt=""` is present); `''` for an image with no src
     */
    imgMissingAlt: string[];
    /**
     * heading levels 1–6, in document order
     */
    headings: number[];
};
export type AuditFinding = {
    check: CheckId;
    /**
     * the page's `buildTo`, the walked file, or
     * `null` for a finding about the whole site
     */
    page: string | null;
    /**
     * the value that tripped the check, when one
     * helps find it in a template
     */
    detail: string | null;
};
export type AuditResult = {
    /**
     * HTML pages audited
     */
    checked: number;
    /**
     * the ignore list, deduplicated and sorted
     */
    ignored: CheckId[];
    /**
     * checks not run because the build does not own
     * its folder, in `CHECKS` order
     */
    skipped: CheckId[];
    /**
     * sorted by check (in `CHECKS` order), then
     * page, then detail
     */
    findings: AuditFinding[];
};
/**
 * One written page as the audit needs it.
 */
export type AuditPage = {
    /**
     * where it was written
     */
    buildTo: string;
    /**
     * `KissPage.audit`
     */
    facts: PageFacts | null;
    /**
     * the page names another URL as its
     * canonical, so it is a copy and a duplicate title there is expected
     */
    canonicalElsewhere?: boolean;
    /**
     * the page's own merged `siteUrl`
     */
    siteUrl?: string | null;
};
