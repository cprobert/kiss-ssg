import { PRESETS, fill, gatingOf, presetService } from './consent.js'

// Click-to-load embeds: what `{{embed}}` writes. A frame from another site (a
// video, a map, a post) is held in a `<template>` behind a notice until the
// visitor asks for it, so nothing is fetched or stored before a click.
//
// Two modes, decided by the site, never by the template:
//
// - **Under `config.consent`** the embed is one of the site's declared
//   services. Its notice also offers "Always allow", and the consent client
//   (`lib/consent-client.js`) reveals it when the visitor's stored choice
//   allows it, and records it for withdrawal.
// - **With no `config.consent`** (or on a learning package's page, where the
//   LMS deals with consent) the service comes from its preset alone and the
//   embed is a facade: a Load button and a link to the provider, wired by a
//   small script written after it. Nothing is stored, so there is no choice
//   to remember and nothing for a banner to ask.
//
// The 2026-11-04 clean room is why the second mode exists: an agent asked to
// add a YouTube video to a site with no banner found the consent helper, read
// that one video needs no banner, and hand-built 32 lines of facade instead
// (planning/reviews/2026-11-04-embed-clean-room.md).

/** @typedef {import('./consent.js').ConsentService} ConsentService */
/** @typedef {import('./consent.js').KissConsent} KissConsent */

/**
 * @param {unknown} s
 * @returns {string}
 */
const escapeAttr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * @param {unknown} s
 * @returns {string}
 */
const escapeText = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'

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
export function embedService(name, consent) {
  if (consent) {
    const service = consent.services[name]
    if (!service)
      throw new Error(
        `embed "${name}": no service "${name}" in config.consent.services — declare it there (\`${name}: {}\` picks the preset of that name), so the banner and the cookie table know about it`,
      )
    return service
  }
  const service = presetService(name)
  if (!service || !service.embed)
    throw new Error(
      `embed "${name}": kiss has no embed preset "${name}" — use one of ${embedPresetNames().join(', ')}, or declare the service in config.consent.services with an embed`,
    )
  return service
}

/** The presets `{{embed}}` can use with no config, in the order kiss lists them. */
export function embedPresetNames() {
  return Object.keys(PRESETS).filter(
    (name) => /** @type {Record<string, any>} */ (PRESETS)[name].embed,
  )
}

/**
 * The frame's sizing, inline, because it is a property of the provider's
 * frame rather than of the site's look: a 16:9 player, or a frame whose
 * height its content decides (Instagram), with an optional width cap.
 *
 * @param {NonNullable<ConsentService['embed']>} embed
 */
function frameStyle(embed) {
  const parts = ['display:block', 'width:100%', 'border:0']
  if (embed.width) parts.push(`max-width:${embed.width}px`, 'margin:0 auto')
  if (embed.ratio) parts.push(`aspect-ratio:${embed.ratio}`, 'height:auto')
  else parts.push('aspect-ratio:auto', `height:${embed.height ?? 600}px`)
  return parts.join(';')
}

/**
 * The markup `{{embed}}` writes: a click-to-load notice, the provider's own
 * link, and the frame held in a `<template>` until revealed. Under
 * `config.consent` a `necessary` service gets the plain iframe; without it,
 * the notice has a Load button only, and a script after it wires that button.
 *
 * @param {string} name
 * @param {ConsentService} service
 * @param {{ consent: KissConsent|null, text: Record<string, string>, params: Record<string, string>, src?: string|null, title?: string|null }} opts
 * `text` is the wording: the site's `ui.text` under `config.consent`, the
 * defaults otherwise
 * @returns {string}
 * @throws on a missing title or src, or a missing placeholder value in the src
 */
