/**
 * How a browser runs a `<script>` with these `type` and `language` attribute
 * values (`undefined`/`null` for an absent one): as a classic script, as a
 * module, or not at all (a data block such as `application/ld+json`, a gated
 * `text/plain`). The one answer for the gate, the wiring check and the audit,
 * so none of them lets through a type the others would catch.
 *
 * The HTML spec's rule, as Chromium 156 applies it (measured 2026-11-03,
 * `AIKB/upstream.md`): an empty type, or no type and no or an empty
 * `language`, is classic; otherwise the type (or `text/` + the language) is
 * stripped of ASCII whitespace and matched without case against the
 * JavaScript MIME types. `module` is matched without case but not stripped.
 *
 * @param {string|null|undefined} type
 * @param {string|null|undefined} [language]
 * @returns {'classic'|'module'|null}
 */
export function scriptKind(type: string | null | undefined, language?: string | null | undefined): "classic" | "module" | null;
/**
 * The origin of an absolute http(s) URL, or `null` for anything else (a
 * site-relative path, a placeholder-only value). A `{param}` placeholder in
 * the query or path does not stop the origin being read.
 *
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function originOf(url: string | null | undefined): string | null;
/**
 * Whether a URL is on one of `list`'s hosts (and under its path, when it has one).
 *
 * @param {string} url an absolute URL or a bare origin
 * @param {readonly { host: string, path?: string }[]} list
 * @returns {boolean}
 */
export function matchesHost(url: string, list: readonly {
    host: string;
    path?: string;
}[]): boolean;
/**
 * The categories at least one declared service belongs to, `necessary`
 * aside, in `CATEGORY_NAMES` order. Decided once per site, so every page's
 * banner, dialog and cookie hold the same set.
 *
 * @param {{ services: Record<string, { category: string }> }} resolved
 * @returns {ConsentCategoryName[]}
 */
export function categoriesInUse(resolved: {
    services: Record<string, {
        category: string;
    }>;
}): ConsentCategoryName[];
/**
 * The version that decides when a visitor is asked again: a hash of the
 * purposes and nothing else. It covers each category in use with its mode,
 * and each non-necessary service's name, category, provider and origins. It
 * excludes wording, theme, logo, position, cookie settings, the endpoint and
 * the cookie lists, so a colour change or a kiss upgrade that names one more
 * cookie asks nobody again (ICO: do not ask repeatedly), while a new service,
 * a new third party or a category changing mode asks everyone (ICO: ask again
 * when the purposes change). Service order in the config does not matter.
 *
 * @param {{ categories: Record<string, { mode: string }>, services: Record<string, ConsentService> }} resolved
 * @returns {string} 12 hex characters
 */
export function purposesVersion(resolved: {
    categories: Record<string, {
        mode: string;
    }>;
    services: Record<string, ConsentService>;
}): string;
/**
 * `config.consent`, resolved and checked. `undefined`, `null` and `false`
 * mean no consent manager. Every level refuses unknown keys, naming the valid
 * ones, except a service's own extra keys, which are placeholder values.
 *
 * @param {any} input
 * @returns {KissConsent|null}
 * @throws for any setting outside the contract (see the messages)
 */
export function resolveConsent(input: any): KissConsent | null;
/**
 * A service's placeholder values: the helper's hash over the service's own.
 * Only strings and numbers count; Handlebars' own hash entries are skipped.
 *
 * @param {ConsentService} service
 * @param {Record<string, any>} [hash]
 * @returns {Record<string, string>}
 */
export function serviceParams(service: ConsentService, hash?: Record<string, any>): Record<string, string>;
/**
 * Fill `{param}` placeholders, URL-encoding each value.
 *
 * @param {string} template
 * @param {Record<string, string>} params
 * @param {string} where named in the error, e.g. `consentScript "gtm"`
 * @returns {string}
 * @throws if a placeholder has no value
 */
export function fill(template: string, params: Record<string, string>, where: string): string;
/**
 * The Consent Mode `default` command's argument: every mapped type denied,
 * except the types of an `objection` category, which start granted;
 * `security_storage` granted; `wait_for_update` only under advanced mode
 * (in basic mode GTM loads after the choice, so nothing reads it — contract
 * Appendix A, S1).
 *
 * @param {KissConsent} resolved
 * @returns {Record<string, string|number>}
 */
