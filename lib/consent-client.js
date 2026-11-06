// The consent manager's browser side, in two parts (spec
// `planning/specs/2026-11-03-kiss-consent.md`, "the inline part and the cached
// file"):
//
// - `kissConsentHead(win, cfg)`, inlined into every page by `{{consentHead}}`
//   with the site's config: Consent Mode's default, the stored choice, `has()`,
//   the banner's mount before first paint, and a `window.kissConsent` stub that
//   queues what it cannot answer yet.
// - `kissConsentClient(win)`, the rest, in one cached file every page loads
//   with `defer` (`<build>/kiss-consent.<hash>.js`, written by
//   `lib/build-finish.js`): the clicks, the cookie, the log and the POST, the
//   activation queue, embeds, the dialog, withdrawal.
//
// The two share one object, `window.__kissConsent`: the head part puts the
// state (`stored`, `choice`, `grants`) and the functions both need on it, and
// the client reads and writes it, so no rule is written twice. Both are
// inlined or written through `Function.prototype.toString`, as
// `lib/scorm-bridge.js` is, so each uses nothing from this module's scope: only
// its arguments and the browser's globals. A production build minifies both,
// and the tests run them as rendered and terser-minified.
//
// Every behavioural choice here was measured in Chromium first (contract
// `planning/plans/2026-11-02-consent-manager.md`, Appendix A): the serial
// activation queue (S2), Consent Mode `update` before activation (S1), the
// iframe kept in a `<template>` until revealed (S4), the banner mounted inline
// before first paint (S5), the beacon sent before a reload (S6), and deleting a
// cookie on the host and every parent domain (S7).

import { createHash } from 'node:crypto'

/**
 * The inline part.
 *
 * @param {any} win the page's `window`
 * @param {any} cfg `clientConfig()` from `lib/consent.js`
 */
