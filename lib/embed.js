import {
  DEFAULT_TEXT,
  PRESETS,
  embedWording,
  fill,
  gatingOf,
  presetService,
} from './consent.js'

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

// The play mark on a postered video's Load button: an SVG, not the ▶
// character, which iOS draws as a colour emoji. Hidden from assistive
// technology, because the button's own text is its name.
const PLAY_MARK =
  '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" style="vertical-align:-.125em;margin-right:.5em"><path d="M4 2.5v11l9.5-5.5z"/></svg>'

const EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'

// What a relative URL is resolved against, only to learn its scheme. Any
// http(s) base gives the same answer: a relative path, a root-relative one
// and a `//host/…` one all take the base's scheme.
const SCHEME_BASE = 'https://kiss.invalid/'

/**
 * Whether a URL is safe to frame or link: it resolves, the way a browser
 * resolves it, to `http:` or `https:`. The URL algorithm decides, not a list
 * of bad spellings, so leading whitespace, a tab inside the scheme, mixed
 * case, `javascript:`, `data:`, `vbscript:` and `blob:` are all refused
 * without being named. A relative path, a root-relative one and a
 * `//host/…` one pass, because they resolve to the page's own scheme
 * (security hardening, 2026-11-06).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value, SCHEME_BASE)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

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

// The wording a site with no `config.consent` may set for its embeds: the
// same keys `config.consent.ui.text` uses for them, so the words have one
// name wherever they are set. `embedAllow` is not one, since only the
// consent manager offers Always allow.
export const EMBED_TEXT_KEYS = Object.freeze([
  'embedNotice',
  'embedLoad',
  'embedPlay',
  'embedWatch',
])

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
export function resolveEmbeds(input, consent) {
  if (input === undefined || input === null) return null
  const where = 'config.embeds'
  if (typeof input !== 'object' || Array.isArray(input))
    throw new Error(
      `${where} must be an object like { text: { embedLoad: '…' } }`,
    )
  if (consent !== undefined && consent !== null)
    throw new Error(
      `${where}: this site has config.consent, so its embed wording is config.consent.ui.text — set the same keys there`,
    )
  const own = /** @type {Record<string, unknown>} */ (input)
  for (const key of Object.keys(own))
    if (key !== 'text')
      throw new Error(`${where}.${key} is not a setting — the one key is text`)
  const text = own.text === undefined ? {} : own.text
  if (typeof text !== 'object' || text === null || Array.isArray(text))
    throw new Error(`${where}.text must be an object of wording`)
  for (const [key, value] of Object.entries(text)) {
    if (!EMBED_TEXT_KEYS.includes(key))
      throw new Error(
        `${where}.text.${key} is not embed wording — valid keys are ${EMBED_TEXT_KEYS.join(', ')}`,
      )
    if (typeof value !== 'string')
      throw new Error(
        `${where}.text.${key} must be a string (received ${JSON.stringify(value)})`,
      )
  }
  return {
    text: embedWording(
      { ...DEFAULT_TEXT, .../** @type {Record<string, string>} */ (text) },
      /** @type {Record<string, unknown>} */ (text),
    ),
  }
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
 * The box's geometry, inline: the frame's own size, so the notice holds the
 * space the frame will take, and a fixed-ratio frame loads without moving the
 * page (a measured one starts at its estimate, then takes the height it
 * reports). The notice sits centred in it; a box with more text than room grows, since an
 * aspect ratio gives way to its content. Geometry only, never colour or
 * border: the site's CSS, or the consent theme, decides the look (the
 * operator, 2026-11-04).
 *
 * @param {NonNullable<ConsentService['embed']>} embed
 */
