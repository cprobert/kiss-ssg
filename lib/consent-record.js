// The visitor's consent history: what `{{consentRecord}}` writes on the
// site's privacy page (spec `planning/specs/2026-11-03-kiss-consent.md`, D2–D7,
// D9, D10). The build writes everything that does not depend on the visitor:
// the heading, what the history is, what is sent with each choice when the
// site has an endpoint, an empty table and the states it can be in. The
// browser fills it from `<cookie.name>_log`, the log `lib/consent-client.js`
// appends each choice to. The viewer's script is its own and lives on this
// page alone (D3), so the client in every page's head does not grow; the
// category and service labels it prints ride in its config, never in the
// head's (D2, as amended at the viewer slice, 2026-11-03).

import { escapeHtml } from './consent-ui.js'
import { inlineJson } from './consent-client.js'

/** @typedef {import('./consent.js').KissConsent} KissConsent */

// The `ui.text` keys the browser needs; the rest are written at build time.
const BROWSER_TEXT = [
  'historyYes',
  'historyNo',
  'historyAccept',
  'historyReject',
  'historySave',
  'historyAllow',
  'historyChanged',
]

/**
 * The viewer's browser side, inlined through `Function.prototype.toString` as
 * the client is. It uses nothing from this module's scope. It builds every
 * row with DOM calls and `textContent`, never HTML, because the log is the
 * visitor's to edit and nothing in it may become markup.
 *
 * @param {any} win the page's `window`
 * @param {any} cfg `recordConfig()`
 */
function kissConsentRecord(win, cfg) {
  var doc = win.document
  var script = doc.currentScript
  var root =
    (script && script.parentNode) ||
    doc.querySelector('[data-kiss-consent-record]')
  if (!root) return
  function part(name) {
    return root.querySelector('[data-kiss-consent-record-' + name + ']')
  }
  var t = cfg.text
  var actions = {
    accept: t.historyAccept,
    reject: t.historyReject,
    save: t.historySave,
    allow: t.historyAllow,
  }
  // Dates in the visitor's own locale when it is the page's language (an
  // en-GB browser on a `lang="en"` page writes 3 Nov 2026, 15:40:42), and in
  // the page's language otherwise, so the month names match the words around
  // them. The page's `lang` alone gave a UK visitor US dates (Chromium,
  // 2026-11-03).
  var pageLang = String(doc.documentElement.lang || '')
  var base = pageLang.split('-')[0].toLowerCase()
  var nav = win.navigator || {}
  var mine = nav.languages || (nav.language ? [nav.language] : [])
  var locale = pageLang || undefined
  for (var l = 0; l < mine.length; l++)
    if (base && String(mine[l]).split('-')[0].toLowerCase() === base) {
      locale = mine[l]
      break
    }
  var format = null
  try {
    format = new win.Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    })
  } catch {
    format = null
  }
  function cell(row, text, header) {
    var el = doc.createElement(header ? 'th' : 'td')
    if (header) el.setAttribute('scope', 'row')
    if (typeof text === 'string') el.textContent = text
    else el.appendChild(text)
    row.appendChild(el)
    return el
  }
  function when(stamp) {
    var at = new Date(stamp)
    if (typeof stamp !== 'string' || isNaN(at.getTime()))
      return doc.createTextNode(String(stamp == null ? '' : stamp))
    var time = doc.createElement('time')
    time.setAttribute('datetime', at.toISOString())
    time.textContent = format ? format.format(at) : at.toISOString()
    return time
  }
  function own(o, k) {
    return (
      !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
    )
  }
  function render() {
    var log
    try {
      var raw = win.localStorage.getItem(cfg.log)
      try {
        log = raw ? JSON.parse(raw) : []
      } catch {
        log = []
      }
    } catch {
      part('unavailable').hidden = false
      return
    }
    var entries = (Array.isArray(log) ? log : []).filter(function (e) {
      return e && typeof e === 'object'
    })
    part('empty').hidden = entries.length > 0
    part('rows').hidden = entries.length === 0
    var id = part('id')
    if (id) {
      var newest = entries[entries.length - 1]
      var value = newest && typeof newest.id === 'string' ? newest.id : ''
      id.querySelector('code').textContent = value
      id.hidden = !value
    }
    var body = part('rows').querySelector('tbody')
    while (body.firstChild) body.removeChild(body.firstChild)
    var columns = cfg.categories.length + 4
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i]
      var row = doc.createElement('tr')
      cell(row, when(e.timestamp), true)
      cell(row, own(actions, e.action) ? actions[e.action] : '—')
      for (var c = 0; c < cfg.categories.length; c++) {
        var name = cfg.categories[c][0]
        cell(
          row,
          own(e.categories, name)
            ? e.categories[name]
              ? t.historyYes
              : t.historyNo
            : '—',
        )
      }
      var allowed = []
      if (e.services && typeof e.services === 'object')
        for (var s in e.services)
          if (own(e.services, s) && e.services[s])
            allowed.push(own(cfg.services, s) ? cfg.services[s] : s)
      cell(row, allowed.length ? allowed.join(', ') : '—')
      cell(row, typeof e.version === 'string' ? e.version : '—')
      body.appendChild(row)
      // Between this row and the older one: the purposes changed (D7).
      var older = entries[i - 1]
      if (older && older.version !== e.version) {
        var mark = doc.createElement('tr')
        mark.setAttribute('data-kiss-consent-record-changed', '')
        var td = doc.createElement('td')
        td.setAttribute('colspan', String(columns))
        td.textContent = t.historyChanged
        mark.appendChild(td)
        body.appendChild(mark)
      }
    }
  }
  render()
  // A choice made on this page (its footer's settings) shows at once.
  doc.addEventListener('kiss-consent:change', render)
}

