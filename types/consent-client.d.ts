/**
 * A value as JSON that is safe inside an inline `<script>`: `<`, U+2028 and
 * U+2029 escaped, so no site text (a banner wording with `</script>` in it)
 * can end the script. Shared with `lib/consent-record.js`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function inlineJson(value: unknown): string;
/**
 * The cached file's source: the client, called on `window`. It holds no
 * site config, so it is the same for every site on one kiss version.
 *
 * @returns {string}
 */
export function consentClientSource(): string;
/**
 * The cached file's name, `kiss-consent.<10 hex of its source's sha256>.js`:
 * it changes only when the client's code does, so it can be cached for good.
 *
 * @returns {string}
 */
export function consentClientName(): string;
/**
 * What the inline part needs to load the cached file: its name, the page's
 * own file, and the root to use for an address that is not the page's.
 *
 * @typedef {Object} ConsentClientFile
 * @property {string} name `consentClientName()`
 * @property {string|null} page the page's build-relative file
 * (`guide/index.html`); `null` when the page has none, and `root` is used
 * @property {string} root the root `siteUrl` names, as a path with its
 * slash (`/`, or `/site/` under a prefix)
 */
/**
 * What `{{consentHead}}` writes: the inline part, called with the page's
 * config as `inlineJson`. It adds the cached file's tag itself, at the URL
 * the browser's address gives (`rootOf`), so no tag for it is written here.
 *
 * @param {Record<string, any>} cfg `clientConfig()` from `lib/consent.js`
 * @param {ConsentClientFile} client the cached file
 * @returns {string}
 */
export function consentHeadScript(cfg: Record<string, any>, client: ConsentClientFile): string;
/**
 * What the inline part needs to load the cached file: its name, the page's
 * own file, and the root to use for an address that is not the page's.
 */
export type ConsentClientFile = {
    /**
     * `consentClientName()`
     */
    name: string;
    /**
     * the page's build-relative file
     * (`guide/index.html`); `null` when the page has none, and `root` is used
     */
    page: string | null;
    /**
     * the root `siteUrl` names, as a path with its
     * slash (`/`, or `/site/` under a prefix)
     */
    root: string;
};
/**
 * The inline part.
 *
 * @param {any} win the page's `window`
 * @param {any} cfg `clientConfig()` from `lib/consent.js`
 */
export function kissConsentHead(win: any, cfg: any): void;
/**
 * The cached part, run once by the deferred file.
 *
 * @param {any} win the page's `window`
 */
export function kissConsentClient(win: any): void;
