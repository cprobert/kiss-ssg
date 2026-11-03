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
 * What `{{consentHead}}` writes: the inline part, called with the page's
 * config as `inlineJson`, then the cached file, deferred.
 *
 * @param {Record<string, any>} cfg `clientConfig()` from `lib/consent.js`
 * @param {string} clientUrl the cached file's URL, as `consentUrl` writes it
 * @returns {string}
 */
export function consentHeadScript(cfg: Record<string, any>, clientUrl: string): string;
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