export function consentModeDefault(resolved: KissConsent): Record<string, string | number>;
/**
 * The Consent Mode `update` command's argument for a set of granted
 * categories. A type two categories share is granted when either is.
 *
 * @param {Partial<Record<ConsentCategoryName, boolean>>} granted
 * @param {Record<ConsentCategoryName, string[]>} map
 * @returns {Record<string, 'granted'|'denied'>}
 */
export function consentModeState(granted: Partial<Record<ConsentCategoryName, boolean>>, map: Record<ConsentCategoryName, string[]>): Record<string, "granted" | "denied">;
/**
 * The visible text of some HTML, normalised: tags removed, the common
 * entities decoded, whitespace collapsed. What the banner hash is taken over,
 * so markup and attribute changes that a visitor cannot read do not change it.
 *
 * @param {string} html
 * @returns {string}
 */
export function textOf(html: string): string;
/**
 * The banner hash: 12 hex characters of the sha256 of the banner's and
 * dialog's visible text. Recorded in the report and sent with each choice, so
 * a choice can be matched to the words the visitor saw.
 *
 * @param {string} html
 * @returns {string}
 */
export function bannerHash(html: string): string;
/**
 * Whether a service is emitted gated, as a click-to-load embed, or plainly.
 *
 * @param {ConsentService} service
 * @param {KissConsent} resolved
 * @returns {'script'|'embed'|'none'}
 */
export function gatingOf(service: ConsentService, resolved: KissConsent): "script" | "embed" | "none";
/**
 * What the browser is handed, inlined into `{{consentHead}}`: only what the
 * client acts on. First-party cookie and storage names only, since nothing
 * else can be deleted.
 *
 * @param {KissConsent} resolved
 * @param {{ bannerHash?: string|null }} [extra] the banner and dialog's
 * links are in their markup, never here: the client reads no URL of its own
 * @returns {Record<string, any>}
 */
export function clientConfig(resolved: KissConsent, extra?: {
    bannerHash?: string | null;
}): Record<string, any>;
/**
 * The report's `consent` key, from the resolved config and each page's
 * write-time consent facts. `null` without a consent manager. Page paths go
 * through `real`, the staging-to-real mapping `thirdParty` uses, so a staged
 * check and a real build record the same paths.
 *
 * @param {{ consent: KissConsent|null, pages: PageConsentFacts[], real?: (p: string) => string, gatedPages?: string[] }} input
 * @returns {BuildConsent|null}
 */
export function consentReport({ consent, pages, real, gatedPages, }: {
    consent: KissConsent | null;
    pages: PageConsentFacts[];
    real?: (p: string) => string;
    gatedPages?: string[];
}): BuildConsent | null;
/**
 * A consent category a visitor can grant or refuse. `necessary` is not one of
 * these: it is always on, never offered and never stored.
 *
 * @typedef {'preferences'|'statistics'|'marketing'} ConsentCategoryName
 */
/**
 * How a category starts: `'consent'` is off until the visitor grants it;
 * `'objection'` is on until the visitor switches it off (UK PECR Schedule A1
 * para 5, the statistics exception), so only `statistics` may take it.
 *
 * @typedef {'consent'|'objection'} ConsentMode
 */
/**
 * @typedef {Object} ConsentCategory
 * @property {string} label
 * @property {string} description
 * @property {ConsentMode} mode
 */
/**
 * One thing a service stores: a cookie, or a `localStorage` key. Without a
 * `domain` it is the site's own (first-party): withdrawal deletes it. With one
 * it belongs to someone else's origin, which a page cannot clear, so it is
 * listed in `{{consentTable}}` and never deleted.
 *
 * @typedef {Object} ConsentStored
 * @property {string} name a trailing `*` matches any name with that prefix
 * @property {string} duration as the cookie table shows it, e.g. `'2 years'`
 * @property {string} description
 * @property {string|null} domain
 * @property {'first'|'third'} party
 */