function kissConsentHead(win, cfg) {
  var doc = win.document
  if (win.kissConsent) return
  var DAY = 86400000
  var S = { cfg: cfg, ready: false, calls: [], clicks: [] }
  var categories = (S.categories = cfg.categories.map(function (c) {
    return c.name
  }))
  var modeOf = (S.modeOf = {})
  cfg.categories.forEach(function (c) {
    modeOf[c.name] = c.mode
  })
  var serviceCategory = (S.serviceCategory = {})
  cfg.services.forEach(function (s) {
    serviceCategory[s.name] = s.category
  })
  S.closedName = cfg.cookie.name + '_closed'

  // Consent Mode: the stub, the default, then the settings. Before any Google
  // tag, which is what the wiring check enforces.
  win.dataLayer = win.dataLayer || []
  var gtag =
    win.gtag ||
    function () {
      win.dataLayer.push(arguments)
    }
  if (!win.gtag) win.gtag = gtag
  S.gtag = gtag
  gtag('consent', 'default', cfg.google.defaults)
  gtag('set', 'ads_data_redaction', cfg.google.adsDataRedaction)
  gtag('set', 'url_passthrough', cfg.google.urlPassthrough)

  function readCookie(name) {
    var parts = (doc.cookie || '').split(/;\s*/)
    for (var i = 0; i < parts.length; i++) {
      var at = parts[i].indexOf('=')
      if (at > 0 && parts[i].slice(0, at) === name)
        return parts[i].slice(at + 1)
    }
    return null
  }
  S.readCookie = readCookie

  function parseStored() {
    var raw = readCookie(cfg.cookie.name)
    if (raw === null) return null
    try {
      var value = JSON.parse(decodeURIComponent(raw))
      return value && typeof value === 'object' ? value : null
    } catch {
      return null
    }
  }

  var stored = (S.stored = parseStored())
  // A stored record counts only in the current format and version, and only
  // while it is younger than the configured lifetime; that is decided once,
  // for the category choice and the "always allow" grants alike, so a grant
  // never outlives the record it was written in. The choice also needs a
  // category answer in it: an embed grant alone is not an answer to the banner.
  var current =
    stored &&
    stored.f === 1 &&
    stored.v === cfg.v &&
    typeof stored.u === 'number' &&
    Date.now() - stored.u <= cfg.cookie.days * DAY
      ? stored
      : null
  S.choice =
    current && current.c && typeof current.c === 'object' ? current : null
  S.grants =
    current && current.s && typeof current.s === 'object' ? current.s : {}

  // Every lookup by a name reads own properties only: `constructor` and the
  // rest of Object.prototype must never answer as a category, a service or a
  // grant.
  function own(o, key) {
    return Object.prototype.hasOwnProperty.call(o, key)
  }
  S.own = own

  function categoryGranted(name) {
    if (S.choice) return own(S.choice.c, name) && !!S.choice.c[name]
    return own(modeOf, name) && modeOf[name] === 'objection'
  }
  S.categoryGranted = categoryGranted

  function has(name) {
    if (name === 'necessary') return true
    if (own(modeOf, name)) return categoryGranted(name)
    if (!own(serviceCategory, name)) return false
    var category = serviceCategory[name]
    if (category === 'necessary') return true
    return (
      categoryGranted(category) || (own(S.grants, name) && !!S.grants[name])
    )
  }
  S.has = has

  function state() {
    var out = {}
    for (var cat in cfg.google.map) {
      var types = cfg.google.map[cat]
      for (var i = 0; i < types.length; i++)
        if (out[types[i]] !== 'granted')
          out[types[i]] =
            modeOf[cat] && categoryGranted(cat) ? 'granted' : 'denied'
    }
    return out
  }
  S.state = state

  function snapshot() {
    var choice = S.choice
    if (!choice) return null
    var c = {}
    categories.forEach(function (name) {
      c[name] = !!choice.c[name]
    })
    var s = {}
    for (var k in S.grants) if (S.grants[k]) s[k] = true
    return Object.freeze({
      id: choice.id || null,
      version: choice.v,
      at: choice.u,
      categories: Object.freeze(c),
      services: Object.freeze(s),
    })
  }
  S.snapshot = snapshot

  if (S.choice) gtag('consent', 'update', state())

  function body() {
    return doc.body
  }
  S.body = body

  function firstElement(fragment) {
    var n = fragment.firstChild
    while (n && n.nodeType !== 1) n = n.nextSibling
    return n
  }
  S.firstElement = firstElement

  // A bar fixed to the bottom covers the end of the page and whatever has
  // focus beneath it. Three things keep both reachable (WCAG 2.2 SC 2.4.11),
  // measured in Chromium by the browser suite:
  // - a spacer the bar's height, kept last in <body>, so the page's own last
  //   content (its footer, the settings control) scrolls clear of the bar;
  // - `scroll-padding-bottom`, for scrolling to a fragment;
  // - a `focusin` check, because Chromium does not scroll an element that is
  //   inside the viewport but under the bar when focus moves to it.
  // Here rather than in the cached file because the banner mounts here.
  var bar = null
  var spacer = null
  function fitBar() {
    var root = doc.documentElement
    var b = body()
    // Only a bar that is actually fixed covers anything: a site's own banner
    // partial may sit in the flow whatever `ui.position` says.
    var fixed =
      bar &&
      bar.parentNode &&
      (typeof win.getComputedStyle !== 'function' ||
        win.getComputedStyle(bar).position === 'fixed')
    var height = fixed ? bar.offsetHeight || 0 : 0
    root.style.scrollPaddingBottom = height ? height + 'px' : ''
    if (!b) return
    if (!height) {
      if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer)
      return
    }
    if (!spacer) {
      spacer = doc.createElement('div')
      spacer.setAttribute('data-kiss-consent-spacer', '')
      spacer.setAttribute('aria-hidden', 'true')
    }
    spacer.style.height = height + 'px'
    // Moved to the end on each fit: placed while the page is still parsing,
    // it would otherwise sit above everything parsed after it.
    if (b.lastChild !== spacer) b.appendChild(spacer)
  }
  S.fitBar = fitBar
  function setPadding(el) {
    if (cfg.position !== 'bottom') return
    bar = el
    fitBar()
    if (el && typeof win.ResizeObserver === 'function') {
      var ro = new win.ResizeObserver(fitBar)
      ro.observe(el)
      el.__kissObserver = ro
    }
  }
  S.setPadding = setPadding
  S.clearPadding = function (el) {
    if (el && el.__kissObserver) el.__kissObserver.disconnect()
    if (cfg.position !== 'bottom') return
    if (bar === el) bar = null
    fitBar()
  }
  doc.addEventListener('focusin', function (event) {
    var target = event.target
    if (!bar || !bar.parentNode || !target || target.nodeType !== 1) return
    if (
      typeof win.getComputedStyle === 'function' &&
      win.getComputedStyle(bar).position !== 'fixed'
    )
      return
    if (
      bar.contains(target) ||
      typeof target.getBoundingClientRect !== 'function'
    )
      return
    var hidden =
      target.getBoundingClientRect().bottom - bar.getBoundingClientRect().top
    if (hidden > 0 && typeof win.scrollBy === 'function')
      win.scrollBy(0, hidden + 8)
  })

  function bannerEl() {
    return doc.querySelector('[data-kiss-consent-root]')
  }
  S.bannerEl = bannerEl

  function mount() {
    if (S.choice || !categories.length) return
    if (readCookie(S.closedName) !== null) return
    if (bannerEl()) return
    var tpl = doc.querySelector('template[data-kiss-consent-banner]')
    var b = body()
    if (!tpl || !b) return
    var el = firstElement(tpl.content.cloneNode(true))
    if (!el) return
    el.setAttribute('data-kiss-consent-root', '')
    b.insertBefore(el, b.firstChild)
    setPadding(el)
  }
  S.mount = mount

  function closest(el, attr) {
    while (el && el.nodeType === 1 && !el.hasAttribute(attr)) el = el.parentNode
    return el && el.nodeType === 1 ? el : null
  }
  S.closest = closest

  // Until the cached file has started, a click on a consent control and a
  // call the stub cannot answer are kept, in order, for it to replay: the
  // banner shows before the file arrives, and a quick Accept is not lost. If
  // the file never arrives, nothing gated runs.
  doc.addEventListener('click', function (event) {
    if (S.ready) return
    var target = closest(event.target, 'data-kiss-consent-action')
    if (target) S.clicks.push(target)
  })
  // One `window.kissConsent` for the page's life: its methods queue until
  // the client has started (`S.api`), then hand straight to it. Replacing the
  // object stranded any script that had kept it or one of its methods, its
  // calls queued after the queue was drained (Codex round 3).
  function later(name) {
    return function () {
      if (S.api) return S.api[name].apply(S.api, arguments)
      S.calls.push([name, arguments])
    }
  }

  // The cached file, from the site's root. A page is reached at more than
  // one address: `guide/index.html` as /guide, /guide/ (a server's redirect)
  // or /guide/index.html, under any prefix, on any origin, even file://. A
  // URL written at build time was right at one of them, and at the others
  // every button was dead (Codex at the close, 2026-11-04). So the root is
  // whatever the address is in front of the page's own file, in any of its
  // forms; an address that is none of them (a 404 page, served anywhere)
  // takes the root `siteUrl` names.
  //
  // The address is the visitor's, though, and the root is re-read as a URL:
  // `/%5Cevil.example/404` decodes to `/\evil.example/404`, and a browser
  // reads `/\` as `//`, another host (the security review, 2026-11-06). So a
  // derived root counts only when the browser's own URL algorithm puts the
  // file on the page's protocol and host (`host`, so another port is not let
  // through; not `origin`, which is `null` for every file:// page). And a
  // derived root that is same-host but wrong (a 404 page at /missing/404)
  // fails the load, so the file is tried once more from the fallback.
  var client = cfg.client
  if (client) {
    var at = String(win.location.pathname || '')
    try {
      at = decodeURI(at)
    } catch {
      /* a malformed address: compared as it is */
    }
    var file = client.page
    var root = client.root
    var forms = file === null ? [] : [file]
    if (/(^|\/)index\.html$/.test(file)) {
      var folder = file.slice(0, -10)
      forms.push(folder, folder.replace(/\/$/, ''))
    } else if (/\.html$/.test(file)) forms.push(file.slice(0, -5))
    for (var f = 0; f < forms.length; f++) {
      var cut = at.length - forms[f].length
      if (cut > 0 && at.slice(cut) === forms[f] && at[cut - 1] === '/') {
        root = at.slice(0, cut)
        break
      }
    }
    try {
      var here = new win.URL(win.location.href)
      var to = new win.URL(root + client.name, here)
      if (to.protocol !== here.protocol || to.host !== here.host)
        root = client.root
    } catch {
      root = client.root
    }
    var load = function (from) {
      var tag = doc.createElement('script')
      tag.setAttribute('src', from + client.name)
      tag.setAttribute('data-kiss-consent-client', '')
      if (from !== client.root)
        tag.addEventListener('error', function () {
          load(client.root)
        })
      ;(doc.head || doc.documentElement).appendChild(tag)
    }
    load(root)
  }

  win.__kissConsent = S
  win.kissConsent = {
    has: has,
    get choice() {
      return snapshot()
    },
    show: later('show'),
    when: later('when'),
    on: later('on'),
    mount: mount,
  }
}

