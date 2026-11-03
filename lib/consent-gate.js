import { Parser } from 'htmlparser2'
import { fill, gatingOf } from './consent.js'

// The consent manager's server side: the markup that holds a service back
// until the visitor allows it, and the check that a rendered page is wired so
// that it can be. `{{consentScript}}` and `{{consentEmbed}}` (in
// `lib/handlebars-helpers.js`) call the first two; `lib/kiss-page.js` calls
// `consentWiringProblems` on every rendered HTML page. The attribute
// vocabulary is the contract's (`planning/plans/2026-11-02-consent-manager.md`
// §3), and `lib/consent-client.js` reads the same names.

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

/**
 * Whether a script body calls `document.write` or `writeln`. Revived after
 * consent, it would replace the whole page (contract Appendix A, S3).
 *
 * @param {string} js
 * @returns {boolean}
 */
export function findDocumentWrite(js) {
  return /\bdocument\s*\.\s*write(ln)?\s*\(/.test(js)
}

/**
 * One `<script>`, gated or plain. `attrs` are the original's other attributes.
 *
 * @param {{ name: string, category: string, gated: boolean, src?: string|null, body?: string, attrs?: Record<string, string>, type?: string|null, async?: boolean }} s
 * @returns {string}
 */
function scriptTag({
  name,
  category,
  gated,
  src = null,
  body = '',
  attrs = {},
  type = null,
  async = false,
}) {
  const parts = []
  if (gated) {
    parts.push(
      'type="text/plain"',
      `data-kiss-service="${escapeAttr(name)}"`,
      `data-kiss-consent="${escapeAttr(category)}"`,
    )
    if (type) parts.push(`data-type="${escapeAttr(type)}"`)
    if (src) parts.push(`data-src="${escapeAttr(src)}"`)
    if (async) parts.push('data-async')
  } else {
    if (type) parts.push(`type="${escapeAttr(type)}"`)
    if (src) parts.push(`src="${escapeAttr(src)}"`)
    if (async) parts.push('async')
  }
  for (const [key, value] of Object.entries(attrs))
    parts.push(value === '' ? key : `${key}="${escapeAttr(value)}"`)
  return `<script ${parts.join(' ')}>${body}</script>`
}

const DROPPED_ATTRS = new Set(['type', 'src', 'async', 'defer'])
const SCRIPT_TYPES =
  /^(|text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript)$/i

/**
 * Rewrites every `<script>` in a fragment of HTML into its gated form,
 * keeping everything else byte for byte. A data block (`application/ld+json`)
 * is left alone; an iframe is refused, since only `{{consentEmbed}}` can hold
 * one back.
 *
 * @param {string} html
 * @param {{ name: string, category: string, gated: boolean, where: string }} s
 * @returns {string}
 */
function gateFragment(html, { name, category, gated, where }) {
  /** @type {{ start: number, openEnd: number, end: number, attrs: Record<string, string> }[]} */
  const scripts = []
  /** @type {{ start: number, openEnd: number, attrs: Record<string, string> }|null} */
  let open = null
  const parser = new Parser(
    {
      onopentag(tag, attribs) {
        if (tag === 'iframe')
          throw new Error(
            `${where}: an <iframe> cannot be gated here — use {{consentEmbed}} for an iframe`,
          )
        if (tag === 'script')
          open = {
            start: parser.startIndex,
            openEnd: parser.endIndex + 1,
            attrs: attribs,
          }
      },
      onclosetag(tag) {
        if (tag === 'script' && open) {
          scripts.push({ ...open, end: parser.endIndex + 1 })
          open = null
        }
      },
    },
    {
      decodeEntities: false,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  )
  parser.write(html)
  parser.end()
  let out = ''
  let at = 0
  for (const s of scripts) {
    const type = s.attrs.type ?? ''
    if (!SCRIPT_TYPES.test(type)) continue
    const closeStart = html.lastIndexOf('<', s.end - 1)
    const body = html.slice(s.openEnd, closeStart)
    if (findDocumentWrite(body))
      throw new Error(
        `${where}: document.write in a script that runs after consent wipes the page — load it another way`,
      )
    /** @type {Record<string, string>} */
    const attrs = {}
    for (const [key, value] of Object.entries(s.attrs))
      if (!DROPPED_ATTRS.has(key)) attrs[key] = value
    out += html.slice(at, s.start)
    out += scriptTag({
      name,
      category,
      gated,
      src: s.attrs.src ?? null,
      body,
      attrs,
      type: /^module$/i.test(type) ? 'module' : null,
      async: Object.hasOwn(s.attrs, 'async'),
    })
    at = s.end
  }
  return out + html.slice(at)
}

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
export function gatedScript(
  name,
  service,
  { consent, params, body = null, partialHtml = null, src = null },
) {
  const where = `consentScript "${name}"`
  const gated = gatingOf(service, consent) !== 'none'
  const category = service.category
  const html = partialHtml ?? body
  if (html !== null && html.trim() !== '') {
    if (/<iframe\b/i.test(html))
      throw new Error(
        `${where}: an <iframe> cannot be gated here — use {{consentEmbed}} for an iframe`,
      )
    if (!/<script\b/i.test(html)) {
      if (findDocumentWrite(html))
        throw new Error(
          `${where}: document.write in a script that runs after consent wipes the page — load it another way`,
        )
      return scriptTag({ name, category, gated, body: html })
    }
    return gateFragment(html, { name, category, gated, where })
  }
  const parts = []
  if (service.inline) {
    const inline = fill(service.inline, params, where)
    if (findDocumentWrite(inline))
      throw new Error(
        `${where}: document.write in a script that runs after consent wipes the page — load it another way`,
      )
    parts.push(scriptTag({ name, category, gated, body: inline }))
  }
  const source = src ?? service.src
  if (source)
    parts.push(
      scriptTag({ name, category, gated, src: fill(source, params, where) }),
    )
  if (parts.length === 0)
    throw new Error(
      `${where}: the service has no src, inline script or partial to load — set one in config.consent.services.${name}, or use the block form`,
    )
  return parts.join('')
}

const EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'

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
export function embedMarkup(
  name,
  service,
  { consent, params, src = null, title = null },
) {
  const where = `consentEmbed "${name}"`
  const frameTitle = title ?? service.embed?.title
  if (!frameTitle)
    throw new Error(
      `${where}: title= is required — it is the frame's accessible name`,
    )
  const template = src ?? service.embed?.src
  if (!template)
    throw new Error(
      `${where}: no src — pass src= or set config.consent.services.${name}.embed.src`,
    )
  const frameSrc = src ? src : fill(template, params, where)
  const iframe = `<iframe src="${escapeAttr(frameSrc)}" title="${escapeAttr(frameTitle)}" loading="lazy" allow="${EMBED_ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
  if (gatingOf(service, consent) === 'none') return iframe
  let watch = null
  if (service.embed?.watch) {
    try {
      watch = fill(service.embed.watch, params, where)
    } catch {
      watch = null
    }
  }
  const t = consent.ui.text
  const named = (/** @type {string} */ text) =>
    text.replace(/\{provider\}/g, service.provider)
  return [
    `<div class="kiss-embed" data-kiss-embed="${escapeAttr(name)}" data-kiss-consent="${escapeAttr(service.category)}">`,
    '<div class="kiss-embed__notice" data-kiss-consent-ui>',
    `<p>${escapeText(named(t.embedNotice))}</p>`,
    `<button type="button" data-kiss-consent-action="load">${escapeText(named(t.embedLoad))}</button>`,
    `<button type="button" data-kiss-consent-action="allow">${escapeText(named(t.embedAllow))}</button>`,
    '</div>',
    watch
      ? `<a class="kiss-embed__watch" href="${escapeAttr(watch)}">${escapeText(named(t.embedWatch))}</a>`
      : '',
    `<template data-kiss-embed-frame>${iframe}</template>`,
    '</div>',
  ].join('')
}

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
export function consentWiringProblems(html) {
  if (!html.includes('data-kiss-')) return []
  let heads = 0
  let banners = 0
  let headSeen = false
  /** @type {string[]} */
  const early = []
  /** @type {Set<string>} */
  const gatedServices = new Set()
  let settings = false
  /** @type {Map<string, number>} */
  const srcs = new Map()
  const parser = new Parser(
    {
      onopentag(tag, a) {
        if (
          Object.hasOwn(a, 'data-kiss-consent-action') &&
          a['data-kiss-consent-action'] === 'settings'
        )
          settings = true
        if (Object.hasOwn(a, 'data-kiss-embed'))
          gatedServices.add(a['data-kiss-embed'])
        if (tag === 'template' && Object.hasOwn(a, 'data-kiss-consent-banner'))
          banners++
        if (tag !== 'script') return
        if (Object.hasOwn(a, 'data-kiss-consent-head')) {
          heads++
          headSeen = true
          return
        }
        const service = a['data-kiss-service']
        const type = a.type ?? ''
        const gated = service !== undefined && type === 'text/plain'
        if (gated) {
          gatedServices.add(service)
          const src = a['data-src']
          if (src) {
            const key = `${service} ${src}`
            srcs.set(key, (srcs.get(key) ?? 0) + 1)
          }
        }
        const executable = gated || SCRIPT_TYPES.test(type)
        if (executable && !headSeen)
          early.push(service ?? a.src ?? 'an inline script')
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  )
  parser.write(html)
  parser.end()
  /** @type {string[]} */
  const problems = []
  const services = [...gatedServices].sort()
  if (heads === 0) {
    if (services.length)
      problems.push(
        `the page gates ${services.join(', ')} but has no {{consentHead}} — put it in <head>, after <meta charset>`,
      )
    if (settings)
      problems.push(
        'the page has a {{consentSettings}} control but no {{consentHead}}',
      )
    return problems
  }
  if (heads > 1)
    problems.push(`{{consentHead}} appears ${heads} times — once per page`)
  if (banners === 0)
    problems.push(
      'the page has {{consentHead}} but no {{consentBanner}} — put it first in <body>',
    )
  if (banners > 1)
    problems.push(`{{consentBanner}} appears ${banners} times — once per page`)
  if (early.length)
    problems.push(
      `${[...new Set(early)].join(', ')} would run before {{consentHead}} sets the Consent Mode default — move {{consentHead}} above every script`,
    )
  for (const [key, n] of srcs)
    if (n > 1) {
      const [service, src] = key.split(' ')
      problems.push(`${service} loads ${src} ${n} times — once per page`)
    }
  return problems
}