/**
 * A declared service, resolved over its preset.
 *
 * @typedef {Object} ConsentService
 * @property {string} name
 * @property {string|null} preset the preset it was filled from
 * @property {'necessary'|ConsentCategoryName} category
 * @property {string} label
 * @property {string} provider
 * @property {string} description
 * @property {string|null} policy the provider's privacy policy URL
 * @property {string|null} src the script URL, `{param}` placeholders unfilled
 * @property {string|null} inline script run, gated, before `src`
 * @property {string|null} partial a site partial whose scripts are this service
 * @property {{ src: string|null, title: string|null, watch: string|null }|null} embed
 * @property {string[]} origins every third-party origin it loads, `src` and `embed.src` included
 * @property {ConsentStored[]} cookies
 * @property {ConsentStored[]} storage `localStorage` keys
 * @property {boolean} google a Google tag: Consent Mode governs it
 * @property {Record<string, string>} params placeholder values (`id`)
 */
/**
 * The Google Consent Mode block.
 *
 * @typedef {Object} ConsentGoogle
 * @property {'basic'|'advanced'} mode `'basic'` gates Google tags; `'advanced'` loads them ungated and lets Consent Mode alone govern them
 * @property {number} waitForUpdate milliseconds, emitted only under `'advanced'`
 * @property {boolean} adsDataRedaction
 * @property {boolean} urlPassthrough
 * @property {Record<ConsentCategoryName, string[]>} map the Consent Mode types each category grants
 */
/**
 * @typedef {Object} ConsentUi
 * @property {'bottom'|'top'} position
 * @property {string|null} logo an asset path
 * @property {string} partial the site partial that replaces the default banner, when it exists
 * @property {string|null} policy the page id the banner links for the cookie policy
 * @property {string|null} history the page id the dialog links for the
 * visitor's consent history, the page with `{{consentRecord}}`; `null` for none
 * @property {Record<string, string>} text
 * @property {Record<string, string>|false} theme
 */
/**
 * `config.consent`, resolved.
 *
 * @typedef {Object} KissConsent
 * @property {string} version decides when a visitor is asked again
 * @property {Record<ConsentCategoryName, ConsentCategory>} categories
 * @property {ConsentCategoryName[]} inUse the categories at least one service belongs to, site-wide
 * @property {Record<string, ConsentService>} services
 * @property {{ name: string, days: number, domain: string|null }} cookie
 * @property {ConsentGoogle} google
 * @property {string|null} endpoint where each choice is POSTed, or `null` for nowhere
 * @property {ConsentUi} ui
 */
/**
 * `config.consent` as a site writes it. Every key is optional but `services`;
 * the defaults are in this module. `false` (or leaving it out) means no
 * consent manager.
 *
 * @typedef {Object} KissConsentInput
 * @property {string} [version]
 * @property {Partial<Record<ConsentCategoryName, Partial<ConsentCategory>>>} [categories]
 * @property {Record<string, Record<string, any>>} [services]
 * @property {Partial<{ name: string, days: number, domain: string|null }>} [cookie]
 * @property {Partial<ConsentGoogle>} [google]
 * @property {string|null} [endpoint]
 * @property {Partial<Omit<ConsentUi, 'text'|'theme'>> & { text?: Record<string, string>, theme?: Record<string, string>|false }} [ui]
 */
/**
 * One page's consent facts, as the audit extracts them at write time.
 *
 * @typedef {Object} PageConsentFacts
 * @property {string} page the written path
 * @property {{ head: boolean, banner: string|null }|null} consent `banner` is the page's `data-kiss-consent-hash`
 */
/**
 * The report's `consent` key.
 *
 * @typedef {Object} BuildConsent
 * @property {string} version
 * @property {string} purposes `purposesVersion`, whether or not `version` was set by hand
 * @property {'basic'|'advanced'} mode
 * @property {{ hash: string, pages: string[] }[]} banners each banner text the build wrote, with its pages
 * @property {{ name: ConsentCategoryName, mode: ConsentMode }[]} categories
 * @property {{ name: string, category: string, gated: 'script'|'embed'|'none', origins: string[], cookies: string[] }[]} services
 * @property {string[]} pagesWithoutHead pages that gate a service with no `{{consentHead}}`
 */