/**
 * The cached part, run once by the deferred file.
 *
 * @param {any} win the page's `window`
 */
function kissConsentClient(win) {
  var S = win.__kissConsent
  // `loaded`: this file has run. `ready` (in start()) is later: the page has
  // parsed and what came first is applied. The inline part adds this file's
  // tag, so it can run while the page still loads, and until start() the
  // head keeps queuing clicks and the stub keeps queuing calls (Codex round
  // 10: a when() went live under an objection category while the Reject
  // before it was still queued).
  if (!S || S.loaded) return
  S.loaded = true
  var doc = win.document
  var cfg = S.cfg
  var categories = S.categories
  var modeOf = S.modeOf
  var serviceCategory = S.serviceCategory
  var has = S.has
  var categoryGranted = S.categoryGranted
  var snapshot = S.snapshot
  var setPadding = S.setPadding
  var clearPadding = S.clearPadding
  var bannerEl = S.bannerEl
  var body = S.body
  var firstElement = S.firstElement
  var closest = S.closest
  var gtag = S.gtag
  var closedName = S.closedName
  // The browser's own dated copy of every record it made, named after the
  // choice cookie as the closed one is: `kiss_consent_log` by default.
  var logName = cfg.cookie.name + '_log'
  var listeners = { ready: [], change: [] }
  var waiters = []
  var readyFired = false
  // What this page has started, so a later refusal knows to withdraw it: a
  // category whose services ran, and each service started on its own (an
  // embed revealed, a gated script revived, or a when() callback run) under
  // an "always allow" grant while its category may be refused.
  var activeCategories = {}
  var startedServices = {}
  function started(name) {
    if (S.own(modeOf, name)) activeCategories[name] = true
    else if (serviceCategory[name] && serviceCategory[name] !== 'necessary')
      startedServices[name] = true
  }

  function hostDomains() {
    var parts = String(win.location.hostname || '').split('.')
    var out = ['']
    for (var i = 0; i < parts.length - 1; i++)
      out.push(parts.slice(i).join('.'))
    return out
  }

  function matches(pattern, name) {
    return pattern.slice(-1) === '*'
      ? name.indexOf(pattern.slice(0, -1)) === 0
      : name === pattern
  }

  function matching(pattern, names) {
    if (pattern.slice(-1) !== '*') return [pattern]
    return names.filter(function (n) {
      return matches(pattern, n)
    })
  }

  // Whether a service that is allowed declares this cookie or storage key
  // too (`gtag` and `gtm` both declare `_ga`): then it is not the refused
  // service's alone, and deleting it would reset the allowed one.
  function keptBy(names, kind, name) {
    return cfg.services.some(function (s) {
      return (
        names.indexOf(s.name) === -1 &&
        has(s.name) &&
        s[kind].some(function (pattern) {
          return matches(pattern, name)
        })
      )
    })
  }

  // Deletes the declared first-party cookies and storage keys of the given
  // services: on no domain, the host and every parent domain, `Path=/` (S7);
  // never one an allowed service declares as well.
  function clearServices(names) {
    var present = (doc.cookie || '')
      .split(/;\s*/)
      .map(function (c) {
        return c.split('=')[0]
      })
      .filter(Boolean)
    var keys = []
    try {
      for (var k = 0; k < win.localStorage.length; k++)
        keys.push(win.localStorage.key(k))
    } catch {
      keys = []
    }
    var domains = hostDomains()
    cfg.services.forEach(function (s) {
      if (names.indexOf(s.name) === -1) return
      s.cookies.forEach(function (pattern) {
        matching(pattern, present).forEach(function (name) {
          if (keptBy(names, 'cookies', name)) return
          // A browser refuses to write a `__Secure-` or `__Host-` cookie, a
          // deletion included, without Secure, and a `__Host-` one with a
          // Domain: only the host-only write can delete that.
          var host = name.indexOf('__Host-') === 0
          var tail = host || name.indexOf('__Secure-') === 0 ? '; Secure' : ''
          domains.forEach(function (d) {
            if (d && host) return
            doc.cookie =
              name + '=; Path=/; Max-Age=0' + (d ? '; Domain=' + d : '') + tail
          })
        })
      })
      s.storage.forEach(function (pattern) {
        matching(pattern, keys).forEach(function (key) {
          // The consent log is the consent mechanism's own, whatever a
          // service's pattern matches (D8).
          if (key === logName || keptBy(names, 'storage', key)) return
          try {
            win.localStorage.removeItem(key)
          } catch {
            /* storage unavailable: nothing to clear */
          }
        })
      })
    })
  }

  function deniedServices() {
    return cfg.services
      .filter(function (s) {
        return !has(s.name)
      })
      .map(function (s) {
        return s.name
      })
  }

  // Every load, before anything gated runs (nothing is activated until this
  // file has started): clear what denied services left behind. It catches a
  // cookie a script rewrote on `pagehide` before a withdrawal's reload, and a
  // withdrawal made in another tab.
  clearServices(deniedServices())

  function secure() {
    return win.location.protocol === 'https:' ? '; Secure' : ''
  }

  function domainPart() {
    return cfg.cookie.domain ? '; Domain=' + cfg.cookie.domain : ''
  }

  function newId() {
    var c = win.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
    var bytes = new Uint8Array(16)
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
    return Array.prototype.map
      .call(bytes, function (b) {
        return (b < 16 ? '0' : '') + b.toString(16)
      })
      .join('')
  }

  function write(c, s) {
    var now = Date.now()
    var stored = S.stored
    var record = {
      f: 1,
      t: stored && typeof stored.t === 'number' ? stored.t : now,
      u: now,
      v: cfg.v,
      c: c,
      s: s,
    }
    // Always: the log and the history page carry it, endpoint or not (D1).
    record.id = (stored && stored.id) || newId()
    doc.cookie =
      cfg.cookie.name +
      '=' +
      encodeURIComponent(JSON.stringify(record)) +
      '; Path=/; Max-Age=' +
      cfg.cookie.days * 86400 +
      '; SameSite=Lax' +
      domainPart() +
      secure()
    S.stored = record
    return record
  }

  // One choice, recorded: appended to the browser's log first, then posted,
  // in the one format both hold (format 2: format 1 plus `format` and
  // `action`), so the visitor's copy and the server's are the same records.
  // Both happen before a withdrawal's reload, and neither can block it.
  // Every non-necessary service, allowed or refused, as this choice leaves it:
  // by its category's answer (or, before one, its category's mode), else by
  // its own Always allow. The services a category covers can change later, so
  // the record says what was agreed to at the time (the operator, 2026-11-04).
  function servicesAgreed(stored) {
    var out = {}
    var c = stored.c && typeof stored.c === 'object' ? stored.c : null
    var s = stored.s && typeof stored.s === 'object' ? stored.s : {}
    for (var name in serviceCategory) {
      if (!S.own(serviceCategory, name)) continue
      var category = serviceCategory[name]
      if (category === 'necessary') continue
      var byCategory = c
        ? S.own(c, category) && !!c[category]
        : S.own(modeOf, category) && modeOf[category] === 'objection'
      out[name] = byCategory || (S.own(s, name) && !!s[name])
    }
    return out
  }

  function logChoice(stored, action) {
    var entry = {
      format: 2,
      action: action,
      id: stored.id,
      version: stored.v,
      timestamp: new Date(stored.u).toISOString(),
      categories: stored.c,
      services: servicesAgreed(stored),
      bannerHash: cfg.bannerHash,
      page: win.location.pathname,
    }
    try {
      var log = JSON.parse(win.localStorage.getItem(logName))
      if (!Array.isArray(log)) log = []
      log.push(entry)
      win.localStorage.setItem(logName, JSON.stringify(log.slice(-50)))
    } catch {
      try {
        win.localStorage.setItem(logName, JSON.stringify([entry]))
      } catch {
        /* storage unavailable: the choice stands, unlogged (D10) */
      }
    }
    post(JSON.stringify(entry))
  }

  function post(body) {
    if (!cfg.endpoint) return
    try {
      var nav = win.navigator
      if (nav && typeof nav.sendBeacon === 'function') {
        var Blob = win.Blob
        if (
          nav.sendBeacon(cfg.endpoint, new Blob([body], { type: 'text/plain' }))
        )
          return
      }
      if (typeof win.fetch === 'function')
        win.fetch(cfg.endpoint, {
          method: 'POST',
          body: body,
          keepalive: true,
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
        })
    } catch {
      /* a lost log line never blocks the visitor's choice */
    }
  }

  function emit(type, detail) {
    var list = listeners[type]
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](detail)
      } catch {
        /* one listener's error never stops the rest */
      }
    }
    if (typeof win.CustomEvent === 'function')
      doc.dispatchEvent(
        new win.CustomEvent('kiss-consent:' + type, { detail: detail }),
      )
  }

  function runWaiters() {
    var pending = waiters
    waiters = []
    pending.forEach(function (w) {
      if (has(w.name)) {
        started(w.name)
        try {
          w.fn()
        } catch {
          /* the site's callback; kiss carries on */
        }
      } else waiters.push(w)
    })
  }

  // The serial activation queue (S2): each gated script, in document order,
  // replaced by a live clone. An external one holds the queue until it loads,
  // fails or 10 seconds pass; a `data-async` one never does.
  var queue = []
  var running = false
  var moduleCount = 0
  function activate() {
    var list = doc.querySelectorAll(
      'script[type="text/plain"][data-kiss-service]',
    )
    for (var i = 0; i < list.length; i++) {
      var el = list[i]
      if (el.getAttribute('data-kiss-queued')) continue
      if (!has(el.getAttribute('data-kiss-service'))) continue
      started(el.getAttribute('data-kiss-service'))
      el.setAttribute('data-kiss-queued', '1')
      queue.push(el)
    }
    if (!running) next()
  }
  function next() {
    var orig = queue.shift()
    if (!orig) {
      running = false
      return
    }
    running = true
    var s = doc.createElement('script')
    var attrs = orig.attributes
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name
      if (
        name === 'type' ||
        name === 'data-src' ||
        name === 'data-type' ||
        name === 'data-async' ||
        name === 'data-kiss-queued' ||
        name === 'data-kiss-consent'
      )
        continue
      s.setAttribute(name, attrs[i].value)
    }
    s.setAttribute('data-kiss-done', '1')
    var type = orig.getAttribute('data-type')
    if (type) s.setAttribute('type', type)
    var src = orig.getAttribute('data-src')
    var holds = false
    var signal = null
    if (src) {
      s.async = orig.hasAttribute('data-async')
      holds = !s.async
      s.src = src
    } else if (type === 'module' && !orig.hasAttribute('data-async')) {
      // An inline module runs after the code that inserts it and fires no
      // load event, so its own last statement releases the queue. A module
      // that throws, or whose import fails ('error'), is let go by the timer
      // or the error event.
      holds = true
      signal = '__kissConsentRan' + ++moduleCount
      s.text = orig.text + '\n;window[' + JSON.stringify(signal) + ']()'
    } else s.text = orig.text
    if (holds) {
      var done = false
      var go = function () {
        if (done) return
        done = true
        if (signal) delete win[signal]

        next()
      }
      if (signal) win[signal] = go
      s.addEventListener('load', go)
      s.addEventListener('error', go)
      win.setTimeout(go, 10000)
    }
    orig.parentNode.replaceChild(s, orig)
    if (!holds) next()
  }

  // Embeds: the frame waits in a `<template>` until revealed (S4).
  // `clicked`: revealed by its own Load button, which for a video box
  // (`data-kiss-embed-autoplay`) is the request to play, so the player is
  // asked to start. A reveal from a stored choice never is.
  function reveal(box, clicked) {
    if (box.getAttribute('data-kiss-done')) return
    var tpl = box.querySelector('template[data-kiss-embed-frame]')
    if (!tpl) return
    box.setAttribute('data-kiss-done', '1')
    var frame = tpl.content.cloneNode(true)
    var f = frame.querySelector('iframe')
    if (clicked && f && box.hasAttribute('data-kiss-embed-autoplay')) {
      try {
        var u = new URL(f.getAttribute('src') || '')
        u.searchParams.set('autoplay', '1')
        f.setAttribute('src', u.toString())
      } catch (_) {
        // A src the URL parser refuses loads as written.
      }
    }
    tpl.parentNode.insertBefore(frame, tpl)
    var ui = box.querySelectorAll('[data-kiss-consent-ui]')
    for (var i = 0; i < ui.length; i++) ui[i].hidden = true
    started(box.getAttribute('data-kiss-embed'))
  }
  function revealAllowed() {
    var boxes = doc.querySelectorAll('[data-kiss-embed]')
    for (var i = 0; i < boxes.length; i++)
      if (has(boxes[i].getAttribute('data-kiss-embed'))) reveal(boxes[i])
  }

  function markActive() {
    categories.forEach(function (name) {
      if (categoryGranted(name)) activeCategories[name] = true
    })
  }

  function removeBanner() {
    var el = bannerEl()
    if (el) {
      clearPadding(el)
      el.parentNode.removeChild(el)
    }
  }

  function confirm() {
    var old = doc.querySelector('[data-kiss-consent-confirmation]')
    if (old) old.parentNode.removeChild(old)
    var box = doc.createElement('div')
    box.setAttribute('data-kiss-consent-confirmation', '')
    box.setAttribute('class', 'kiss-consent-confirmation')
    box.setAttribute('role', 'status')
    box.setAttribute('tabindex', '-1')
    box.setAttribute('data-position', cfg.position)
    var text = doc.createElement('span')
    text.textContent = cfg.text.confirmation + ' '
    var hide = doc.createElement('button')
    hide.setAttribute('type', 'button')
    hide.setAttribute('data-kiss-consent-action', 'hide')
    hide.textContent = cfg.text.hide
    box.appendChild(text)
    box.appendChild(hide)
    var banner = bannerEl()
    if (banner) {
      clearPadding(banner)
      banner.parentNode.replaceChild(box, banner)
    } else if (body()) body().insertBefore(box, body().firstChild)
    setPadding(box)
    if (typeof box.focus === 'function') box.focus()
  }

  function dialogEl() {
    return doc.querySelector('[data-kiss-consent-dialog]')
  }

  function openDialog() {
    var dlg = dialogEl()
    if (!dlg) {
      var tpl = doc.querySelector('template[data-kiss-consent-settings]')
      if (!tpl || !body()) return
      dlg = firstElement(tpl.content.cloneNode(true))
      if (!dlg) return
      dlg.setAttribute('data-kiss-consent-dialog', '')
      body().appendChild(dlg)
    }
    var boxes = dlg.querySelectorAll('input[data-kiss-consent-category]')
    for (var i = 0; i < boxes.length; i++)
      boxes[i].checked = categoryGranted(
        boxes[i].getAttribute('data-kiss-consent-category'),
      )
    var grantRows = dlg.querySelectorAll('[data-kiss-consent-grant]')
    for (var j = 0; j < grantRows.length; j++) {
      var name = grantRows[j].getAttribute('data-kiss-consent-grant')
      grantRows[j].hidden = !S.grants[name]
      var input = grantRows[j].querySelector('input[data-kiss-consent-service]')
      if (input) input.checked = !!S.grants[name]
    }
    if (typeof dlg.showModal === 'function' && !dlg.open) {
      try {
        dlg.showModal()
      } catch {
        dlg.setAttribute('open', '')
      }
    } else dlg.setAttribute('open', '')
  }

  function closeDialog() {
    var dlg = dialogEl()
    if (!dlg) return
    try {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close()
    } catch {
      /* removed below either way */
    }
    dlg.parentNode.removeChild(dlg)
  }

  // A choice: write it, tell Consent Mode, log it, then either withdraw (a
  // category or a revealed embed this page used is now refused: delete and
  // reload) or start what is newly allowed.
  function commit(c, s, action) {
    // Denying a category clears the "always allow" grants of its services,
    // so a grant never outlives the category it was given under.
    var before = {}
    categories.forEach(function (name) {
      before[name] = categoryGranted(name)
    })
    categories.forEach(function (name) {
      if (before[name] && !c[name])
        cfg.services.forEach(function (svc) {
          if (svc.category === name) delete s[svc.name]
        })
    })
    var record = write(c, s)
    S.choice = record
    S.grants = s
    gtag('consent', 'update', S.state())
    var flags = {}
    categories.forEach(function (name) {
      flags[name] = !!c[name]
    })
    win.dataLayer.push({ event: 'kiss_consent', kiss_consent: flags })
    logChoice(record, action)
    var granted = []
    var revoked = []
    categories.forEach(function (name) {
      if (c[name] && !before[name]) granted.push(name)
      if (activeCategories[name] && !c[name]) revoked.push(name)
    })
    for (var svc in startedServices) if (!has(svc)) revoked.push(svc)
    if (revoked.length) {
      clearServices(deniedServices())
      win.location.reload()
      return
    }
    closeDialog()
    markActive()
    activate()
    revealAllowed()
    confirm()
    emit('change', { choice: snapshot(), granted: granted, revoked: [] })
    runWaiters()
  }

  function all(value) {
    var c = {}
    categories.forEach(function (name) {
      c[name] = value
    })
    return c
  }

  function copyGrants() {
    var s = {}
    for (var k in S.grants) if (S.grants[k]) s[k] = 1
    return s
  }

  function act(target) {
    var action = target.getAttribute('data-kiss-consent-action')
    if (action === 'accept') commit(all(true), copyGrants(), action)
    // Reject all refuses everything, the "always allow" grants included: a
    // grant made under a category that was already refused would otherwise
    // survive it, because commit() clears only the grants of a category it
    // sees change from granted to refused.
    else if (action === 'reject') commit(all(false), {}, action)
    else if (action === 'settings') openDialog()
    else if (action === 'close-dialog') closeDialog()
    else if (action === 'save') {
      var dlg = dialogEl()
      var c = all(false)
      var s = copyGrants()
      if (dlg) {
        var boxes = dlg.querySelectorAll('input[data-kiss-consent-category]')
        for (var i = 0; i < boxes.length; i++)
          c[boxes[i].getAttribute('data-kiss-consent-category')] =
            !!boxes[i].checked
        var gs = dlg.querySelectorAll('input[data-kiss-consent-service]')
        for (var j = 0; j < gs.length; j++)
          if (!gs[j].checked)
            delete s[gs[j].getAttribute('data-kiss-consent-service')]
      }
      commit(c, s, action)
    } else if (action === 'close') {
      doc.cookie =
        closedName + '=1; Path=/; SameSite=Lax' + domainPart() + secure()
      removeBanner()
    } else if (action === 'hide') {
      var box = doc.querySelector('[data-kiss-consent-confirmation]')
      if (box) {
        clearPadding(box)
        box.parentNode.removeChild(box)
      }
    } else if (action === 'load' || action === 'allow') {
      var embed = closest(target, 'data-kiss-embed')
      if (!embed) return
      if (action === 'load') return reveal(embed, true)
      var name = embed.getAttribute('data-kiss-embed')
      var s2 = copyGrants()
      s2[name] = 1
      var record = write(S.choice ? S.choice.c : null, s2)
      S.grants = s2
      if (S.choice) S.choice = record
      logChoice(record, 'allow')
      // A grant starts everything of the service on the page, its gated
      // scripts as well as its embeds, as a category choice does.
      activate()
      revealAllowed()
      emit('change', { choice: snapshot(), granted: [name], revoked: [] })
      runWaiters()
    }
  }

  var api = {
    has: has,
    get choice() {
      return snapshot()
    },
    show: openDialog,
    when: function (name, fn) {
      if (has(name)) {
        started(name)
        fn()
      } else waiters.push({ name: name, fn: fn })
    },
    on: function (type, fn) {
      if (!listeners[type]) return
      listeners[type].push(fn)
      if (type === 'ready' && readyFired) fn({ choice: snapshot() })
    },
    mount: S.mount,
  }
  // Not put on `window`: the stub stays `window.kissConsent`, and hands each
  // call here once start() has set `S.api`.

  doc.addEventListener('click', function (event) {
    // Before start(), the head's listener queues the click, in order.
    if (!S.ready) return
    var target = closest(event.target, 'data-kiss-consent-action')
    if (target) return act(target)
    // A link in the dialog (the policy, the history) closes it, so a jump
    // within this page does not leave the history behind the modal (Codex
    // round 5). After the click, not during it: removed now, the link would
    // leave the document, and a browser follows no such link.
    var link = closest(event.target, 'href')
    var dlg = dialogEl()
    if (!link || !dlg || !dlg.contains(link)) return
    // Not for a click that opens a new tab or window, or that something
    // cancelled: the visitor stays here, with any switches they had moved.
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button > 0 ||
      link.getAttribute('target')
    )
      return
    // A jump within this page: once the dialog has closed, focus goes to the
    // section the link names, not back to the control that opened it.
    var id = null
    try {
      var to = new win.URL(link.getAttribute('href'), win.location.href)
      if (to.pathname === win.location.pathname && to.hash)
        id = decodeURIComponent(to.hash.slice(1))
    } catch {
      id = null
    }
    win.setTimeout(function () {
      closeDialog()
      var target = id && doc.getElementById(id)
      if (!target || typeof target.focus !== 'function') return
      if (!target.hasAttribute('tabindex'))
        target.setAttribute('tabindex', '-1')
      target.focus()
    }, 0)
  })

  function replay(calls, names) {
    calls.forEach(function (call) {
      if (names.indexOf(call[0]) === -1) return
      try {
        api[call[0]].apply(api, call[1])
      } catch {
        /* the site's callback; kiss carries on */
      }
    })
  }

  function start() {
    // What happened before this file arrived, applied before anything
    // starts: a Reject queued while the file downloaded was replayed after
    // the first activation, so an objection category's script ran, and the
    // page reloaded to withdraw it (Codex round 2, P1). First the listeners,
    // which start nothing; then the visitor's clicks, so every choice holds
    // before anything is started; and only after the activation below the
    // calls that can start something (`when`) or show something (`show`).
    var calls = S.calls
    S.calls = []
    var clicks = S.clicks
    S.clicks = []
    // From here every call and click is live: anything a replayed choice's
    // listener calls runs after that choice, which is the order it was made in.
    S.ready = true
    S.api = api
    replay(calls, ['on'])
    // A control the visitor could no longer have clicked is not replayed: a
    // double click on Accept removed the banner with the first, and the
    // second logged and posted the choice again (the stopgap review, P3).
    clicks.forEach(function (target) {
      if (doc.documentElement.contains(target)) act(target)
    })
    // The page has parsed: the spacer can now go after everything in it.
    S.fitBar()
    markActive()
    activate()
    revealAllowed()
    readyFired = true
    emit('ready', { choice: snapshot() })
    runWaiters()
    replay(calls, ['when', 'show'])
  }
  if (doc.readyState === 'loading')
    doc.addEventListener('DOMContentLoaded', start)
  else start()
}