function boxStyle(embed) {
  const parts = [
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'align-items:center',
    'text-align:center',
    // The ratio is the frame's, so it measures the content box: a site's
    // `* { box-sizing: border-box }` would otherwise take the consent theme's
    // padding out of it, and the loaded frame would push the box taller.
    'box-sizing:content-box',
  ]
  if (embed.ratio) parts.push(`aspect-ratio:${embed.ratio}`)
  else parts.push(`min-height:${embed.height ?? 600}px`)
  if (embed.width)
    parts.push(
      `max-width:${embed.width}px`,
      'margin-left:auto',
      'margin-right:auto',
    )
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
 * @param {{ consent: KissConsent|null, text: Record<string, string>, params: Record<string, string>, src?: string|null, title?: string|null, poster?: string|null, own?: { load?: string|null, notice?: string|null, open?: string|null }, autoplay?: boolean }} opts
 * `text` is the wording: the site's `ui.text` under `config.consent`, its
 * `embeds.text` otherwise, over the defaults. `own` is one call's wording
 * (`load=`, `notice=`, `open=`), over `text`. `poster` is the still's markup,
 * already written by the `{{image}}` pipeline, or null for none. `autoplay`
 * (default true) lets a video's Load click ask the player to start
 * @returns {string}
 * @throws on a missing title or src, a missing placeholder value in the src,
 * or a frame src or a filled `embed.watch` that is not an http(s) URL
 * (`isHttpUrl`)
 */
export function embedMarkup(
  name,
  service,
  {
    consent,
    text,
    params,
    src = null,
    title = null,
    poster = null,
    own = {},
    autoplay = true,
  },
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
    video: false,
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
  // Checked after `fill` (a `{placeholder}` in a template's host does not
  // parse) and before the bare iframe below: the frame has no sandbox, so a
  // `javascript:` src from model data would run in the page's origin.
  if (!isHttpUrl(frameSrc))
    throw new Error(
      `${where}: the frame's src ${JSON.stringify(frameSrc)} is not an http(s) URL — ${src ? 'src=' : `config.consent.services.${name}.embed.src`} must name a web page; a javascript:, data: or other scheme is refused`,
    )
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
  // Outside the `try`: a link that cannot be filled is left out, but one that
  // fills to another scheme is a mistake to report, not a link to drop.
  if (watch !== null && !isHttpUrl(watch))
    throw new Error(
      `${where}: embed.watch ${JSON.stringify(watch)} is not an http(s) URL — the provider's link must name a web page; a javascript:, data: or other scheme is refused`,
    )
  // One pass, so a label or provider holding "{service}" is never filled again.
  const named = (/** @type {string} */ wording) =>
    wording.replace(/\{(provider|service)\}/g, (_, key) =>
      key === 'provider' ? service.provider : service.label,
    )
  // A poster is a photo under the notice. The box keeps its geometry and
  // gains a positioning context; the notice becomes a strip along the
  // bottom. Text on a photo is unreadable without a backing, so here, and
  // only here, kiss writes colour: through custom properties, so a site
  // restyles it by setting them rather than fighting an inline style (the
  // operator, 2026-11-05, bending the 2026-11-04 geometry-only rule).
  const style = `style="${boxStyle(embed)}${poster ? ';position:relative;justify-content:flex-end' : ''}"`
  const classes = poster ? 'kiss-embed kiss-embed--poster' : 'kiss-embed'
  const ui = consent ? ' data-kiss-consent-ui' : ' data-kiss-embed-ui'
  // A video's Load click is the request to play it, so its box asks the
  // click handlers (the facade's, and the consent client's) to add
  // `autoplay=1` as they reveal the frame. Never written into the frame's own
  // src: a reveal from a stored choice, with no click, must not start a video.
  const plays = embed.video && autoplay ? ' data-kiss-embed-autoplay' : ''
  const box = consent
    ? `<div class="${classes}" data-kiss-embed="${escapeAttr(name)}" data-kiss-consent="${escapeAttr(service.category)}"${plays} ${style}>`
    : `<div class="${classes}" data-kiss-embed="${escapeAttr(name)}" data-kiss-embed-facade${plays} ${style}>`
  const mark = poster && embed.video ? PLAY_MARK : ''
  // The Load button's words, and its name: the words, then the frame's
  // title, so several embeds on a page are told apart by a screen reader.
  // The words come first, so the name contains what is shown (WCAG 2.5.3).
  const load = named(
    own.load ?? (embed.video ? text.embedPlay : text.embedLoad),
  )
  // The words again, as data, for a site that redraws them in CSS
  // (`content: attr(data-kiss-embed-label)`), so a stylesheet never repeats
  // them and `load=` or `ui.text` needs no CSS edit (#78's reporter).
  const loadAttrs = ` aria-label="${escapeAttr(`${load}: ${frameTitle}`)}" data-kiss-embed-label="${escapeAttr(load)}"`
  const buttons = consent
    ? `<button type="button" data-kiss-consent-action="load"${loadAttrs}>${mark}${escapeText(load)}</button>` +
      `<button type="button" data-kiss-consent-action="allow">${escapeText(named(text.embedAllow))}</button>`
    : `<button type="button" data-kiss-embed-action="load"${loadAttrs}>${mark}${escapeText(load)}</button>`
  // A compact strip: padded, so its text clears the box's edges, slightly
  // smaller, and with tight paragraph margins, so the still shows at a
  // phone's width. Measured on an unstyled site at 375 px, the strip covered
  // 69% of the box and its text touched the edges (the operator's look at
  // /branch-close, 2026-11-05). Inline, because a `<style>` per embed is the
  // CSS audit's `inline-style-repeated`, so no media query is possible.
  const noticeStyle = poster
    ? ' style="position:relative;width:100%;box-sizing:border-box;padding:.5rem .75rem;font-size:.875em;line-height:1.35;background:var(--kiss-embed-poster-scrim,rgba(0,0,0,.72));color:var(--kiss-embed-poster-text,#fff)"'
    : ''
  // The strip's text takes the strip's colour, inline, over any rule on the
  // paragraph or the link: the consent theme colours `.kiss-embed__notice p`
  // muted, which read dark on the dark strip (Codex, slice 3), and a site's
  // own link colour would do the same.
  const inherit = poster ? ' style="color:inherit"' : ''
  const para = poster ? ' style="color:inherit;margin:.25rem 0"' : ''
  // With a poster the link sits beside the button, not under it: one line
  // fewer of strip over the still.
  const besideButton = poster
    ? ' style="color:inherit;display:inline-block;margin:.25rem 0 .25rem .75rem"'
    : ''
  // The provider's link is part of the notice, so it goes when the frame
  // comes: the box then holds the frame alone, at the size it reserved. The
  // poster goes with it, by the same attribute.
  return [
    box,
    poster
      ? `<div class="kiss-embed__poster"${ui} style="position:absolute;inset:0;overflow:hidden">${poster}</div>`
      : '',
    `<div class="kiss-embed__notice"${ui}${noticeStyle}>`,
    `<p${para}>${escapeText(named(own.notice ?? text.embedNotice))}</p>`,
    buttons,
    watch
      ? `<p${besideButton}><a class="kiss-embed__watch" href="${escapeAttr(watch)}"${inherit}>${escapeText(named(own.open ?? text.embedWatch))}</a></p>`
      : '',
    '</div>',
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
    // This click is the request to play: set before the frame is in the
    // page, so the player loads once, already asked.
    var f = /** @type {DocumentFragment} */ (frame).querySelector('iframe')
    if (f && box.hasAttribute('data-kiss-embed-autoplay')) {
      try {
        var u = new URL(f.getAttribute('src') || '')
        u.searchParams.set('autoplay', '1')
        f.setAttribute('src', u.toString())
      } catch (_) {
        // A src the URL parser refuses loads as written.
      }
    }
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
      if (f.contentWindow !== e.source) continue
      f.style.height = height + 'px'
      // The box reserved the starting height; now the frame says its own.
      var box = /** @type {HTMLElement|null} */ (f.parentNode)
      if (box && box.style) box.style.minHeight = ''
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