/** @type {readonly ConsentCategoryName[]} */
export const CATEGORY_NAMES: readonly ConsentCategoryName[];
/** The Consent Mode v2 types a category may map to. */
export const CONSENT_TYPES: readonly string[];
export const DEFAULT_CATEGORIES: Readonly<{
    preferences: Readonly<{
        label: "Preferences";
        description: "Remember choices you make on this site, such as your country, so you do not have to make them again.";
        mode: "consent";
    }>;
    statistics: Readonly<{
        label: "Statistics";
        description: "Count visits and see how the site is used, so we can improve it.";
        mode: "consent";
    }>;
    marketing: Readonly<{
        label: "Marketing";
        description: "Let other companies, such as advertising networks and video hosts, recognise your browser, to measure and personalise adverts and to show their content.";
        mode: "consent";
    }>;
}>;
export const DEFAULT_TEXT: Readonly<{
    title: "Cookies on this site";
    body: "We use some cookies to make this site work. With your permission we would also like to set others: choose cookies to see what each one is for. You can change your mind at any time from the cookie settings link at the foot of every page.";
    accept: "Accept all";
    reject: "Reject all";
    choose: "Choose cookies";
    save: "Save choices";
    close: "Close";
    settings: "Cookie settings";
    policy: "Cookie policy";
    confirmation: "Your cookie choice is saved.";
    hide: "Hide";
    necessaryLabel: "Necessary";
    necessaryDescription: "Make the site work, and remember the choice you make here. They cannot be switched off.";
    embedNotice: "This content is hosted by {provider}, which may set cookies when it loads.";
    embedLoad: "Load it";
    embedAllow: "Always allow {provider}";
    embedWatch: "Open it on {provider}";
    historyLink: "See your consent history";
    historyTitle: "Your cookie choices";
    historyIntro: "Every cookie choice made in this browser on this site, newest first. It is kept in this browser only: another browser or device has its own.";
    historySent: "Each choice is also sent to this site as a record holding exactly these details: when you made it, which choice it was, your consent id, the version of the cookie purposes, what you chose for each kind of cookie, any service you always allowed, the version of the banner wording, and the page you were on.";
    historyId: "Your consent id, to quote if you ask what this site holds:";
    historyEmpty: "No cookie choice has been made in this browser yet.";
    historyUnavailable: "This browser does not let the site keep a history, so there is none to show.";
    historyNoScript: "Your history is shown with JavaScript, which is off in this browser.";
    historyWhen: "When";
    historyChoice: "Choice";
    historyAllowed: "Always allowed";
    historyVersion: "Purposes version";
    historyChanged: "The cookie purposes changed after this, so you were asked again.";
    historyYes: "Allowed";
    historyNo: "Refused";
    historyAccept: "Accepted all";
    historyReject: "Rejected all";
    historySave: "Saved choices";
    historyAllow: "Always allowed a service";
}>;
export const DEFAULT_THEME: Readonly<{
    background: "#ffffff";
    text: "#1a1a1a";
    accent: "#1d4ed8";
    accentText: "#ffffff";
    border: "#c8c8c8";
    radius: "6px";
    font: "inherit";
}>;
export const DEFAULT_UI: Readonly<{
    position: "bottom";
    logo: any;
    partial: "consent-banner";
    policy: "cookies";
    history: any;
}>;
export const DEFAULT_COOKIE: Readonly<{
    name: "kiss_consent";
    days: 182;
    domain: any;
}>;
export const DEFAULT_GOOGLE: Readonly<{
    mode: "basic";
    waitForUpdate: 500;
    adsDataRedaction: true;
    urlPassthrough: false;
    map: Readonly<{
        statistics: readonly string[];
        marketing: readonly string[];
        preferences: readonly string[];
    }>;
}>;
export const PRESETS: Readonly<{
    gtm: Readonly<{
        category: "marketing";
        label: "Google Tag Manager";
        provider: "Google";
        description: "Loads the analytics and advertising tags this site uses, as set up in Google Tag Manager.";
        policy: "https://policies.google.com/privacy";
        src: "https://www.googletagmanager.com/gtm.js?id={id}";
        inline: "window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});";
        origins: string[];
        cookies: {
            name: string;
            duration: string;
            description: string;
        }[];
        google: true;
    }>;
    gtag: Readonly<{
        category: "statistics";
        label: "Google Analytics";
        provider: "Google";
        description: "Counts visits and how the site is used.";
        policy: "https://policies.google.com/privacy";
        src: "https://www.googletagmanager.com/gtag/js?id={id}";
        inline: "window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('js',new Date());window.gtag('config','{id}');";
        origins: string[];
        cookies: {
            name: string;
            duration: string;
            description: string;
        }[];
        google: true;
    }>;
    youtube: Readonly<{
        category: "marketing";
        label: "YouTube";
        provider: "YouTube";
        description: "Plays videos hosted on YouTube.";
        policy: "https://policies.google.com/privacy";
        embed: {
            src: string;
            title: any;
            watch: string;
        };
        origins: string[];
        storage: {
            name: string;
            duration: string;
            description: string;
            domain: string;
        }[];
    }>;
    vimeo: Readonly<{
        category: "marketing";
        label: "Vimeo";
        provider: "Vimeo";
        description: "Plays videos hosted on Vimeo.";
        policy: "https://vimeo.com/privacy";
        embed: {
            src: string;
            title: any;
            watch: string;
        };
        origins: string[];
        cookies: {
            name: string;
            duration: string;
            description: string;
            domain: string;
        }[];
    }>;
    'google-maps': Readonly<{
        category: "marketing";
        label: "Google Maps";
        provider: "Google";
        description: "Shows a map hosted by Google.";
        policy: "https://policies.google.com/privacy";
        embed: {
            src: any;
            title: any;
            watch: any;
        };
        origins: string[];
    }>;
}>;
/**
 * Hosts whose scripts or frames store or track, for the `consent-missing`
 * finding on a site with no consent manager. A `*.` host matches any
 * subdomain; a `path` must prefix the URL's path.
 *
 * @type {readonly { host: string, path?: string }[]}
 */