// The two line separators JSON leaves raw but a `<script>` must not hold.
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/**
 * A value as JSON that is safe inside an inline `<script>`: `<`, U+2028 and
 * U+2029 escaped, so no site text (a banner wording with `</script>` in it)
 * can end the script. Shared with `lib/consent-record.js`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029')
}

/**
 * The cached file's source: the client, called on `window`. It holds no
 * site config, so it is the same for every site on one kiss version.
 *
 * @returns {string}
 */
export function consentClientSource() {
  return `(${kissConsentClient.toString()})(window);\n`
}

/**
 * The cached file's name, `kiss-consent.<10 hex of its source's sha256>.js`:
 * it changes only when the client's code does, so it can be cached for good.
 *
 * @returns {string}
 */
export function consentClientName() {
  if (clientName) return clientName
  const hash = createHash('sha256').update(consentClientSource()).digest('hex')
  return (clientName = `kiss-consent.${hash.slice(0, 10)}.js`)
}
/** @type {string|null} the source is fixed for the process's life */
let clientName = null

/**
 * What the inline part needs to load the cached file: its name, the page's
 * own file, and the root to use for an address that is not the page's.
 *
 * @typedef {Object} ConsentClientFile
 * @property {string} name `consentClientName()`
 * @property {string|null} page the page's build-relative file
 * (`guide/index.html`); `null` when the page has none, and `root` is used
 * @property {string} root the root `siteUrl` names, as a path with its
 * slash (`/`, or `/site/` under a prefix)
 */

/**
 * What `{{consentHead}}` writes: the inline part, called with the page's
 * config as `inlineJson`. It adds the cached file's tag itself, at the URL
 * the browser's address gives (`rootOf`), so no tag for it is written here.
 *
 * @param {Record<string, any>} cfg `clientConfig()` from `lib/consent.js`
 * @param {ConsentClientFile} client the cached file
 * @returns {string}
 */
export function consentHeadScript(cfg, client) {
  const withClient = {
    ...cfg,
    client: { name: client.name, page: client.page, root: client.root },
  }
  return `<script data-kiss-consent-head>(${kissConsentHead.toString()})(window,${inlineJson(withClient)})</script>`
}

export { kissConsentHead, kissConsentClient }