export function embedMarkup(
  name,
  service,
  { consent, text, params, src = null, title = null },
) {
  const where = `embed "${name}"`
  const embed = service.embed ?? {
    src: null,
    title: null,
    watch: null,
    ratio: '16/9',
    width: null,
    height: null,
    measure: false,
  }
  const frameTitle = title ?? embed.title
  if (!frameTitle)
    throw new Error(
      `${where}: title= is required — it is the frame's accessible name`,
    )
  const template = src ?? embed.src
  if (!template)
    throw new Error(
      `${where}: no src — pass src=${consent ? ` or set config.consent.services.${name}.embed.src` : ''}`,
    )
  const frameSrc = src ? src : fill(template, params, where)
  const iframe = `<iframe src="${escapeAttr(frameSrc)}" title="${escapeAttr(frameTitle)}" loading="lazy" allow="${EMBED_ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="${frameStyle(embed)}"></iframe>`
  const measure = embed.measure ? measureScript(frameSrc) : ''
  if (consent && gatingOf(service, consent) === 'none') return iframe + measure
  let watch = null
  if (embed.watch) {
    try {
      watch = fill(embed.watch, params, where)
    } catch {
      watch = null
    }
  }
  // One pass, so a label or provider holding "{service}" is never filled again.
  const named = (/** @type {string} */ wording) =>
    wording.replace(/\{(provider|service)\}/g, (_, key) =>
      key === 'provider' ? service.provider : service.label,
    )
  const box = consent
    ? `<div class="kiss-embed" data-kiss-embed="${escapeAttr(name)}" data-kiss-consent="${escapeAttr(service.category)}">`
    : `<div class="kiss-embed" data-kiss-embed="${escapeAttr(name)}" data-kiss-embed-facade>`
  const buttons = consent
    ? `<button type="button" data-kiss-consent-action="load">${escapeText(named(text.embedLoad))}</button>` +
      `<button type="button" data-kiss-consent-action="allow">${escapeText(named(text.embedAllow))}</button>`
    : `<button type="button" data-kiss-embed-action="load">${escapeText(named(text.embedLoad))}</button>`
  return [
    box,
    `<div class="kiss-embed__notice"${consent ? ' data-kiss-consent-ui' : ' data-kiss-embed-ui'}>`,
    `<p>${escapeText(named(text.embedNotice))}</p>`,
    buttons,
    '</div>',
    watch
      ? `<a class="kiss-embed__watch" href="${escapeAttr(watch)}">${escapeText(named(text.embedWatch))}</a>`
      : '',
    `<template data-kiss-embed-frame>${iframe}</template>`,
    '</div>',
    consent ? '' : facadeScript(),
    measure,
  ].join('')
}

/**
 * Wires the facade written just before this script: its Load button puts the
 * frame in place of the template and hides the notice. Written once per
 * embed, so an embed works wherever it is put, with nothing in `<head>`.
 * Runs in the browser, inlined by its source; ES5, no globals.
 *
 * @param {Document} doc
 */
function kissEmbedFacade(doc) {
  var me = doc.currentScript
  var box = me && me.previousElementSibling
  if (!box || !box.hasAttribute('data-kiss-embed-facade')) return
  var button = box.querySelector('[data-kiss-embed-action="load"]')
  if (!button) return
  button.addEventListener('click', function () {
    var tpl = box.querySelector('template[data-kiss-embed-frame]')
    if (!tpl || box.getAttribute('data-kiss-done')) return
    box.setAttribute('data-kiss-done', '1')
    var frame = /** @type {HTMLTemplateElement} */ (tpl).content.cloneNode(true)
    tpl.parentNode && tpl.parentNode.insertBefore(frame, tpl)
    var ui = box.querySelectorAll('[data-kiss-embed-ui]')
    for (var i = 0; i < ui.length; i++)
      /** @type {HTMLElement} */ (ui[i]).hidden = true
    var iframe = box.querySelector('iframe')
    if (iframe) iframe.focus()
  })
}

/**
 * Sizes a frame from the height it reports. Instagram's embed posts
 * `{"type":"MEASURE","details":{"height":N}}` to its parent (measured
 * 2026-11-04, without its own `embed.js`); a frame matched by its window,
 * from the frame's own origin, takes that height. Listens on the page, so it
 * covers the frame however it was revealed: a click, or a stored choice.
 *
 * @param {Window} win
 * @param {string} origin the frame's origin
 */
function kissEmbedMeasure(win, origin) {
  win.addEventListener('message', function (e) {
    if (e.origin !== origin) return
    var data = e.data
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch (_) {
        return
      }
    }
    if (!data || data.type !== 'MEASURE' || !data.details) return
    var height = Number(data.details.height)
    if (!(height > 0) || height > 10000) return
    var frames = win.document.querySelectorAll('iframe')
    for (var i = 0; i < frames.length; i++) {
      var f = /** @type {HTMLIFrameElement} */ (frames[i])
      if (f.contentWindow === e.source) f.style.height = height + 'px'
    }
  })
}

/** The facade's script, one per facade embed. */
export function facadeScript() {
  return `<script>(${kissEmbedFacade.toString()})(document)</script>`
}

/**
 * The resize listener for a frame that reports its height.
 *
 * @param {string} frameSrc
 */
export function measureScript(frameSrc) {
  let origin
  try {
    origin = new URL(frameSrc).origin
  } catch {
    return ''
  }
  if (origin === 'null') return ''
  return `<script>(${kissEmbedMeasure.toString()})(window,${JSON.stringify(origin)})</script>`
}