export const TRACKER_ORIGINS: readonly {
    host: string;
    path?: string;
}[];
/**
 * What marks a page as serving Google's publisher ads, which need a
 * Google-certified CMP (research §3): a loader host, an inline call, or an
 * ad slot.
 */
export const ADS_CMP_SIGNATURES: Readonly<{
    hosts: readonly ({
        host: string;
        path: string;
    } | {
        host: string;
        path?: undefined;
    })[];
    inline: readonly string[];
    attribute: "data-ad-client";
}>;
/**
 * A consent category a visitor can grant or refuse. `necessary` is not one of
 * these: it is always on, never offered and never stored.
 */
export type ConsentCategoryName = "preferences" | "statistics" | "marketing";
/**
 * How a category starts: `'consent'` is off until the visitor grants it;
 * `'objection'` is on until the visitor switches it off (UK PECR Schedule A1
 * para 5, the statistics exception), so only `statistics` may take it.
 */
export type ConsentMode = "consent" | "objection";
export type ConsentCategory = {
    label: string;
    description: string;
    mode: ConsentMode;
};
/**
 * One thing a service stores: a cookie, or a `localStorage` key. Without a
 * `domain` it is the site's own (first-party): withdrawal deletes it. With one
 * it belongs to someone else's origin, which a page cannot clear, so it is
 * listed in `{{consentTable}}` and never deleted.
 */
export type ConsentStored = {
    /**
     * a trailing `*` matches any name with that prefix
     */
    name: string;
    /**
     * as the cookie table shows it, e.g. `'2 years'`
     */
    duration: string;
    description: string;
    domain: string | null;
    party: "first" | "third";
};
/**
 * A declared service, resolved over its preset.
 */
