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
 * The `<script>` `{{consentHead}}` writes: the client, called with the page's
 * config, as `inlineJson`.
 *
 * @param {Record<string, any>} cfg `clientConfig()` from `lib/consent.js`
 * @returns {string}
 */
export function consentHeadScript(cfg: Record<string, any>): string;
/**
 * @param {any} win the page's `window`
 * @param {any} cfg `clientConfig()` from `lib/consent.js`
 */
export function kissConsentClient(win: any, cfg: any): void;
