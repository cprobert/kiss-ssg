/**
 * The `<script>` `{{consentHead}}` writes: the client, called with the page's
 * config. The config is JSON with `<`, U+2028 and U+2029 escaped, so no site
 * text (a banner wording with `</script>` in it) can end the script.
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
