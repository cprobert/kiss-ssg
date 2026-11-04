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
 * @param {boolean} [options.extensionLess] `config.extensionLess`, for
 * resolving a cross-page fragment the way the link scan resolves its path
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`, for
 * the same reason: a relative href resolves against the page's served URL
 * @param {string|null} [options.privacyPage] `config.audit.privacyPage`: the
 * id of the privacy page, when it is not the convention (id `privacy`, else
 * `privacy.html` or `privacy/index.html`)
 * @param {import('./consent.js').KissConsent|null} [options.consent]
 * `config.consent`, resolved: the consent checks read its services
 * @returns {AuditResult}
 */
export function auditBuild({ pages, buildDir, siteUrl, ignore, ownsFolder, debugWritten, extensionLess, trailingSlash, privacyPage, consent, }: {
    pages: AuditPage[];
    buildDir: string;
    siteUrl?: string | null;
    ignore?: readonly string[];
    ownsFolder?: boolean;
    debugWritten?: boolean;
    extensionLess?: boolean;
    trailingSlash?: boolean;
    privacyPage?: string | null;
    consent?: import("./consent.js").KissConsent | null;
}): AuditResult;
/**
 * The third-party origins the build's pages fetch from. First-party is a
 * relative URL (never recorded) or an absolute one whose host equals
 * `siteUrl`'s, with a leading `www.` dropped on both sides — the host, not
 * the origin, so `http:` and a port do not make the site's own assets
 * someone else's.
 *
 * @param {Object} options
 * @param {{ buildTo: string, facts: PageFacts|null }[]} options.pages
 * @param {string|null} [options.siteUrl] `config.siteUrl`
 * @returns {ThirdPartyOrigins|null} `null` when no page wrote HTML facts
 */
export function thirdPartyOrigins({ pages, siteUrl }: {
    pages: {
        buildTo: string;
        facts: PageFacts | null;
    }[];
    siteUrl?: string | null;
}): ThirdPartyOrigins | null;
/**
 * Every check the audit can run, in the order findings are reported. These ids
 * are public vocabulary: `config.audit.ignore`, the report's `check` field and
 * the summary lines all use them, so renaming one is a breaking change.
 */
export const CHECKS: readonly ["title-missing", "title-duplicate", "description-missing", "description-duplicate", "og-image-missing", "og-image-relative", "canonical-missing", "img-alt-missing", "h1-count", "heading-skip", "viewport-zoom-lock", "href-hash", "fragment-missing", "favicon-missing", "not-found-missing", "site-url-local", "debug-dump", "stray-file", "console-log", "privacy-link-missing", "placeholder-left", "checkbox-prechecked", "consent-missing", "consent-ungated", "consent-ads-cmp", "consent-objection-third-party", "consent-settings-missing", "consent-google-advanced", "consent-records-missing", "consent-history-missing"];
/** @typedef {typeof CHECKS[number]} CheckId */
/**
 * The words that make a pre-ticked checkbox a consent to marketing:
 * `checkbox-prechecked` fires when a checked box's label contains one, matched
 * whole-word and case-insensitively, so "renews" never matches "news". A space
 * also matches a hyphen ("third-party"). "Updates" is deliberately absent: it
 * catches service updates, which are not marketing (2026-11-02 critique).
 */
export const MARKETING_WORDS: readonly string[];
/**
 * How the link scan resolves a page's references, handed to the audit's own
 * resolutions so a fragment or a privacy link lands where `checkLinks` would
 * land the same href.
 */
export type Resolving = {
    extensionLess: boolean;
    trailingSlash: boolean;
};
export type CheckId = (typeof CHECKS)[number];
/**
 * What a page fetches from an absolute origin, and as what.
 *
 * - `script`, `iframe`, `form-action`: the element's `src` or `action`
 * - `img`: an `<img>` `src`/`srcset`, a `<source srcset>`, a `<video poster>`
 * - `media`: a `<video>`/`<audio>` `src`, a `<source src>`
 * - `stylesheet`, `preconnect`, `dns-prefetch`: a `<link>` with that rel token
 * - `preload`, or `preload:<as>` when the link says what it preloads
 *   (`preload:font`)
 */
export type PageOrigin = {
    /**
     * `https://fonts.gstatic.com` — scheme, host and any
     * port, as WHATWG `URL` gives it; a protocol-relative `//host` reads as https
     */
    origin: string;
    kind: string;
    /**
     * the consent service it is gated behind: a
     * `<script type="text/plain" data-kiss-service>`'s `data-src`, or a consent
     * embed's frame. Fetched only after the visitor allows it
     */
    service?: string;
};
/**
 * What a page carries of the consent manager.
 */
