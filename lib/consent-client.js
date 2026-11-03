// The consent manager's browser side: one function, inlined into every page by
// `{{consentHead}}` through `Function.prototype.toString`, as
// `lib/scorm-bridge.js` is. It must use nothing from this module's scope: only
// its arguments and the browser's globals. A production build minifies it with
// the page, and the tests run it both as rendered and terser-minified.
//
// Every behavioural choice here was measured in Chromium first (contract
// `planning/plans/2026-11-02-consent-manager.md`, Appendix A): the serial
// activation queue (S2), Consent Mode `update` before activation (S1), the
// iframe kept in a `<template>` until revealed (S4), the banner mounted inline
// before first paint (S5), the beacon sent before a reload (S6), and deleting a
// cookie on the host and every parent domain (S7).

/**
 * @param {any} win the page's `window`
 * @param {any} cfg `clientConfig()` from `lib/consent.js`
 */
function kissConsentClient(win, cfg) {
  var doc = win.document
  if (win.kissConsent) return
  var DAY = 86400000
  var categories = cfg.categories.map(function (c) {
    return c.name
  })
  var modeOf = {}
  cfg.categories.forEach(function (c) {
    modeOf[c.name] = c.mode
  })
  var serviceCategory = {}
  cfg.services.forEach(function (s) {
    serviceCategory[s.name] = s.category
  })
  var closedName = cfg.cookie.name + '_closed'
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
    if (Object.prototype.hasOwnProperty.call(modeOf, name))
      activeCategories[name] = true
    else if (serviceCategory[name] && serviceCategory[name] !== 'necessary')
      startedServices[name] = true
  }

  // Consent Mode: the stub, the default, then the settings. Before any Google
  // tag, which is what the wiring check enforces.
  win.dataLayer = win.dataLayer || []
  var gtag =
    win.gtag ||
    function () {
      win.dataLayer.push(arguments)
    }
  if (!win.gtag) win.gtag = gtag
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

  var stored = parseStored()
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
  var choice =
    current && current.c && typeof current.c === 'object' ? current : null
  var grants =
    current && current.s && typeof current.s === 'object' ? current.s : {}

  function categoryGranted(name) {
    if (choice) return !!choice.c[name]
    return modeOf[name] === 'objection'
  }

  function has(name) {
    if (name === 'necessary') return true
    if (Object.prototype.hasOwnProperty.call(modeOf, name))
      return categoryGranted(name)
    var category = serviceCategory[name]
    if (!category) return false
    if (category === 'necessary') return true
    return categoryGranted(category) || !!grants[name]
  }

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

  function hostDomains() {
    var parts = String(win.location.hostname || '').split('.')
    var out = ['']
    for (var i = 0; i < parts.length - 1; i++)
      out.push(parts.slice(i).join('.'))
    return out
  }

  function matching(pattern, names) {
    if (pattern.slice(-1) !== '*') return [pattern]
    var prefix = pattern.slice(0, -1)
    return names.filter(function (n) {
      return n.indexOf(prefix) === 0
    })
  }

  // Deletes the declared first-party cookies and storage keys of the given
  // services: on no domain, the host and every parent domain, `Path=/` (S7).
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

  // Every load, before anything runs: clear what denied services left
  // behind. It catches a cookie a script rewrote on `pagehide` before a
  // withdrawal's reload, and a withdrawal made in another tab.
  clearServices(deniedServices())
  if (choice) gtag('consent', 'update', state())

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
    var record = {
      f: 1,
      t: stored && typeof stored.t === 'number' ? stored.t : now,
      u: now,
      v: cfg.v,
      c: c,
      s: s,
    }
    if (cfg.endpoint) record.id = (stored && stored.id) || newId()
    doc.cookie =
      cfg.cookie.name +
      '=' +
      encodeURIComponent(JSON.stringify(record)) +
      '; Path=/; Max-Age=' +
      cfg.cookie.days * 86400 +
      '; SameSite=Lax' +
      domainPart() +
      secure()
    stored = record
    return record
  }

  function post(record) {
    if (!cfg.endpoint) return
    var body = JSON.stringify({
      id: record.id,
      version: record.v,
      timestamp: new Date(record.u).toISOString(),
      categories: record.c,
      services: record.s,
      bannerHash: cfg.bannerHash,
      page: win.location.pathname,
    })
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

  function snapshot() {
    if (!choice) return null
    var c = {}
    categories.forEach(function (name) {
      c[name] = !!choice.c[name]
    })
    var s = {}
    for (var k in grants) if (grants[k]) s[k] = true
    return Object.freeze({
      id: choice.id || null,
      version: choice.v,
      at: choice.u,
      categories: Object.freeze(c),
      services: Object.freeze(s),
    })
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

  function firstElement(fragment) {
    var n = fragment.firstChild
    while (n && n.nodeType !== 1) n = n.nextSibling
    return n
  }

  // Embeds: the frame waits in a `<template>` until revealed (S4).
  function reveal(box) {
    if (box.getAttribute('data-kiss-done')) return
    var tpl = box.querySelector('template[data-kiss-embed-frame]')
    if (!tpl) return
    box.setAttribute('data-kiss-done', '1')
    tpl.parentNode.insertBefore(tpl.content.cloneNode(true), tpl)
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

  function body() {
    return doc.body
  }

  // A bar fixed to the bottom covers the end of the page and whatever has
  // focus beneath it. Three things keep both reachable (WCAG 2.2 SC 2.4.11),
  // measured in Chromium by the browser suite:
  // - a spacer the bar's height, kept last in <body>, so the page's own last
  //   content (its footer, the settings control) scrolls clear of the bar;
  // - `scroll-padding-bottom`, for scrolling to a fragment;
  // - a `focusin` check, because Chromium does not scroll an element that is
  //   inside the viewport but under the bar when focus moves to it.
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
  function clearPadding(el) {
    if (el && el.__kissObserver) el.__kissObserver.disconnect()
    if (cfg.position !== 'bottom') return
    if (bar === el) bar = null
    fitBar()
  }
  function onFocus(event) {
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
  }

  function bannerEl() {
    return doc.querySelector('[data-kiss-consent-root]')
  }

  function mount() {
    if (choice || !categories.length) return
    if (readCookie(closedName) !== null) return
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
      grantRows[j].hidden = !grants[name]
      var input = grantRows[j].querySelector('input[data-kiss-consent-service]')
      if (input) input.checked = !!grants[name]
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
  function commit(c, s) {
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
    choice = record
    grants = s
    gtag('consent', 'update', state())
    var flags = {}
    categories.forEach(function (name) {
      flags[name] = !!c[name]
    })
    win.dataLayer.push({ event: 'kiss_consent', kiss_consent: flags })
    post(record)
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
    for (var k in grants) if (grants[k]) s[k] = 1
    return s
  }

  function closest(el, attr) {
    while (el && el.nodeType === 1 && !el.hasAttribute(attr)) el = el.parentNode
    return el && el.nodeType === 1 ? el : null
  }

  function onClick(event) {
    var target = closest(event.target, 'data-kiss-consent-action')
    if (!target) return
    var action = target.getAttribute('data-kiss-consent-action')
    if (action === 'accept') commit(all(true), copyGrants())
    // Reject all refuses everything, the "always allow" grants included: a
    // grant made under a category that was already refused would otherwise
    // survive it, because commit() clears only the grants of a category it
    // sees change from granted to refused.
    else if (action === 'reject') commit(all(false), {})
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
      commit(c, s)
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
      if (action === 'load') return reveal(embed)
      var name = embed.getAttribute('data-kiss-embed')
      var s2 = copyGrants()
      s2[name] = 1
      var record = write(choice ? choice.c : null, s2)
      grants = s2
      if (choice) choice = record
      post(record)
      revealAllowed()
      emit('change', { choice: snapshot(), granted: [name], revoked: [] })
      runWaiters()
    }
  }

  win.kissConsent = {
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
    mount: mount,
  }

  doc.addEventListener('click', onClick)
  doc.addEventListener('focusin', onFocus)

  function start() {
    // The page has parsed: the spacer can now go after everything in it.
    fitBar()
    markActive()
    activate()
    revealAllowed()
    readyFired = true
    emit('ready', { choice: snapshot() })
    runWaiters()
  }
  if (doc.readyState === 'loading')
    doc.addEventListener('DOMContentLoaded', start)
  else start()
}

// The two line separators JSON leaves raw but a `<script>` must not hold.
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/**
 * The `<script>` `{{consentHead}}` writes: the client, called with the page's
 * config. The config is JSON with `<`, U+2028 and U+2029 escaped, so no site
 * text (a banner wording with `</script>` in it) can end the script.
 *
 * @param {Record<string, any>} cfg `clientConfig()` from `lib/consent.js`
 * @returns {string}
 */
export function consentHeadScript(cfg) {
  const json = JSON.stringify(cfg)
    .replace(/</g, '\\u003c')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029')
  return `<script data-kiss-consent-head>(${kissConsentClient.toString()})(window,${json})</script>`
}

export { kissConsentClient }