/**
 * What the viewer's script is handed: the log's name, the labels, and the
 * wording it writes.
 *
 * @param {KissConsent} resolved
 * @returns {Record<string, any>}
 */
export function recordConfig(resolved) {
  /** @type {Record<string, string>} */
  const services = {}
  for (const s of Object.values(resolved.services)) services[s.name] = s.label
  /** @type {Record<string, string>} */
  const text = {}
  for (const key of BROWSER_TEXT) text[key] = resolved.ui.text[key]
  return {
    log: `${resolved.cookie.name}_log`,
    categories: resolved.inUse.map((name) => [
      name,
      resolved.categories[name].label,
    ]),
    services,
    text,
  }
}

/**
 * The history page's markup and script. Everything that changes with the
 * visitor sits in `[data-kiss-consent-ui]`, which the Markdown copy drops;
 * the heading and the statements stay in it.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function recordHtml(resolved) {
  const t = resolved.ui.text
  const head = [
    t.historyWhen,
    t.historyChoice,
    ...resolved.inUse.map((name) => resolved.categories[name].label),
    t.historyAllowed,
    t.historyVersion,
  ]
    .map((label) => `<th scope="col">${escapeHtml(label)}</th>`)
    .join('')
  return [
    '<section class="kiss-consent-record" data-kiss-consent-record>',
    `<h2>${escapeHtml(t.historyTitle)}</h2>`,
    `<p>${escapeHtml(t.historyIntro)}</p>`,
    // What is sent is a fact kiss knows: the fields it posts. What the
    // site's server keeps is the site's to say, in its own privacy notice.
    resolved.endpoint ? `<p>${escapeHtml(t.historySent)}</p>` : '',
    '<div data-kiss-consent-ui>',
    `<noscript><p>${escapeHtml(t.historyNoScript)}</p></noscript>`,
    // The id is for quoting to the site, so it is shown only when the site
    // is sent one.
    resolved.endpoint
      ? `<p data-kiss-consent-record-id hidden>${escapeHtml(t.historyId)} <code></code></p>`
      : '',
    `<p data-kiss-consent-record-empty hidden>${escapeHtml(t.historyEmpty)}</p>`,
    `<p data-kiss-consent-record-unavailable hidden>${escapeHtml(t.historyUnavailable)}</p>`,
    `<div class="kiss-consent-table-wrap" role="region" tabindex="0" aria-label="${escapeHtml(t.historyTitle)}" data-kiss-consent-record-rows hidden>`,
    `<table class="kiss-consent-table"><caption>${escapeHtml(t.historyTitle)}</caption><thead><tr>${head}</tr></thead><tbody></tbody></table>`,
    '</div>',
    '</div>',
    `<script data-kiss-consent-record-script>(${kissConsentRecord.toString()})(window,${inlineJson(recordConfig(resolved))})</script>`,
    '</section>',
  ].join('')
}

export { kissConsentRecord }
