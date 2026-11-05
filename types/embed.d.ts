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
 * @param {{ consent: KissConsent|null, text: Record<string, string>, params: Record<string, string>, src?: string|null, title?: string|null, poster?: string|null }} opts
 * `text` is the wording: the site's `ui.text` under `config.consent`, the
 * defaults otherwise. `poster` is the still's markup, already written by the
 * `{{image}}` pipeline, or null for none
 * @returns {string}
 * @throws on a missing title or src, or a missing placeholder value in the src
 */
export function embedMarkup(name: string, service: ConsentService, { consent, text, params, src, title, poster }: {
    consent: KissConsent | null;
    text: Record<string, string>;
    params: Record<string, string>;
    src?: string | null;
    title?: string | null;
    poster?: string | null;
}): string;
/** The facade's script, one per facade embed. */
export function facadeScript(): string;
/**
 * The resize listener for a frame that reports its height.
 *
 * @param {string} frameSrc
 */
export function measureScript(frameSrc: string): string;
export type ConsentService = import("./consent.js").ConsentService;
export type KissConsent = import("./consent.js").KissConsent;
