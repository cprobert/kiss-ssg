/**
 * The service `{{embed "<name>"}}` loads: the site's declared service under
 * `config.consent`, otherwise the preset of that name.
 *
 * @param {string} name
 * @param {KissConsent|null} consent the site's, or null for a facade
 * @returns {ConsentService}
 * @throws for a name the site has not declared (under `config.consent`), or
 * one with no embed preset (without it)
 */
export function embedService(name: string, consent: KissConsent | null): ConsentService;
/**
 * `config.embeds`: the embed wording of a site with no `config.consent`.
 * One home for the words: a consent site's wording is `config.consent.ui.text`,
 * so `embeds` beside `consent` is refused rather than merged, and an author
 * never has to ask which of the two wins.
 *
 * @param {unknown} input `config.embeds` as given
 * @param {unknown} consent `config.consent` as resolved: `null` when it is
 * off, which `consent: false` is
 * @returns {{ text: Record<string, string> }|null} `null` when not set
 * @throws on a key that is not embed wording, a value that is not a string,
 * or `embeds` beside `consent`
 */
export function resolveEmbeds(input: unknown, consent: unknown): {
    text: Record<string, string>;
} | null;
/** The presets `{{embed}}` can use with no config, in the order kiss lists them. */
export function embedPresetNames(): string[];
/**
 * The markup `{{embed}}` writes: a click-to-load notice, the provider's own
 * link, and the frame held in a `<template>` until revealed. Under
 * `config.consent` a `necessary` service gets the plain iframe; without it,
 * the notice has a Load button only, and a script after it wires that button.
 *
 * @param {string} name
 * @param {ConsentService} service
 * @param {{ consent: KissConsent|null, text: Record<string, string>, params: Record<string, string>, src?: string|null, title?: string|null, poster?: string|null, own?: { load?: string|null, notice?: string|null, open?: string|null }, autoplay?: boolean }} opts
 * `text` is the wording: the site's `ui.text` under `config.consent`, its
 * `embeds.text` otherwise, over the defaults. `own` is one call's wording
 * (`load=`, `notice=`, `open=`), over `text`. `poster` is the still's markup,
 * already written by the `{{image}}` pipeline, or null for none. `autoplay`
 * (default true) lets a video's Load click ask the player to start
 * @returns {string}
 * @throws on a missing title or src, or a missing placeholder value in the src
 */
export function embedMarkup(name: string, service: ConsentService, { consent, text, params, src, title, poster, own, autoplay, }: {
    consent: KissConsent | null;
    text: Record<string, string>;
    params: Record<string, string>;
    src?: string | null;
    title?: string | null;
    poster?: string | null;
    own?: {
        load?: string | null;
        notice?: string | null;
        open?: string | null;
    };
    autoplay?: boolean;
}): string;
/** The facade's script, one per facade embed. */
export function facadeScript(): string;
/**
 * The resize listener for a frame that reports its height.
 *
 * @param {string} frameSrc
 */
export function measureScript(frameSrc: string): string;
export const EMBED_TEXT_KEYS: readonly string[];
export type ConsentService = import("./consent.js").ConsentService;
export type KissConsent = import("./consent.js").KissConsent;
