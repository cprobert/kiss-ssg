/** @typedef {import('./consent.js').KissConsent} KissConsent */
/** @typedef {import('./consent.js').ConsentUi} ConsentUi */
/** @typedef {import('./consent.js').ConsentService} ConsentService */
/** @typedef {import('./consent.js').ConsentStored} ConsentStored */
/**
 * Escape text for HTML content or a double- or single-quoted attribute.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s: unknown): string;
/**
 * The default banner. `''` when no service needs a choice.
 *
 * @param {KissConsent} resolved
 * @param {{ logoUrl?: string|null, policyUrl?: string|null }} [options]
 * @returns {string}
 */
export function bannerHtml(resolved: KissConsent, { logoUrl, policyUrl }?: {
    logoUrl?: string | null;
    policyUrl?: string | null;
}): string;
/**
 * The settings dialog. Category checkboxes carry no `checked`: the client
 * sets each from the stored choice. `''` when no service needs a choice.
 *
 * @param {KissConsent} resolved
 * @param {{ policyUrl?: string|null, historyUrl?: string|null }} [options]
 * `historyUrl` is `ui.history`'s page, linked beside the policy (D12)
 * @returns {string}
 */
export function settingsHtml(resolved: KissConsent, { policyUrl, historyUrl }?: {
    policyUrl?: string | null;
    historyUrl?: string | null;
}): string;
/**
 * The cookie declaration: one table for `necessary`, which begins with kiss's
 * own two cookies, then one per category in use.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function tableHtml(resolved: KissConsent): string;
/**
 * The control that reopens the settings, for every page's footer.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function settingsControlHtml(resolved: KissConsent): string;
/**
 * The default theme's CSS, or `''` under `ui.theme: false`. Theme values were
 * checked by `resolveConsent` to hold no `;`, `{`, `}`, `<` or `>`.
 *
 * @param {ConsentUi} ui
 * @returns {string}
 */
export function themeCss(ui: ConsentUi): string;
export type KissConsent = import("./consent.js").KissConsent;
export type ConsentUi = import("./consent.js").ConsentUi;
export type ConsentService = import("./consent.js").ConsentService;
export type ConsentStored = import("./consent.js").ConsentStored;
