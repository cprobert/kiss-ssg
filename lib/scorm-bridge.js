/**
 * The bridge between a page and a SCORM 1.2 LMS, run in the browser. It finds
 * the LMS's `API` up the frame chain (or through the opener), starts the
 * session, completes the page when it is seen unless `manual`, and gives the
 * page `window.kissScorm` to record answers, a score and a status, and to
 * bookmark its place and save its state for the learner's next launch. With no
 * LMS every call does nothing, so the same page works on the web, in an IMS
 * content package and in a SCORM package.
 *
 * `scormBridgeScript()` inlines this function's source, so it must use nothing
 * from this module's scope: only its arguments and the browser's globals.
 *
 * @param {any} win the page's `window`
 * @param {boolean} manual leave completion to `kissScorm.status()`
 */
function kissScormBridge(win, manual) {
  if (win.kissScorm) return
  const STATUSES = ['passed', 'completed', 'failed', 'incomplete', 'browsed']
  // What SCORM 1.2 can hold: a bookmark of at most 255 characters, and state of
  // at most 4,096 bytes of printable ASCII. Anything else is refused, never cut.
  const fitsBookmark = (value) => String(value).length <= 255
  const fitsState = (value) =>
    String(value).length <= 4096 && /^[\x20-\x7e]*$/.test(String(value))
  // A CMITime, the moment an answer was given: read when the page gives it,
  // whichever queue it then waits in.
  const pad = (n) => String(n).padStart(2, '0')
  const clock = () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  // The page's answer as it is now: its own object may be reused or changed
  // while the copy waits. Answers are numbers, strings, booleans, arrays and
  // plain objects; anything else is kept as it is.
  const snapshot = (x) =>
    Array.isArray(x)
      ? x.map(snapshot)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x).map(([k, v]) => [k, snapshot(v)]),
          )
        : x
  // Where the one queue every waiting page of a SCO shares is kept: the
  // SCO's session, so the nearest window up the chain that holds the LMS's
  // `API` (two SCOs under one shell each have their own), or the topmost
  // window this page can reach when none does.
  const topReachable = (start) => {
    let top = start
    try {
      for (let i = 0; i < 20; i++) {
        if (top.API) return top
        if (!top.parent || top.parent === top) break
        const up = top.parent
        void up.document
        top = up
      }
    } catch {
      // A frame of another origin: the last one reachable.
    }
    return top
  }

  // The outermost kiss page of a SCO owns the session, whichever bridge runs
  // first. A same-origin parent still loading may yet run its own, so wait for
  // each one's DOMContentLoaded, queueing the page's calls, then decide.
  const loading = []
  try {
    for (let w = win, i = 0; i < 20 && w.parent && w.parent !== w; i++) {
      w = w.parent
      if (w.kissScorm) break
      if (w.document && w.document.readyState === 'loading') loading.push(w)
    }
  } catch {
    // A frame of another origin: no kiss page above it can own the session.
  }
  if (loading.length) {
    // The placeholder stays a working object for a page that kept it
    // (`const scorm = window.kissScorm`): it queues until the bridge decides,
    // then forwards every call and property to the bridge that replaced it.
    // One queue for every placeholder of a SCO, kept on the topmost window
    // this page can reach: the pages of one SCO share one session, so what
    // they queue is replayed in the order it was made, whichever page hands
    // over first. Each entry names its page's state (`self`); replay stops
    // at the first entry whose page has not handed over yet, and carries on
    // when it has. A `ready()` callback is an entry too, so it runs after
    // everything its page queued before it.
    const hub = topReachable(win)
    /** @type {any[]} */
    const shared = (hub.__kissScormQueue = hub.__kissScormQueue || [])
    /** @type {any[]} the placeholders decided or waiting, to publish together */
    const pages = (hub.__kissScormPages = hub.__kissScormPages || [])
    // A page's state: `decided` once its bridge has decided, which replays its
    // entries; `live` once it is published, which only happens when the queue
    // is empty, so no call of a decided page can overtake an older entry.
    /** @type {{ decided: any, gone: boolean, publish: () => void, facade: any }} */
    const self = { decided: null, gone: false, publish: () => {}, facade: null }
    pages.push(self)
    let live = null
    const waiting = [{ event: 'waiting for a parent page to load' }]
    // Where a call goes. Published: the bridge. Decided and being replayed
    // to (an embedded page's proxy forwards here during a replay): the decided
    // bridge, or the replay would queue it again at the back. Otherwise, a
    // page's own call, even from a `ready()` callback, queues behind every
    // older one. A page that has left takes no call (`refused`).
    const route = (name, args, entry, refused) => {
      if (self.gone) return refused
      if (live) return live[name](...args)
      if (self.decided && hub.__kissScormReplaying)
        return self.decided[name](...args)
      // Blind: queued before this page's bridge decided, so before the page
      // could read what the learner left. Only a blind write is protected
      // against overwriting a resumed place; one made after is informed.
      shared.push({ self, name, ...entry, blind: !self.decided })
      return entry.answer
    }
    // What waits is fixed when the page gives it: a copy of an answer, with
    // the time it was given, and a bookmark or state as the string it was.
    const later = (name) => (arg, at) =>
      route(
        name,
        [arg, at],
        { arg: snapshot(arg), extra: at ?? clock(), answer: undefined },
        undefined,
      )
    // A bookmark or state is checked now, and sent once the bridge decides.
    // Replayed as `queued`: the caller was told `true` here, so a refusal at
    // replay is the bridge's to keep and write again.
    const laterIf = (name, fits) => (arg, queued) => {
      if (!self.gone && !live && !fits(arg)) return false
      return route(
        name,
        [arg, queued],
        { arg: String(arg), extra: true, answer: true },
        false,
      )
    }
    // A placeholder waiting for its owner to hand over, the bridge's own and
    // never a page's (`now`): called the moment this page decides, before
    // the queue replays, or it would wait behind its own queued calls.
    /** @type {any[]} */
    const handoffs = []
    // A page waiting for the decided bridge (`ready`), called in its turn.
    const whenReady = (fn, now) => {
      if (self.gone) return undefined
      if (now === true) {
        if (self.decided) return self.decided.ready(fn, true)
        handoffs.push(fn)
        return undefined
      }
      if (live) return live.ready(fn)
      let settle = null
      const promised =
        typeof Promise === 'function'
          ? new Promise((resolve) => (settle = resolve))
          : undefined
      shared.push({ self, name: 'ready', arg: fn, extra: settle })
      return promised
    }
    // Read from the decided bridge as soon as there is one: only a write has
    // to wait its turn, and a ready() callback run in the replay reads these.
    const known = () => live || self.decided
    win.kissScorm = {
      get available() {
        return known() ? known().available : false
      },
      get resumed() {
        return known() ? known().resumed : null
      },
      get mode() {
        return known() ? known().mode : null
      },
      get log() {
        return known() ? known().log : waiting
      },
      interaction: later('interaction'),
      score: later('score'),
      status: later('status'),
      bookmark: laterIf('bookmark', fitsBookmark),
      save: laterIf('save', fitsState),
      ready: whenReady,
    }
    const placeholder = win.kissScorm
    self.facade = placeholder
    let left = loading.length
    const handover = () => {
      if (self.gone || --left > 0) return
      delete win.kissScorm
      kissScormBridge(win, manual)
      const next = win.kissScorm
      // Handed over only once the new bridge is itself ready: an embedded
      // page's is a proxy to its owner, which may still be waiting too. Until
      // then the placeholder stays window.kissScorm and keeps queueing, so a
      // script that calls in between lands after what was queued before.
      win.kissScorm = placeholder
      next.ready(() => finish(next), true)
    }
    self.publish = () => {
      win.kissScorm = self.decided
      live = self.decided
    }
    /** @param {any} decided */
    const finish = (decided) => {
      if (self.gone) return
      self.decided = decided
      // Embedded pages waiting on this one to decide finish first, so their
      // entries count as handed over before the replay below reaches them.
      // One that throws (a page's own ready callback, in its replay) does not
      // stop the others; the first error is rethrown once all have run.
      let failure = null
      for (const fn of handoffs.splice(0)) {
        try {
          fn(decided)
        } catch (error) {
          failure = failure ?? { error }
        }
      }
      try {
        drain()
      } catch (error) {
        failure = failure ?? { error }
      }
      if (failure) throw failure.error
    }
    // Replay from the front, in the order the calls were made, until an
    // entry's page has not decided; entries of a page that has left are
    // dropped. Once the queue is empty, every decided page is published.
    // A callback that throws does not stop the rest; the first error is
    // rethrown after.
    const drain = () => {
      let failure = null
      while (shared.length && (shared[0].self.gone || shared[0].self.decided)) {
        const { self: owner, name, arg, extra, blind } = shared.shift()
        if (owner.gone) continue
        const bridge = owner.decided
        // A callback is given its page's placeholder, never the bridge behind
        // it: what it writes then keeps the queue's order until the page is
        // published, and goes straight through after.
        if (name === 'ready') {
          try {
            if (typeof arg === 'function') arg(owner.facade)
          } catch (error) {
            failure = failure ?? { error }
          }
          if (extra) extra(owner.facade)
          continue
        }
        // A bookmark or state queued before the bridge knew the learner was
        // resuming was written blind to what they left: it does not
        // overwrite it. Protected unless the LMS read the field back as ''
        // (`null`, unread, is protected too). A page that waits on `ready()`
        // never queues one.
        const left = bridge.resumed
        if (
          blind &&
          left &&
          ((name === 'bookmark' && left.location !== '') ||
            (name === 'save' && left.state !== ''))
        ) {
          bridge.log.push({
            event: `a queued ${name} call dropped: the learner is resuming`,
          })
          continue
        }
        hub.__kissScormReplaying = true
        try {
          bridge[name](arg, extra)
        } finally {
          hub.__kissScormReplaying = false
        }
      }
      // Published together, and only when nothing is queued and no page of
      // the SCO still waits: a waiting page can queue at any moment, and its
      // call must not land behind a newer one already sent.
      if (!shared.length && !pages.some((page) => !page.gone && !page.decided))
        for (const page of pages.splice(0)) if (!page.gone) page.publish()
      if (failure) throw failure.error
    }
    // Kept beside the queue, so a held owner (below), which has no replay of
    // its own, can release what waited behind it when it leaves.
    hub.__kissScormDrain = drain
    // The queue outlives this page (it is kept on the window above): a page
    // left before its bridge decided takes its calls with it, so they hold up
    // no other page's, and its handover never runs. Not for the
    // back/forward cache, which may bring the page back.
    win.addEventListener('pagehide', (event) => {
      if (event && event.persisted) return
      // Published or not, a page that has left takes no more calls (`route`
      // refuses them), through this object or one it kept.
      self.gone = true
      if (live) return
      for (let i = shared.length - 1; i >= 0; i--)
        if (shared[i].self === self) shared.splice(i, 1)
      const at = pages.indexOf(self)
      if (at !== -1) pages.splice(at, 1)
      drain()
    })
    for (const w of loading) {
      try {
        w.document.addEventListener('DOMContentLoaded', handover, {
          once: true,
        })
      } catch {
        handover()
      }
    }
    return
  }

  // An embedded kiss page: forward every call to the owner's kissScorm, looked
  // up at each call, since an owner still waiting replaces its placeholder.
  let owner = null
  try {
    for (let w = win, i = 0; i < 20 && w.parent && w.parent !== w; i++) {
      w = w.parent
      if (w.kissScorm) {
        owner = w
        break
      }
    }
  } catch {
    owner = null
  }
  if (owner) {
    const ancestor = owner
    // A page that has left (not into the back/forward cache) writes nothing
    // more into the session it shared, through this object or one it kept.
    let departed = false
    win.addEventListener('pagehide', (event) => {
      if (!(event && event.persisted)) departed = true
    })
    win.kissScorm = {
      get available() {
        return ancestor.kissScorm.available
      },
      get resumed() {
        return ancestor.kissScorm.resumed
      },
      get mode() {
        return ancestor.kissScorm.mode
      },
      get log() {
        return ancestor.kissScorm.log
      },
      bookmark: (location, queued) =>
        !departed && ancestor.kissScorm.bookmark(location, queued),
      save: (state, queued) =>
        !departed && ancestor.kissScorm.save(state, queued),
      // The time it was given, kept through every hop: a placeholder that
      // drains into this forward passes the time it queued the answer at.
      interaction: (answer, at) =>
        departed
          ? undefined
          : ancestor.kissScorm.interaction(answer, at ?? clock()),
      score: (fraction) =>
        departed ? undefined : ancestor.kissScorm.score(fraction),
      status: (value) =>
        departed ? undefined : ancestor.kissScorm.status(value),
      // Ready when the owner is, and called back with this page's own kissScorm.
      // `now` (a placeholder's own handover wait) is passed on to the owner.
      // A page that has left registers nothing, and a callback it registered
      // before is not run, nor its promise settled, once it has.
      ready: (fn, now) => {
        if (departed) return undefined
        let settle = null
        const promised =
          typeof Promise === 'function'
            ? new Promise((resolve) => (settle = resolve))
            : undefined
        ancestor.kissScorm.ready(() => {
          if (departed) return
          if (typeof fn === 'function') fn(win.kissScorm)
          if (settle) settle(win.kissScorm)
        }, now)
        return promised
      },
    }
    return
  }

  const find = (start) => {
    let w = start
    for (let i = 0; w && i < 20; i++) {
      try {
        if (w.API) return w.API
      } catch {
        // A frame of another origin: look higher.
      }
      let up
      try {
        up = w.parent
      } catch {
        return null
      }
      if (!up || up === w) return null
      w = up
    }
    return null
  }
  let api = find(win)
  if (!api) {
    try {
      api = win.opener ? find(win.opener) : null
    } catch {
      api = null
    }
  }

  // The last 50 events: each LMS call with its element and result, and on a
  // failure the LMS's own error string and diagnostic, read at once; and the
  // bridge's decisions. Never a value: no learner, no answer, no bookmark.
  const log = []
  const note = (entry) => {
    log.push(entry)
    if (log.length > 50) log.shift()
  }

  let on = false
  let interactions = true
  // Session time is time the page was live: `spent` is what earlier stretches
  // added up to, `since` when the current one began, or null while the page
  // sits frozen in the back/forward cache.
  let spent = 0
  let since = Date.now()
  if (api) {
    try {
      on = String(api.LMSInitialize('')) === 'true'
    } catch {
      on = false
    }
    note({ call: 'LMSInitialize', ok: on })
  } else note({ event: 'no LMS found' })

  // One call to the LMS. A session the LMS ended (error 301) is started again
  // once and the call retried; a session it will not start again, or an API
  // that throws, turns the bridge off. Any other error fails this call alone,
  // and is logged: the session is still open, so the next write and the next
  // checkpoint's commit try again, and the page is still finished when left.
  // Turning off for one refused commit lost every score and status after it.
  // It never throws.
  //
  // `unsaved` is every value written since the last commit or finish the LMS
  // accepted, in the order first written. A session the LMS ended is started
  // again with them written back before the call is retried: an LMS may
  // rebuild its data model from what it persisted when a session starts
  // (Moodle's does), so a retried commit alone would persist none of them.
  const unsaved = new Map()
  // The unsaved values a restarted session refused to take back: not in the
  // LMS's buffer, so no commit can persist them until they are written again.
  const unsent = new Map()
  const call = (name, args) => {
    if (!on) return { ok: false }
    const element = /Value$/.test(name) ? args[0] : undefined
    try {
      let value = api[name](...args)
      let code = String(api.LMSGetLastError())
      if (code === '301') {
        note({ event: 'session restarted' })
        api.LMSInitialize('')
        if (String(api.LMSGetLastError()) === '0') {
          let restored = 0
          for (const [key, kept] of unsaved) {
            api.LMSSetValue(key, kept)
            if (String(api.LMSGetLastError()) === '0') {
              restored++
              unsent.delete(key)
            } else unsent.set(key, kept)
          }
          if (unsaved.size)
            note({ event: `restored ${restored} of ${unsaved.size} values` })
          value = api[name](...args)
          code = String(api.LMSGetLastError())
        }
      }
      if (code === '0') {
        note({ call: name, element, ok: true })
        if (name === 'LMSSetValue') {
          unsaved.set(args[0], args[1])
          unsent.delete(args[0])
        } else if (name === 'LMSCommit' || name === 'LMSFinish')
          // Persisted, all but what the LMS's buffer never took back.
          for (const key of [...unsaved.keys()])
            if (!unsent.has(key)) unsaved.delete(key)
        return { ok: true, value }
      }
      const said = (fn) => {
        try {
          return String(api[fn](code))
        } catch {
          return ''
        }
      }
      note({
        call: name,
        element,
        ok: false,
        code,
        message: said('LMSGetErrorString'),
        diagnostic: said('LMSGetDiagnostic'),
      })
      if (code === '301') {
        on = false
        note({ event: 'session lost; turned off' })
      }
      return { ok: false, code }
    } catch {
      on = false
      note({ call: name, element, ok: false, event: 'threw; turned off' })
      return { ok: false }
    }
  }
  // A write the LMS refuses, other than as not implemented (401), is kept
  // with what is unsaved and written back before every commit until one
  // carries it: a completion, a status, a score or the suspend the page never
  // sees refused must not be lost to one refusal. `told` is for the writes
  // whose result the page is given (a bookmark, a state): `false` is the
  // answer, and the bridge does not write them behind its back.
  const set = (key, value, told = false) => {
    const wrote = call('LMSSetValue', [key, String(value)])
    if (!wrote.ok && !told && on && wrote.code && wrote.code !== '401') {
      unsent.set(key, String(value))
      unsaved.set(key, String(value))
    }
    return wrote.ok
  }
  // A bookmark or state is committed soon after it is written, not left to
  // the exit: a real LMS (Moodle among them) commits with synchronous XHR,
  // which a browser may block while the page is being dismissed. The first
  // uncommitted write starts the timer and later ones ride on it, so a burst
  // commits once and a learner who keeps moving is never long uncommitted.
  // Any commit, for whatever reason, carries them too and cancels it. A
  // commit that fails leaves them unsaved and is tried again on the same
  // timer, at most RETRIES times in a row, so persisting does not wait for
  // the next learner action or the exit. It uses the window's own timers,
  // and does nothing once the bridge can no longer write.
  const RETRIES = 5
  let pending = null
  let retries = 0
  const cancel = () => {
    if (pending === null) return
    try {
      win.clearTimeout(pending)
    } catch {
      // No timers to clear: nothing was scheduled.
    }
    pending = null
  }
  const schedule = () => {
    if (pending !== null) return
    try {
      pending = win.setTimeout(() => {
        pending = null
        if ((unsaved.size || deferred.length) && writes()) commit()
      }, 2500)
    } catch {
      // A window without timers: the hidden and pagehide checkpoints remain.
      pending = null
    }
  }
  // What a restarted session refused goes back before anything that depends
  // on it: a commit cannot carry a value the LMS's buffer does not hold, and
  // an answer cannot be given an index while an earlier answer's id is out.
  const writeBack = () => {
    for (const [key, value] of [...unsent]) call('LMSSetValue', [key, value])
  }
  const held = () =>
    [...unsent.keys()].some((key) => /^cmi\.interactions\.\d+\.id$/.test(key))
  /** @type {[string, string | undefined][][]} encoded answers waiting for an earlier answer's id */
  const deferred = []
  // Records the deferred answers, in order, once nothing holds them back;
  // assigned beside `interaction`, which owns the writing of an answer.
  let drain = () => {}
  const commit = () => {
    cancel()
    writeBack()
    drain()
    const result = call('LMSCommit', [''])
    if (result.ok && !unsent.size && !deferred.length) retries = 0
    else if (
      (unsaved.size || deferred.length) &&
      writes() &&
      retries < RETRIES
    ) {
      retries++
      schedule()
    } else if (deferred.length)
      note({ event: `${deferred.length} answers not recorded` })
    return result
  }
  const commitSoon = () => {
    retries = 0
    schedule()
  }

  const span = () => {
    const live = spent + (since === null ? 0 : Date.now() - since)
    const s = Math.floor(live / 1000)
    return `${pad(Math.min(9999, Math.floor(s / 3600)))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
  }
  // A CMIIdentifier: an id that is not one already is cleaned, and given a
  // hash of the original, so two ids never become the same.
  const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    return h.toString(16).padStart(8, '0')
  }
  const cleanId = (raw) => {
    const s = String(raw)
    const c = s.replace(/[^A-Za-z0-9_.-]/g, '_')
    return c === s && c.length > 0 && c.length <= 255
      ? c
      : `${c.slice(0, 246)}-${hash(s)}`
  }
  // A choice is the option's letter: an index (0 is `a`), or a letter given.
  const letter = (x) => {
    const l =
      typeof x === 'number'
        ? String.fromCharCode(97 + Math.floor(x))
        : String(x).trim().charAt(0).toLowerCase()
    return /^[a-z]$/.test(l) ? l : ''
  }
  const choice = (x) => (Array.isArray(x) ? x.map(letter).join(',') : letter(x))
  // A correct answer is a pattern, not a response: several choices that must
  // all be selected are a set, `{a,b}`, in SCORM 1.2's CMIFeedback, where a
  // bare `a,b` says something else. `{ anyOf: [...] }` lists alternative
  // correct answers, each its own pattern.
  const keys = (x) => {
    const list = x && Array.isArray(x.anyOf) ? x.anyOf : [x]
    return list.map((one) =>
      Array.isArray(one) ? `{${one.map(letter).join(',')}}` : letter(one),
    )
  }

  // The mode the LMS launched the SCO in: in review nothing is recorded, and
  // only in normal mode is a page complete when it is seen.
  const launched = (element) => {
    const got = call('LMSGetValue', [element])
    return got.ok ? String(got.value) : ''
  }
  const mode = on ? launched('cmi.core.lesson_mode') || 'normal' : null
  if (mode === 'review') note({ event: 'review mode: recording nothing' })
  const writes = () => on && mode !== 'review'

  // What the learner left last time, when the LMS says they are resuming.
  // A field the LMS did not return is `null`, unknown, never `''`: an empty
  // field is one the LMS said is empty, and only that is not protected.
  const kept = (element) => {
    const got = call('LMSGetValue', [element])
    return got.ok ? String(got.value) : null
  }
  // Whether the learner is resuming is a read too: unknown (`null`) is not
  // "no", so both fields are then unknown, and protected the same way.
  const entry = on ? kept('cmi.core.entry') : ''
  const resumed =
    entry === 'resume'
      ? {
          location: kept('cmi.core.lesson_location'),
          state: kept('cmi.suspend_data'),
        }
      : entry === null
        ? { location: null, state: null }
        : null

  // In normal mode a page is complete when it is seen, unless `manual`. With
  // `manual`, a new attempt starts as incomplete: an LMS may record a status
  // the SCO never set as completed when it finishes, so leaving before the page
  // says so would count. A status the learner already has is kept.
  if (on && mode === 'normal') {
    const now = call('LMSGetValue', ['cmi.core.lesson_status'])
    const was = now.ok ? String(now.value) : ''
    if (!manual && ['not attempted', 'browsed', 'incomplete'].includes(was))
      set('cmi.core.lesson_status', 'completed')
    else if (manual && was === 'not attempted')
      set('cmi.core.lesson_status', 'incomplete')
    commit()
  }

  /**
   * @param {{ id?: string, type?: string, response?: any, correct?: any, result?: boolean | string }} [answer]
   * @param {string} [at] the CMITime it was given, when a queue held it
   */
  const interaction = (answer, at) => {
    if (!writes() || !interactions) return
    // Encoded now, into strings: a page that reuses or changes the object it
    // passed cannot change an answer that waits in the queue below.
    const fields = encode(answer, at)
    // An answer is given the next index the LMS counts. While an earlier
    // answer's id is unsent (a restarted session refused it), that count is
    // short, and this answer would take the earlier one's index and overwrite
    // it: so it waits, in order, until the earlier ids are back. One the LMS
    // could not take now (its count or its id refused) waits the same way.
    writeBack()
    const outcome = deferred.length ? 'queued' : record(fields)
    if (outcome === 'off') return
    if (outcome !== 'done') {
      deferred.push(fields)
      note({ event: 'answer deferred' })
      schedule()
      return
    }
    commit()
  }
  drain = () => {
    while (deferred.length && writes() && interactions) {
      const outcome = record(deferred[0])
      if (outcome === 'held' || outcome === 'retry') return
      deferred.shift()
    }
  }
  /**
   * An answer as the fields of one `cmi.interactions.n` entry, each a string
   * (or undefined, not written), with the time it was given.
   *
   * @param {{ id?: string, type?: string, response?: any, correct?: any, result?: boolean | string }} [answer]
   * @returns {[string, string | undefined][]}
   */
  const encode = (
    { id, type = 'choice', response, correct, result } = {},
    at = clock(),
  ) => {
    const value = type === 'choice' ? choice : (x) => String(x).slice(0, 255)
    const patterns =
      correct === undefined
        ? []
        : type === 'choice'
          ? keys(correct)
          : (correct && Array.isArray(correct.anyOf)
              ? correct.anyOf
              : [correct]
            ).map(value)
    return [
      ['id', cleanId(id)],
      ['type', String(type)],
      [
        'student_response',
        response === undefined ? undefined : value(response),
      ],
      ...patterns.map((p, i) => [`correct_responses.${i}.pattern`, p]),
      [
        'result',
        result === undefined
          ? undefined
          : result === true || result === 'correct'
            ? 'correct'
            : 'wrong',
      ],
      ['time', String(at)],
    ]
  }
  /**
   * Writes one encoded answer at the next index. `'done'` once its id is in
   * (a field refused after that is kept, at its index, to be written back
   * before the next commit); `'held'` while an earlier answer's id is out;
   * `'retry'` when the LMS refused the count or the id this time; `'off'` on
   * an LMS without interactions (401), which ends them for the page.
   *
   * @param {[string, string | undefined][]} fields
   * @returns {'done' | 'held' | 'retry' | 'off'}
   */
  const record = (fields) => {
    const count = call('LMSGetValue', ['cmi.interactions._count'])
    if (!count.ok) {
      if (count.code !== '401') return 'retry'
      interactions = false
      return 'off'
    }
    // Checked after the count, not before: reading it may itself restart the
    // session, and a refused write-back is known only then.
    if (held()) return 'held'
    const n = `cmi.interactions.${Number(count.value) || 0}.`
    for (const [key, v] of fields) {
      if (v === undefined) continue
      const wrote = call('LMSSetValue', [n + key, v])
      if (wrote.ok) continue
      if (wrote.code === '401') {
        interactions = false
        return 'off'
      }
      // Without its id the entry does not exist, and nothing else can land.
      if (key === 'id') return 'retry'
      unsent.set(n + key, v)
      unsaved.set(n + key, v)
    }
    return 'done'
  }

  const score = (fraction) => {
    if (!writes()) return
    const f = Math.min(1, Math.max(0, Number(fraction) || 0))
    // Optional in SCORM 1.2: an LMS without them must not turn the bridge off.
    set('cmi.core.score.min', 0)
    set('cmi.core.score.max', 100)
    set('cmi.core.score.raw', Math.round(f * 100))
    commit()
  }

  const status = (value) => {
    if (!writes() || !STATUSES.includes(value)) return
    set('cmi.core.lesson_status', value)
    commit()
  }

  // A bookmark or state asks the LMS to resume the learner next time: the first
  // one written also sets cmi.core.exit to suspend. Each schedules a commit a
  // moment later (`commitSoon`), rather than committing on every call.
  // A resumed learner stays resumable whether or not this session writes
  // either: a normal exit would end the suspension and lose what they left.
  // The suspend is what makes a kept place resumable: written once, and a
  // refusal of it kept and written back like any other (`set`).
  let suspended = false
  const suspend = () => {
    if (suspended) return
    suspended = true
    set('cmi.core.exit', 'suspend')
  }
  if (resumed && writes()) suspend()
  // `queued` is the bridge's own, never a page's: the call was queued, and its
  // caller already told `true`, so a refusal is kept and written again, like
  // any write the page never saw refused, rather than answered with `false`.
  const keep = (element, value, fits, what, queued) => {
    if (!writes()) return false
    if (!fits(value)) {
      note({ event: `${what} refused: SCORM 1.2 cannot hold it` })
      return false
    }
    if (!set(element, value, queued !== true) && queued !== true) return false
    suspend()
    commitSoon()
    return true
  }
  const bookmark = (location, queued) =>
    keep('cmi.core.lesson_location', location, fitsBookmark, 'bookmark', queued)
  const save = (state, queued) =>
    keep('cmi.suspend_data', state, fitsState, 'state', queued)

  win.kissScorm = {
    get available() {
      return on
    },
    resumed,
    mode,
    log,
    interaction,
    score,
    status,
    bookmark,
    save,
    // Decided already, LMS or none: the page is called back at once, and a
    // promise of the same object is returned for a page that awaits.
    ready(fn) {
      if (typeof fn === 'function') fn(win.kissScorm)
      return typeof Promise === 'function'
        ? Promise.resolve(win.kissScorm)
        : undefined
    },
  }

  // An owner that never had to wait, joining a SCO whose embedded pages
  // already queued calls (they wait for this page to load): its own calls
  // join the same queue, behind theirs, until it empties, exactly as a
  // placeholder's do. Its writes are informed (it decided), never blind.
  const hub = topReachable(win)
  const sharedQueue = hub.__kissScormQueue
  /** @type {any[]} */
  const waitingPages = hub.__kissScormPages || []
  // Held while anything is queued, or while an embedded page still waits:
  // a waiting page can queue at any moment, behind which this owner's own
  // calls belong.
  if (
    sharedQueue &&
    (sharedQueue.length ||
      waitingPages.some((page) => !page.gone && !page.decided))
  ) {
    const raw = win.kissScorm
    /** @type {any[]} */
    const pages = (hub.__kissScormPages = waitingPages)
    let held = true
    const ownerSelf = {
      decided: raw,
      gone: false,
      facade: null,
      publish: () => {
        held = false
      },
    }
    pages.push(ownerSelf)
    const hold =
      (name) =>
      (...args) => {
        // An owner that has left takes no call and no callback, kept or new.
        if (ownerSelf.gone)
          return name === 'bookmark' || name === 'save' ? false : undefined
        if (name === 'ready' && args[1] === true) return raw.ready(args[0])
        if (!held || hub.__kissScormReplaying) return raw[name](...args)
        if (name === 'ready') {
          let settle = null
          const promised =
            typeof Promise === 'function'
              ? new Promise((resolve) => (settle = resolve))
              : undefined
          sharedQueue.push({
            self: ownerSelf,
            name,
            arg: args[0],
            extra: settle,
          })
          return promised
        }
        if (name === 'bookmark' || name === 'save') {
          const fits = name === 'bookmark' ? fitsBookmark : fitsState
          if (!writes() || !fits(args[0])) return false
          sharedQueue.push({
            self: ownerSelf,
            name,
            arg: String(args[0]),
            extra: true,
            blind: false,
          })
          return true
        }
        sharedQueue.push({
          self: ownerSelf,
          name,
          arg: name === 'interaction' ? snapshot(args[0]) : args[0],
          extra: name === 'interaction' ? (args[1] ?? clock()) : undefined,
          blind: false,
        })
        return undefined
      }
    const facade = {
      get available() {
        return raw.available
      },
      resumed: raw.resumed,
      mode: raw.mode,
      log: raw.log,
      interaction: hold('interaction'),
      score: hold('score'),
      status: hold('status'),
      bookmark: hold('bookmark'),
      save: hold('save'),
      ready: hold('ready'),
    }
    ownerSelf.facade = facade
    win.kissScorm = facade
    // Left for good: as a placeholder does, it takes its entries with it and
    // releases whatever waited behind them. Not for the back/forward cache.
    win.addEventListener('pagehide', (event) => {
      if (event && event.persisted) return
      ownerSelf.gone = true
      for (let i = sharedQueue.length - 1; i >= 0; i--)
        if (sharedQueue[i].self === ownerSelf) sharedQueue.splice(i, 1)
      const at = pages.indexOf(ownerSelf)
      if (at !== -1) pages.splice(at, 1)
      if (typeof hub.__kissScormDrain === 'function') hub.__kissScormDrain()
    })
  }

  // Left for good: finish. Frozen in the back/forward cache: commit only, as
  // the page may come back with its session still in use.
  win.addEventListener('pagehide', (event) => {
    if (!on) return
    if (writes()) set('cmi.core.session_time', span())
    commit()
    if (event && event.persisted) {
      // Frozen: the clock stops until the page comes back.
      if (since !== null) spent += Date.now() - since
      since = null
      return
    }
    call('LMSFinish', [''])
    on = false
    // A retry the commit above scheduled has nothing to write to now.
    cancel()
  })
  win.addEventListener('pageshow', (event) => {
    if (event && event.persisted && since === null) since = Date.now()
  })

  // Hidden (a phone switching apps, a tab sent to the background): a
  // checkpoint, since the page may never see pagehide. Commit, never finish.
  try {
    win.document.addEventListener('visibilitychange', () => {
      if (!on || win.document.visibilityState !== 'hidden') return
      if (writes()) set('cmi.core.session_time', span())
      commit()
    })
  } catch {
    // No document to watch (a test's window, or a page without one).
  }
}

/**
 * The bridge as one inline `<script>`, the same bytes on every build: no file
 * to copy, so a page that carries it works on the web and in either package.
 *
 * @param {Object} [options]
 * @param {boolean} [options.manual] leave completion to `kissScorm.status()`;
 * by default a page is complete when it is seen
 * @returns {string}
 */
export function scormBridgeScript({ manual = false } = {}) {
  return `<script>(${kissScormBridge.toString()})(window,${manual ? 'true' : 'false'})</script>`
}
