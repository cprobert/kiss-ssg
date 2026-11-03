/**
 * Whether a script body calls `document.write` or `writeln`. Revived after
 * consent, it would replace the whole page (contract Appendix A, S3).
 *
 * @param {string} js
 * @returns {boolean}
 */
export function findDocumentWrite(js: string): boolean;
/**
 * The markup `{{consentScript}}` writes for one service.
 *
 * - With no body and no partial: the service's `inline` script, then its
 *   `src`, each gated (or plain, for a `necessary` service or a Google tag
 *   under advanced mode).
 * - With a body (the block form): every `<script>` in it is gated; a body
 *   with no `<script>` tag is taken as one script's text.
 * - With a rendered partial: the same, over the partial's HTML.
 *
 * @param {string} name
 * @param {ConsentService} service
 * @param {{ consent: KissConsent, params: Record<string, string>, body?: string|null, partialHtml?: string|null, src?: string|null }} opts
 * @returns {string}
 * @throws on a missing placeholder value, `document.write` in an inline body,
 * an iframe in a block or partial, or a service with nothing to load
 */
export function gatedScript(name: string, service: ConsentService, { consent, params, body, partialHtml, src }: {
    consent: KissConsent;
    params: Record<string, string>;
    body?: string | null;
    partialHtml?: string | null;
    src?: string | null;
}): string;
/**
 * The markup `{{consentEmbed}}` writes: a click-to-load placeholder, the
 * provider's own link, and the frame held in a `<template>` until revealed
 * (no request is made before: Appendix A, S4). A `necessary` service gets the
 * plain iframe.
 *
 * @param {string} name
 * @param {ConsentService} service
 * @param {{ consent: KissConsent, params: Record<string, string>, src?: string|null, title?: string|null }} opts
 * @returns {string}
 * @throws on a missing title or src, or a missing placeholder value in the src
 */
export function embedMarkup(name: string, service: ConsentService, { consent, params, src, title }: {
    consent: KissConsent;
    params: Record<string, string>;
    src?: string | null;
    title?: string | null;
}): string;
/**
 * What is wrong with a rendered page's consent wiring, one sentence each;
 * empty when nothing is. Read from the bytes, so a hand-written gated tag is
 * checked too.
 *
 * 1. Gated markup, or a settings control, with no consent head.
 * 2. A head with no banner, or more than one head or banner.
 * 3. An executable script before the head's (data blocks such as JSON-LD are
 *    exempt), which would run before Consent Mode's default is set.
 * 4. One service's script src twice on a page, which would load it twice.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function consentWiringProblems(html: string): string[];
export type ConsentService = import("./consent.js").ConsentService;
export type KissConsent = import("./consent.js").KissConsent;
