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
    const queue = []
    let live = null
    const waiting = [{ event: 'waiting for a parent page to load' }]
    const later = (name) => (arg) => {
      if (live) return live[name](arg)
      queue.push([name, arg])
    }
    // A bookmark or state is checked now, and sent once the bridge decides.
    const laterIf = (name, fits) => (arg) => {
      if (live) return live[name](arg)
      if (!fits(arg)) return false
      queue.push([name, arg])
      return true
    }
    win.kissScorm = {
      get available() {
        return live ? live.available : false
      },
      get resumed() {
        return live ? live.resumed : null
      },
      get mode() {
        return live ? live.mode : null
      },
      get log() {
        return live ? live.log : waiting
      },
      interaction: later('interaction'),
      score: later('score'),
      status: later('status'),
      bookmark: laterIf('bookmark', fitsBookmark),
      save: laterIf('save', fitsState),
    }
    let left = loading.length
    const ready = () => {
      if (--left > 0) return
      delete win.kissScorm
      kissScormBridge(win, manual)
      live = win.kissScorm
      for (const [name, arg] of queue.splice(0)) live[name](arg)
    }
    for (const w of loading) {
      try {
        w.document.addEventListener('DOMContentLoaded', ready, { once: true })
      } catch {
        ready()
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
      bookmark: (location) => ancestor.kissScorm.bookmark(location),
      save: (state) => ancestor.kissScorm.save(state),
      interaction: (answer) => ancestor.kissScorm.interaction(answer),
      score: (fraction) => ancestor.kissScorm.score(fraction),
      status: (value) => ancestor.kissScorm.status(value),
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
            if (String(api.LMSGetLastError()) === '0') restored++
          }
          if (unsaved.size)
            note({ event: `restored ${restored} of ${unsaved.size} values` })
          value = api[name](...args)
          code = String(api.LMSGetLastError())
        }
      }
      if (code === '0') {
        note({ call: name, element, ok: true })
        if (name === 'LMSSetValue') unsaved.set(args[0], args[1])
        else if (name === 'LMSCommit' || name === 'LMSFinish') unsaved.clear()
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
  const set = (key, value) => call('LMSSetValue', [key, String(value)]).ok
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
        if (unsaved.size && writes()) commit()
      }, 2500)
    } catch {
      // A window without timers: the hidden and pagehide checkpoints remain.
      pending = null
    }
  }
  const commit = () => {
    cancel()
    const result = call('LMSCommit', [''])
    if (result.ok) retries = 0
    else if (unsaved.size && writes() && retries < RETRIES) {
      retries++
      schedule()
    }
    return result
  }
  const commitSoon = () => {
    retries = 0
    schedule()
  }

  const pad = (n) => String(n).padStart(2, '0')
  const clock = () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
  const resumed =
    on && launched('cmi.core.entry') === 'resume'
      ? {
          location: launched('cmi.core.lesson_location'),
          state: launched('cmi.suspend_data'),
        }
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
   */
  const interaction = ({
    id,
    type = 'choice',
    response,
    correct,
    result,
  } = {}) => {
    if (!writes() || !interactions) return
    const count = call('LMSGetValue', ['cmi.interactions._count'])
    // 401 is an LMS without interactions: stop asking. Any other refusal
    // fails this answer, or this one field of it, and the next is tried.
    if (!count.ok) {
      if (count.code === '401') interactions = false
      return
    }
    const n = `cmi.interactions.${Number(count.value) || 0}.`
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
    const fields = [
      ['id', cleanId(id)],
      ['type', type],
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
      ['time', clock()],
    ]
    for (const [key, v] of fields) {
      if (v === undefined) continue
      const wrote = call('LMSSetValue', [n + key, String(v)])
      if (wrote.ok) continue
      if (wrote.code === '401') {
        interactions = false
        return
      }
      // Without its id the interaction does not exist: nothing else can land.
      if (key === 'id') return
    }
    commit()
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
  let suspended = false
  if (resumed && writes()) suspended = set('cmi.core.exit', 'suspend')
  const keep = (element, value, fits, what) => {
    if (!writes()) return false
    if (!fits(value)) {
      note({ event: `${what} refused: SCORM 1.2 cannot hold it` })
      return false
    }
    if (!set(element, value)) return false
    if (!suspended) suspended = set('cmi.core.exit', 'suspend')
    commitSoon()
    return true
  }
  const bookmark = (location) =>
    keep('cmi.core.lesson_location', location, fitsBookmark, 'bookmark')
  const save = (state) => keep('cmi.suspend_data', state, fitsState, 'state')

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
