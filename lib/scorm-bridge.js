/**
 * The bridge between a page and a SCORM 1.2 LMS, run in the browser. It finds
 * the LMS's `API` up the frame chain (or through the opener), starts the
 * session, completes the page when it is seen unless `manual`, and gives the
 * page `window.kissScorm` to record answers, a score and a status. With no LMS
 * every call does nothing, so the same page works on the web, in an IMS
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

  // The outermost kiss page of a SCO owns the session, whichever bridge runs
  // first. A same-origin parent still loading may yet run its own, so wait for
  // each one's DOMContentLoaded, queueing the page's calls, then decide.
  const loading = []
  try {
    for (let w = win, i = 0; i < 10 && w.parent && w.parent !== w; i++) {
      w = w.parent
      if (w.kissScorm) break
      if (w.document && w.document.readyState === 'loading') loading.push(w)
    }
  } catch {
    // A frame of another origin: no kiss page above it can own the session.
  }
  if (loading.length) {
    const queue = []
    const later = (name) => (arg) => {
      queue.push([name, arg])
    }
    win.kissScorm = {
      available: false,
      interaction: later('interaction'),
      score: later('score'),
      status: later('status'),
    }
    let left = loading.length
    const ready = () => {
      if (--left > 0) return
      delete win.kissScorm
      kissScormBridge(win, manual)
      for (const [name, arg] of queue) win.kissScorm[name](arg)
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
    for (let w = win, i = 0; i < 10 && w.parent && w.parent !== w; i++) {
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
      interaction: (answer) => ancestor.kissScorm.interaction(answer),
      score: (fraction) => ancestor.kissScorm.score(fraction),
      status: (value) => ancestor.kissScorm.status(value),
    }
    return
  }

  const find = (start) => {
    let w = start
    for (let i = 0; w && i < 10; i++) {
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

  let on = false
  let interactions = true
  const started = Date.now()
  if (api) {
    try {
      on = String(api.LMSInitialize('')) === 'true'
    } catch {
      on = false
    }
  }

  // One call to the LMS. A session the LMS ended (error 301) is started again
  // once and the call retried. Any other error, or a second failure, turns the
  // bridge off, unless `soft`, when the caller decides. It never throws.
  const call = (name, args, soft) => {
    if (!on) return { ok: false }
    try {
      let value = api[name](...args)
      let code = String(api.LMSGetLastError())
      if (code === '301') {
        api.LMSInitialize('')
        if (String(api.LMSGetLastError()) === '0') {
          value = api[name](...args)
          code = String(api.LMSGetLastError())
        }
      }
      if (code === '0') return { ok: true, value }
      if (!soft) on = false
      return { ok: false }
    } catch {
      on = false
      return { ok: false }
    }
  }
  const set = (key, value, soft) =>
    call('LMSSetValue', [key, String(value)], soft).ok
  const commit = () => call('LMSCommit', [''])

  const pad = (n) => String(n).padStart(2, '0')
  const clock = () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const span = () => {
    const s = Math.floor((Date.now() - started) / 1000)
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

  if (on && !manual) {
    const now = call('LMSGetValue', ['cmi.core.lesson_status'])
    if (
      now.ok &&
      ['not attempted', 'browsed', 'incomplete'].includes(String(now.value))
    )
      set('cmi.core.lesson_status', 'completed')
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
    if (!on || !interactions) return
    const count = call('LMSGetValue', ['cmi.interactions._count'], true)
    if (!count.ok) {
      interactions = false
      return
    }
    const n = `cmi.interactions.${Number(count.value) || 0}.`
    const value = type === 'choice' ? choice : (x) => String(x).slice(0, 255)
    const fields = [
      ['id', cleanId(id)],
      ['type', type],
      [
        'student_response',
        response === undefined ? undefined : value(response),
      ],
      [
        'correct_responses.0.pattern',
        correct === undefined ? undefined : value(correct),
      ],
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
      if (!set(n + key, v, true)) {
        interactions = false
        return
      }
    }
    commit()
  }

  const score = (fraction) => {
    if (!on) return
    const f = Math.min(1, Math.max(0, Number(fraction) || 0))
    set('cmi.core.score.min', 0)
    set('cmi.core.score.max', 100)
    set('cmi.core.score.raw', Math.round(f * 100))
    commit()
  }

  const status = (value) => {
    if (!on || !STATUSES.includes(value)) return
    set('cmi.core.lesson_status', value)
    commit()
  }

  win.kissScorm = {
    get available() {
      return on
    },
    interaction,
    score,
    status,
  }

  // Left for good: finish. Frozen in the back/forward cache: commit only, as
  // the page may come back with its session still in use.
  win.addEventListener('pagehide', (event) => {
    if (!on) return
    set('cmi.core.session_time', span())
    commit()
    if (event && event.persisted) return
    call('LMSFinish', [''])
    on = false
  })
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