export type ConsentService = {
    name: string;
    /**
     * the preset it was filled from
     */
    preset: string | null;
    category: "necessary" | ConsentCategoryName;
    label: string;
    provider: string;
    description: string;
    /**
     * the provider's privacy policy URL
     */
    policy: string | null;
    /**
     * the script URL, `{param}` placeholders unfilled
     */
    src: string | null;
    /**
     * script run, gated, before `src`
     */
    inline: string | null;
    /**
     * a site partial whose scripts are this service
     */
    partial: string | null;
    embed: {
        src: string | null;
        title: string | null;
        watch: string | null;
    } | null;
    /**
     * every third-party origin it loads, `src` and `embed.src` included
     */
    origins: string[];
    cookies: ConsentStored[];
    /**
     * `localStorage` keys
     */
    storage: ConsentStored[];
    /**
     * a Google tag: Consent Mode governs it
     */
    google: boolean;
    /**
     * placeholder values (`id`)
     */
    params: Record<string, string>;
};
/**
 * The Google Consent Mode block.
 */
export type ConsentGoogle = {
    /**
     * `'basic'` gates Google tags; `'advanced'` loads them ungated and lets Consent Mode alone govern them
     */
    mode: "basic" | "advanced";
    /**
     * milliseconds, emitted only under `'advanced'`
     */
    waitForUpdate: number;
    adsDataRedaction: boolean;
    urlPassthrough: boolean;
    /**
     * the Consent Mode types each category grants
     */
    map: Record<ConsentCategoryName, string[]>;
};
export type ConsentUi = {
    position: "bottom" | "top";
    /**
     * an asset path
     */
    logo: string | null;
    /**
     * the site partial that replaces the default banner, when it exists
     */
    partial: string;
    /**
     * the page id the banner links for the cookie policy
     */
    policy: string | null;
    /**
     * the page id the dialog links for the
     * visitor's consent history, the page with `{{consentRecord}}`; `null` for none
     */
    history: string | null;
    text: Record<string, string>;
    theme: Record<string, string> | false;
};
/**
 * `config.consent`, resolved.
 */
export type KissConsent = {
    /**
     * decides when a visitor is asked again
     */
    version: string;
    categories: Record<ConsentCategoryName, ConsentCategory>;
    /**
     * the categories at least one service belongs to, site-wide
     */
    inUse: ConsentCategoryName[];
    services: Record<string, ConsentService>;
    cookie: {
        name: string;
        days: number;
        domain: string | null;
    };
    google: ConsentGoogle;
    /**
     * where each choice is POSTed, or `null` for nowhere
     */
    endpoint: string | null;
    ui: ConsentUi;
};
/**
 * `config.consent` as a site writes it. Every key is optional but `services`;
 * the defaults are in this module. `false` (or leaving it out) means no
 * consent manager.
 */
export type KissConsentInput = {
    version?: string;
    categories?: Partial<Record<ConsentCategoryName, Partial<ConsentCategory>>>;
    services?: Record<string, Record<string, any>>;
    cookie?: Partial<{
        name: string;
        days: number;
        domain: string | null;
    }>;
    google?: Partial<ConsentGoogle>;
    endpoint?: string | null;
    ui?: Partial<Omit<ConsentUi, "text" | "theme">> & {
        text?: Record<string, string>;
        theme?: Record<string, string> | false;
    };
};
/**
 * One page's consent facts, as the audit extracts them at write time.
 */
export type PageConsentFacts = {
    /**
     * the written path
     */
    page: string;
    /**
     * `banner` is the page's `data-kiss-consent-hash`
     */
    consent: {
        head: boolean;
        banner: string | null;
    } | null;
};
/**
 * The report's `consent` key.
 */
export type BuildConsent = {
    version: string;
    /**
     * `purposesVersion`, whether or not `version` was set by hand
     */
    purposes: string;
    mode: "basic" | "advanced";
    /**
     * each banner text the build wrote, with its pages
     */
    banners: {
        hash: string;
        pages: string[];
    }[];
    categories: {
        name: ConsentCategoryName;
        mode: ConsentMode;
    }[];
    services: {
        name: string;
        category: string;
        gated: "script" | "embed" | "none";
        origins: string[];
        cookies: string[];
    }[];
    /**
     * pages that gate a service with no `{{consentHead}}`
     */
    pagesWithoutHead: string[];
};
