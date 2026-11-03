/**
 * What the viewer's script is handed: the log's name, the labels, and the
 * wording it writes.
 *
 * @param {KissConsent} resolved
 * @returns {Record<string, any>}
 */
export function recordConfig(resolved: KissConsent): Record<string, any>;
/**
 * The history page's markup and script. Everything that changes with the
 * visitor sits in `[data-kiss-consent-ui]`, which the Markdown copy drops;
 * the heading and the statements stay in it.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function recordHtml(resolved: KissConsent): string;
/** @typedef {import('./consent.js').KissConsent} KissConsent */
/**
 * The history section's `id`, which the settings dialog's `ui.history` link
 * names as its fragment, so a visitor lands on the history rather than at the
 * top of a long privacy page (the clean room, 2026-11-03).
 */
export const RECORD_ID: "kiss-consent-history";
export type KissConsent = import("./consent.js").KissConsent;
/**
 * The viewer's browser side, inlined through `Function.prototype.toString` as
 * the client is. It uses nothing from this module's scope. It builds every
 * row with DOM calls and `textContent`, never HTML, because the log is the
 * visitor's to edit and nothing in it may become markup.
 *
 * @param {any} win the page's `window`
 * @param {any} cfg `recordConfig()`
 */
export function kissConsentRecord(win: any, cfg: any): void;