export type PageConsent = {
    /**
     * a `{{consentHead}}` script
     */
    head: boolean;
    /**
     * the banner's `data-kiss-consent-hash`
     */
    banner: string | null;
    /**
     * a `data-kiss-consent-action="settings"` control
     */
    settings: boolean;
    /**
     * any gated script or consent embed
     */
    gated: boolean;
    /**
     * `{{consentRecord}}`'s section, the visitor's
     * consent history
     */
    record: boolean;
    /**
     * Google loader and ad markers found in
     * ungated executable inline scripts (`adsbygoogle`, `googletag.cmd`,
     * `gtm.js`, `gtag/js`) and `data-ad-client` on an `<ins>`, sorted
     */
    signatures: string[];
};
/**
 * One field of a form, as written.
 */
export type FormField = {
    /**
     * `input`'s `type` lowercased (`text` when absent),
     * or `select` / `textarea`
     */
    type: string;
    name: string | null;
    autocomplete: string | null;
};
/**
 * One `<form>` and the fields inside it.
 */
export type PageForm = {
    action: string | null;
    /**
     * the form's `netlify-honeypot` attribute:
     * the name of the field that is a trap for bots, not a question
     */
    honeypot: string | null;
    /**
     * every `input`, `select` and `textarea`
     * between the form's tags, in document order
     */
    fields: FormField[];
};
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
    /**
     * the content of every `<meta name="viewport">`,
     * in document order
     */
    viewports: string[];
    /**
     * the page carries a `<base href>`, so a bare
     * `#fragment` on it resolves against that URL rather than the page
     */
    base: boolean;
    /**
     * every `id`, and every `<a name>`, a fragment could
     * land on — inline `<svg>` included, `<template>` content not — decoded,
     * sorted and deduplicated
     */
    ids: string[];
    /**
     * every `<a>`/`<area>` `href` that carries a
     * `#`, decoded, sorted and deduplicated
     */
    fragmentLinks: string[];
    /**
     * every absolute `http(s)` or `//host`
     * origin a `script`, `iframe`, `img`, `source`, `video`, `audio`, `form` or
     * `<link rel=stylesheet|preload|preconnect|dns-prefetch>` names, sorted by
     * origin then kind. Never an `<a>`, and never `rel=canonical`/`alternate`:
     * a browser fetches nothing from those. Whether one is third-party depends
     * on `siteUrl`, so it is decided later (`thirdPartyOrigins`)
     */
    origins: PageOrigin[];
    /**
     * every `<form>`, in document order
     */
    forms: PageForm[];
    /**
     * every `<a>`/`<area>` `href` a reader can follow
     * (not a bare `#fragment`, not `mailto:`/`tel:`/`javascript:`/`data:`),
     * decoded, sorted and deduplicated
     */
    anchors: string[];
    /**
     * the text of every `<mark>`, then every
     * `[to confirm…` outside one — unfinished copy a person has to replace
     */
    placeholders: string[];
    /**
     * the label text of every `<input
     * type="checkbox" checked>`, from `for`/`id`, a wrapping `<label>`,
     * `aria-label` and `aria-labelledby`, joined; `''` for an unlabelled one
     */
    prechecked: string[];
    /**
     * the consent manager's markup on the page;
     * absent from facts parked by an engine from before it existed
     */
    consent?: PageConsent;
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
    /**
     * the page's identity, so the privacy page can be
     * found by its id
     */
    id?: string | null;
    /**
     * the learning package it belongs to: an LMS
     * opens it as its file, so no `trailingSlash` policy moves its folder
     */
    package?: string;
};
/**
 * What the build fetches from origins other than the site's own, per page.
 * A fact, not a finding: the privacy review's inventory starts here.
 */
export type ThirdPartyOrigins = {
    /**
     * the `siteUrl` first-party was decided
     * against; `null` when it is unset or local, and then every absolute origin
     * is listed, because which of them is the site's own cannot be told
     */
    siteUrl: string | null;
    /**
     * `services` is present on an origin a consent service gates: fetched only
     * after the visitor allows it
     * the pages that fetch from one, sorted by page; origins sorted, kinds sorted
     */
    pages: {
        page: string;
        origins: {
            origin: string;
            kinds: string[];
            services?: string[];
        }[];
    }[];
    /**
     * every third-party origin, distinct and sorted
     */
    origins: string[];
};
