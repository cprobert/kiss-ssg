import { describe, it, expect, beforeEach } from 'vitest'
import vm from 'node:vm'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { minify } from 'terser'
import { scormBridgeScript } from '../../lib/scorm-bridge.js'
import { registerHandlebarsHelpers } from '../../lib/handlebars-helpers.js'
import { silentLogger } from '../../lib/logger.js'

// A scripted SCORM 1.2 `API`, as an LMS puts it on a frame above the page. It
// keeps the values set, raises the errors Moodle raises (301 when not
// initialised, 101 on a second LMSInitialize, 401 where interactions are not
// supported), and records every call. `end()` ends the session underneath the
// page; with `reinit: false` it then refuses to start another. `entry`,
// `location`, `state` and `mode` are what it launches the SCO with,
// `refuse` maps an element to the error code a write to it raises, and the
// first `commitFails` commits fail with 101, the session still open
// (`failCommits(n)` fails the next n). What it buffers (`data`) is persisted
// (`durable`) only by a commit or a finish; with `resets`, starting a session
// again rebuilds the buffer from what was persisted, as Moodle's API does.
function lms({
  delta = false,
  resets = false,
  status = 'not attempted',
  interactions = true,
  reinit = true,
  entry = '',
  location = '',
  state = '',
  mode = 'normal',
  refuse = {},
  commitFails = 0,
} = {}) {
  const data = new Map([
    ['cmi.core.lesson_status', status],
    ['cmi.interactions._count', '0'],
    ['cmi.core.entry', entry],
    ['cmi.core.lesson_location', location],
    ['cmi.suspend_data', state],
    ['cmi.core.lesson_mode', mode],
    ['cmi.core.student_name', 'Doe, Jane'],
  ])
  const refuseOnce = new Map()
  const refuseReadOnce = new Map()
  const durable = new Map(data)
  // Sends the buffer to the server. With `delta`, as Moodle's API does, only
  // what changed since the last send goes, and that baseline moves before the
  // request is made; `block()` makes every request fail in transit, as a
  // browser blocking synchronous requests while the page is dismissed.
  const baseline = new Map(data)
  let blocked = false
  const send = () => {
    const changed = delta
      ? [...data].filter(([k, v]) => baseline.get(k) !== v)
      : [...data]
    if (delta) for (const [k, v] of changed) baseline.set(k, v)
    if (blocked) return false
    if (!delta) durable.clear()
    for (const [k, v] of changed) durable.set(k, v)
    return true
  }
  const calls = []
  let initialised = false
  let ended = false
  let last = '0'
  const fail = (code, value = 'false') => ((last = code), value)
  const ok = (value = 'true') => ((last = '0'), value)
  const api = {
    LMSInitialize() {
      calls.push(['LMSInitialize'])
      if (initialised) return fail('101')
      if (ended && !reinit) return fail('101')
      if (ended && resets) {
        data.clear()
        for (const [k, v] of durable) data.set(k, v)
      }
      initialised = true
      return ok()
    },
    LMSFinish() {
      calls.push(['LMSFinish'])
      if (!initialised) return fail('301')
      const sent = send()
      initialised = false
      return sent ? ok() : fail('101')
    },
    LMSGetValue(key) {
      calls.push(['LMSGetValue', key])
      if (!initialised) return fail('301', '')
      if (key.startsWith('cmi.interactions') && !interactions)
        return fail('401', '')
      if (refuseReadOnce.has(key)) {
        const code = refuseReadOnce.get(key)
        refuseReadOnce.delete(key)
        return fail(code, '')
      }
      return ok(data.get(key) ?? '')
    },
    LMSSetValue(key, value) {
      calls.push(['LMSSetValue', key, value])
      if (!initialised) return fail('301')
      if (key.startsWith('cmi.interactions') && !interactions)
        return fail('401')
      if (refuse[key]) return fail(refuse[key])
      if (refuseOnce.has(key)) {
        const code = refuseOnce.get(key)
        refuseOnce.delete(key)
        return fail(code)
      }
      data.set(key, value)
      const n = key.match(/^cmi\.interactions\.(\d+)\.id$/)?.[1]
      if (n !== undefined)
        data.set(
          'cmi.interactions._count',
          String(
            Math.max(
              Number(data.get('cmi.interactions._count')),
              Number(n) + 1,
            ),
          ),
        )
      return ok()
    },
    LMSCommit() {
      calls.push(['LMSCommit'])
      if (!initialised) return fail('301')
      if (commitFails > 0) {
        commitFails--
        return fail('101')
      }
      return send() ? ok() : fail('101')
    },
    LMSGetLastError: () => last,
    LMSGetErrorString: (code) => `error ${code}`,
    LMSGetDiagnostic: (code) => `diagnostic ${code}`,
  }
  return {
    api,
    data,
    calls,
    names: () => calls.map((c) => c[0]),
    sets: () =>
      calls.filter((c) => c[0] === 'LMSSetValue').map((c) => [c[1], c[2]]),
    durable,
    refuseNext: (key, code) => refuseOnce.set(key, code),
    refuseNextRead: (key, code) => refuseReadOnce.set(key, code),
    block: () => {
      blocked = true
    },
    failCommits: (n) => {
      commitFails += n
    },
    end: () => {
      initialised = false
      ended = true
    },
  }
}

// A window: its `parent` (itself at the top), an optional `API` and `opener`,
// and the listeners the bridge registers, which `fire` calls. With `loading`,
// its document is still being parsed until `ready()` fires DOMContentLoaded.
// With `visible`, it has a document whose visibility `hide()` changes.
function frame({ parent, API, opener, loading = false, visible = false } = {}) {
  const listeners = {}
  // The window's own timers, on a clock only `advance(ms)` moves.
  const timers = new Map()
  let now = 0
  let next = 1
  const win = {
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    fire: (type, event = {}) =>
      (listeners[type] ?? []).forEach((fn) => fn(event)),
    listeners,
    setTimeout: (fn, ms) => {
      timers.set(next, { fn, at: now + ms })
      return next++
    },
    clearTimeout: (id) => timers.delete(id),
    pending: () => timers.size,
    advance: (ms) => {
      now += ms
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at))
        if (t.at <= now && timers.delete(id)) t.fn()
    },
  }
  win.parent = parent ?? win
  if (API) win.API = API
  if (opener) win.opener = opener
  if (loading) {
    const waiting = []
    win.document = {
      readyState: 'loading',
      addEventListener: (type, fn) =>
        type === 'DOMContentLoaded' && waiting.push(fn),
    }
    win.ready = () => {
      win.document.readyState = 'interactive'
      waiting.splice(0).forEach((fn) => fn({}))
    }
  }
  if (visible) {
    const watching = []
    win.document = {
      readyState: 'complete',
      visibilityState: 'visible',
      addEventListener: (type, fn) =>
        type === 'visibilitychange' && watching.push(fn),
    }
    win.hide = () => {
      win.document.visibilityState = 'hidden'
      watching.forEach((fn) => fn({}))
    }
  }
  return win
}

// A frame of another origin: reading anything but `parent` throws, as a browser does.
const foreign = () => {
  const target = {}
  const proxy = new Proxy(target, {
    get(_, key) {
      if (key === 'parent') return proxy
      throw new Error(`SecurityError: cross-origin read of ${String(key)}`)
    },
  })
  return proxy
}

const scriptOf = (html) =>
  html.replace(/^<script>/, '').replace(/<\/script>$/, '')

// Each test runs twice: the script as the helper renders it, and as terser minifies it.
const forms = [
  ['as rendered', (manual) => scriptOf(scormBridgeScript({ manual }))],
  ['minified', (manual) => minified[manual ? 'manual' : 'seen']],
]
const minified = {}

describe.each(forms)('the SCORM bridge, %s', (_, source) => {
  beforeEach(async () => {
    for (const manual of [false, true])
      minified[manual ? 'manual' : 'seen'] ??= (
        await minify(scriptOf(scormBridgeScript({ manual })))
      ).code
  })

  // Runs the bridge in its own context with `win` as its window, as a page's
  // script runs. With `clock`, its `Date.now()` is `clock.now`, set by the test.
  const load = (win, { manual = false, clock } = {}) => {
    const context = { window: win }
    if (clock)
      context.Date = class extends Date {
        constructor(...args) {
          super(...(args.length ? args : [clock.now]))
        }
        static now() {
          return clock.now
        }
      }
    vm.runInNewContext(source(manual), context)
    return win
  }

  it('does nothing when no LMS is found, and never throws', () => {
    const win = load(frame())
    expect(win.kissScorm.available).toBe(false)
    expect(() => {
      win.kissScorm.interaction({
        id: 'q1',
        response: 0,
        correct: 1,
        result: false,
      })
      win.kissScorm.score(0.5)
      win.kissScorm.status('passed')
      win.fire('pagehide', { persisted: false })
    }).not.toThrow()
  })

  it('renders the same script whether or not an LMS is there', () => {
    expect(scormBridgeScript()).toBe(scormBridgeScript())
    expect(scormBridgeScript()).not.toBe(scormBridgeScript({ manual: true }))
  })

  it('finds the API up the parent chain, or through the opener', () => {
    const one = lms()
    const top = frame({ API: one.api })
    const win = load(frame({ parent: frame({ parent: top }) }))
    expect(win.kissScorm.available).toBe(true)
    expect(one.names()[0]).toBe('LMSInitialize')

    const two = lms()
    const popup = load(frame({ opener: frame({ API: two.api }) }))
    expect(popup.kissScorm.available).toBe(true)
    expect(two.names()[0]).toBe('LMSInitialize')
  })

  it('a cross-origin frame above does not throw, and the bridge stays off', () => {
    const win = load(frame({ parent: foreign() }))
    expect(win.kissScorm.available).toBe(false)
  })

  it('completes a page when it is seen, then commits', () => {
    for (const from of ['not attempted', 'browsed', 'incomplete']) {
      const one = lms({ status: from })
      load(frame({ API: one.api }))
      expect(one.data.get('cmi.core.lesson_status')).toBe('completed')
      expect(one.names().slice(-1)).toEqual(['LMSCommit'])
    }
  })

  it('never downgrades passed or failed', () => {
    for (const from of ['passed', 'failed']) {
      const one = lms({ status: from })
      load(frame({ API: one.api }))
      expect(one.data.get('cmi.core.lesson_status')).toBe(from)
    }
  })

  it('with complete="manual", starts a new attempt as incomplete, so leaving early is not completion', () => {
    // An LMS may set a status the SCO never set to completed when it finishes.
    const one = lms()
    load(frame({ API: one.api }), { manual: true })
    expect(one.data.get('cmi.core.lesson_status')).toBe('incomplete')
    // A status the learner already has is kept.
    for (const from of [
      'incomplete',
      'completed',
      'passed',
      'failed',
      'browsed',
    ]) {
      const other = lms({ status: from })
      load(frame({ API: other.api }), { manual: true })
      expect(other.data.get('cmi.core.lesson_status')).toBe(from)
    }
    // Not in review or browse mode.
    for (const mode of ['review', 'browse']) {
      const other = lms({ mode })
      load(frame({ API: other.api }), { manual: true })
      expect(other.data.get('cmi.core.lesson_status')).toBe('not attempted')
    }
  })

  it('writes each interaction at cmi.interactions._count, a choice as a letter', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    win.kissScorm.interaction({
      id: 'q1',
      response: 2,
      correct: 2,
      result: true,
    })
    win.kissScorm.interaction({
      id: 'q2',
      response: 'B',
      correct: 0,
      result: 'wrong',
    })
    const d = one.data
    expect(d.get('cmi.interactions._count')).toBe('2')
    expect([0, 1].map((n) => d.get(`cmi.interactions.${n}.id`))).toEqual([
      'q1',
      'q2',
    ])
    expect(d.get('cmi.interactions.0.type')).toBe('choice')
    expect(d.get('cmi.interactions.0.student_response')).toBe('c')
    expect(d.get('cmi.interactions.0.correct_responses.0.pattern')).toBe('c')
    expect(d.get('cmi.interactions.0.result')).toBe('correct')
    expect(d.get('cmi.interactions.1.student_response')).toBe('b')
    expect(d.get('cmi.interactions.1.correct_responses.0.pattern')).toBe('a')
    expect(d.get('cmi.interactions.1.result')).toBe('wrong')
    expect(d.get('cmi.interactions.1.time')).toMatch(/^\d\d:\d\d:\d\d$/)
    // The id is written first, as SCORM 1.2 requires of a new interaction, and each answer is committed.
    const first = one
      .sets()
      .findIndex(([k]) => k.startsWith('cmi.interactions.1.'))
    expect(one.sets()[first][0]).toBe('cmi.interactions.1.id')
    expect(one.names().slice(-1)).toEqual(['LMSCommit'])
  })

  // SCORM 1.2's choice pattern: `{a,b}` is a set, every choice in it required,
  // in any order; each alternative correct answer is its own correct_responses.n.
  it('writes a multi-select key as a set, and alternatives as separate patterns', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    win.kissScorm.interaction({ id: 'all', response: [1, 0], correct: [0, 1] })
    win.kissScorm.interaction({
      id: 'either',
      response: 'c',
      correct: { anyOf: [2, [0, 3]] },
    })
    const d = one.data
    expect(d.get('cmi.interactions.0.student_response')).toBe('b,a')
    expect(d.get('cmi.interactions.0.correct_responses.0.pattern')).toBe(
      '{a,b}',
    )
    expect(d.get('cmi.interactions.1.correct_responses.0.pattern')).toBe('c')
    expect(d.get('cmi.interactions.1.correct_responses.1.pattern')).toBe(
      '{a,d}',
    )
    expect(d.get('cmi.interactions.1.correct_responses.2.pattern')).toBe(
      undefined,
    )
  })

  // Only 401, not implemented, means the LMS has no interactions.
  it('records later answers after the LMS refuses one field of an answer', () => {
    const one = lms({ refuse: { 'cmi.interactions.0.result': '405' } })
    const win = load(frame({ API: one.api }))
    win.kissScorm.interaction({ id: 'q1', response: 0, result: true })
    win.kissScorm.interaction({ id: 'q2', response: 1, result: true })
    expect(one.data.get('cmi.interactions.0.time')).toMatch(/^\d\d:/)
    expect(one.data.get('cmi.interactions.1.result')).toBe('correct')
  })

  it('cleans an interaction id to a CMIIdentifier, and two long ids stay distinct', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    const long = 'course/an-introduction-to-the-subject/'.repeat(8)
    for (const id of ['course/lesson one/question 1', `${long}a`, `${long}b`])
      win.kissScorm.interaction({ id, response: 0 })
    const ids = [0, 1, 2].map((n) => one.data.get(`cmi.interactions.${n}.id`))
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_.-]+$/)
      expect(id.length).toBeLessThanOrEqual(255)
    }
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).not.toBe('course_lesson_one_question_1')
  })

  it('switches interactions off quietly when the LMS does not support them', () => {
    const one = lms({ interactions: false })
    const win = load(frame({ API: one.api }))
    win.kissScorm.interaction({ id: 'q1', response: 0 })
    win.kissScorm.interaction({ id: 'q2', response: 0 })
    expect(
      one.sets().filter(([k]) => k.startsWith('cmi.interactions')),
    ).toEqual([])
    win.kissScorm.score(1)
    expect(win.kissScorm.available).toBe(true)
    expect(one.data.get('cmi.core.score.raw')).toBe('100')
  })

  it('scores a fraction as a whole percentage, clamped', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    win.kissScorm.score(2 / 3)
    expect(
      ['raw', 'min', 'max'].map((k) => one.data.get(`cmi.core.score.${k}`)),
    ).toEqual(['67', '0', '100'])
    win.kissScorm.score(1.4)
    expect(one.data.get('cmi.core.score.raw')).toBe('100')
    win.kissScorm.score(-1)
    expect(one.data.get('cmi.core.score.raw')).toBe('0')
  })

  it('still records the score, and stays on, where the LMS has no score.min or score.max', () => {
    const one = lms({
      refuse: { 'cmi.core.score.min': '401', 'cmi.core.score.max': '401' },
    })
    const win = load(frame({ API: one.api }))
    win.kissScorm.score(0.8)
    expect(one.data.get('cmi.core.score.raw')).toBe('80')
    expect(win.kissScorm.available).toBe(true)
    win.kissScorm.status('passed')
    expect(one.data.get('cmi.core.lesson_status')).toBe('passed')
  })

  it('sets a status the page asks for, and ignores one SCORM 1.2 does not know', () => {
    const one = lms()
    const win = load(frame({ API: one.api }), { manual: true })
    win.kissScorm.status('passed')
    expect(one.data.get('cmi.core.lesson_status')).toBe('passed')
    win.kissScorm.status('done')
    expect(one.data.get('cmi.core.lesson_status')).toBe('passed')
  })

  it('finishes the session when the page is left for good, with its session time', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    win.fire('pagehide', { persisted: false })
    expect(one.data.get('cmi.core.session_time')).toMatch(/^\d{2,4}:\d\d:\d\d$/)
    expect(one.names().slice(-3)).toEqual([
      'LMSSetValue',
      'LMSCommit',
      'LMSFinish',
    ])
  })

  it('keeps the session open through the back/forward cache, so a later answer is recorded', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    win.fire('pagehide', { persisted: true })
    win.fire('pageshow', { persisted: true })
    win.kissScorm.interaction({ id: 'q1', response: 0, result: true })
    expect(one.names()).not.toContain('LMSFinish')
    expect(one.data.get('cmi.interactions.0.result')).toBe('correct')
  })

  // A paused page is not a learner learning: an hour in the cache is not an
  // hour of session time.
  it('counts no time the page spent in the back/forward cache', () => {
    const one = lms()
    const clock = { now: 0 }
    const win = load(frame({ API: one.api }), { clock })
    clock.now = 10_000
    win.fire('pagehide', { persisted: true })
    clock.now += 3_600_000
    win.fire('pageshow', { persisted: true })
    clock.now += 10_000
    win.fire('pagehide', { persisted: false })
    expect(one.data.get('cmi.core.session_time')).toBe('00:00:20')
  })

  // An error that leaves the session open fails that one call. Turning the
  // bridge off for it lost every later score, status and the finish.
  it('keeps tracking after a commit the LMS refuses once, and still finishes', () => {
    const one = lms({ commitFails: 1 })
    const win = load(frame({ API: one.api }), { manual: true })
    expect(win.kissScorm.available).toBe(true)
    win.kissScorm.score(0.9)
    win.kissScorm.status('passed')
    win.fire('pagehide', { persisted: false })
    expect(one.data.get('cmi.core.score.raw')).toBe('90')
    expect(one.data.get('cmi.core.lesson_status')).toBe('passed')
    expect(one.names().slice(-1)).toEqual(['LMSFinish'])
    expect(win.kissScorm.log).toContainEqual(
      expect.objectContaining({ call: 'LMSCommit', ok: false, code: '101' }),
    )
  })

  it('starts a session the LMS ended again, once, and retries the write', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    one.end()
    win.kissScorm.score(0.5)
    expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(2)
    expect(one.data.get('cmi.core.score.raw')).toBe('50')
  })

  it('turns itself off, without throwing, when the LMS will not start again', () => {
    const one = lms({ reinit: false })
    const win = load(frame({ API: one.api }))
    one.end()
    expect(() => win.kissScorm.score(0.5)).not.toThrow()
    expect(win.kissScorm.available).toBe(false)
    const before = one.calls.length
    win.kissScorm.interaction({ id: 'q1', response: 0 })
    win.fire('pagehide', { persisted: false })
    expect(one.calls.length).toBe(before)
  })

  // A page may keep `const scorm = window.kissScorm` while the bridge still
  // waits: the object it kept must reach the session once there is one.
  it('a reference kept while the bridge waited still records once it is ready', () => {
    const one = lms()
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const inner = load(frame({ parent: outer }), { manual: true })
    const scorm = inner.kissScorm
    load(outer, { manual: true })
    outer.ready()
    expect(scorm.available).toBe(true)
    expect(scorm.mode).toBe('normal')
    scorm.score(0.75)
    scorm.status('passed')
    expect(scorm.bookmark('topic-2')).toBe(true)
    expect(one.data.get('cmi.core.score.raw')).toBe('75')
    expect(one.data.get('cmi.core.lesson_status')).toBe('passed')
    expect(one.data.get('cmi.core.lesson_location')).toBe('topic-2')
  })

  it('queues an answer as given while the bridge waits, though the page reuses the object', () => {
    const one = lms()
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const inner = load(frame({ parent: outer }))
    const answer = { id: 'a', response: [0], correct: [0] }
    inner.kissScorm.interaction(answer)
    answer.id = 'b'
    answer.response.push(1)
    answer.correct.push(2)
    inner.kissScorm.interaction(answer)
    load(outer)
    outer.ready()
    const at = (n, f) => one.data.get(`cmi.interactions.${n}.${f}`)
    expect([0, 1].map((n) => at(n, 'id'))).toEqual(['a', 'b'])
    expect(at(0, 'student_response')).toBe('a')
    expect(at(0, 'correct_responses.0.pattern')).toBe('{a}')
    expect(at(1, 'student_response')).toBe('a,b')
    expect(at(1, 'correct_responses.0.pattern')).toBe('{a,c}')
  })

  // The time an answer was given survives every queue and every hop: the
  // placeholder's, and the forward from an embedded page to its owner.
  it('records an embedded answer at the time it was given, not when its parent loaded', () => {
    const one = lms()
    const clock = { now: new Date(2026, 0, 1, 1, 0, 0).getTime() }
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const inner = load(frame({ parent: outer }), { clock })
    inner.kissScorm.interaction({ id: 'a', response: 0 })
    clock.now = new Date(2026, 0, 1, 2, 0, 0).getTime()
    load(outer, { clock })
    outer.ready()
    expect(one.data.get('cmi.interactions.0.time')).toBe('01:00:00')
  })

  it('waits for a parent still loading, so the parent owns the session whichever bridge runs first', () => {
    const one = lms()
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const inner = load(frame({ parent: outer }))
    inner.kissScorm.interaction({ id: 'early', response: 0, result: true })
    expect(one.calls).toEqual([])
    // The parent's bridge runs after its iframe's (placed late in its body), then it finishes loading.
    load(outer)
    outer.ready()
    expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(1)
    expect(outer.kissScorm.available).toBe(true)
    expect(inner.kissScorm.available).toBe(true)
    expect(one.data.get('cmi.interactions.0.id')).toBe('early')
    inner.fire('pagehide', { persisted: false })
    expect(one.names()).not.toContain('LMSFinish')
    outer.fire('pagehide', { persisted: false })
    expect(one.names().filter((n) => n === 'LMSFinish')).toHaveLength(1)
  })

  it('a page embedded in a page that is still waiting reaches the session once its owner decides', () => {
    const one = lms()
    // outer is still loading; middle runs first and waits; inner then proxies to middle.
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const middle = load(frame({ parent: outer }))
    const inner = load(frame({ parent: middle }))
    load(outer)
    outer.ready()
    inner.kissScorm.interaction({ id: 'late', response: 1, result: true })
    expect(inner.kissScorm.available).toBe(true)
    expect(one.data.get('cmi.interactions.0.id')).toBe('late')
    expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(1)
  })

  it('owns the session itself once a parent with no bridge has loaded', () => {
    const one = lms()
    const outer = frame({ parent: frame({ API: one.api }), loading: true })
    const inner = load(frame({ parent: outer }))
    inner.kissScorm.score(0.5)
    expect(inner.kissScorm.available).toBe(false)
    outer.ready()
    expect(inner.kissScorm.available).toBe(true)
    expect(one.data.get('cmi.core.score.raw')).toBe('50')
  })

  // `ready(fn)`: one code path for a page, whichever way its bridge decides.
  describe('ready()', () => {
    it('calls back at once on a live bridge, and with no LMS, and resolves a promise', async () => {
      const one = lms({ entry: 'resume', location: 'topic-2' })
      const win = load(frame({ API: one.api }))
      const seen = []
      const promised = win.kissScorm.ready((s) =>
        seen.push([s.available, s.resumed?.location]),
      )
      expect(seen).toEqual([[true, 'topic-2']])
      expect(await promised).toBe(win.kissScorm)
      const offline = load(frame())
      const off = []
      offline.kissScorm.ready((s) => off.push([s.available, s.resumed]))
      expect(off).toEqual([[false, null]])
    })

    // The case it exists for: a parent still loading, so the page's bridge
    // waits, and `resumed` is null until it decides.
    it('waits for a still-loading parent, then hands the page what it resumes', async () => {
      const one = lms({ entry: 'resume', location: 'topic-2', state: 'v1' })
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      const seen = []
      const promised = inner.kissScorm.ready((s) => {
        seen.push(s.resumed)
        s.bookmark(s.resumed.location)
      })
      expect(inner.kissScorm.resumed).toBeNull()
      expect(seen).toEqual([])
      expect(one.sets().map(([k]) => k)).not.toContain(
        'cmi.core.lesson_location',
      )
      outer.ready()
      expect(seen).toEqual([{ location: 'topic-2', state: 'v1' }])
      expect(one.data.get('cmi.core.lesson_location')).toBe('topic-2')
      // The page's own placeholder, which forwards to the decided bridge.
      const handed = await promised
      expect(handed.available).toBe(true)
      expect(handed.resumed).toEqual({ location: 'topic-2', state: 'v1' })
    })

    // A bookmark or state queued before the bridge knew the learner was
    // resuming was written blind: it must not overwrite what they left.
    it('drops a bookmark and state queued before a resume was known, and keeps the rest', () => {
      const one = lms({ entry: 'resume', location: 'topic-2', state: 'v1' })
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      inner.kissScorm.bookmark('')
      inner.kissScorm.save('v0')
      inner.kissScorm.score(0.5)
      outer.ready()
      expect(one.data.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.data.get('cmi.suspend_data')).toBe('v1')
      expect(one.data.get('cmi.core.score.raw')).toBe('50')
      expect(inner.kissScorm.log).toContainEqual(
        expect.objectContaining({ event: expect.stringMatching(/dropped/) }),
      )
    })

    // An embedded page and the page that embeds it, both waiting for a page
    // above still loading, and the embedded one decides first: it becomes a
    // proxy to a placeholder, so it is ready only when that one is.
    it('calls back once, with what is resumed, when the page above decides after it', () => {
      const one = lms({ entry: 'resume', location: 'topic-2' })
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      load(middle)
      const seen = []
      inner.kissScorm.ready((s) =>
        seen.push([s.available, s.resumed?.location]),
      )
      inner.kissScorm.bookmark('')
      middle.ready()
      top.ready()
      expect(seen).toEqual([[true, 'topic-2']])
      expect(one.data.get('cmi.core.lesson_location')).toBe('topic-2')
    })

    // A script that runs between the embedded page's handover and its owner's
    // (another DOMContentLoaded listener) reaches window.kissScorm: its calls
    // must land after the ones queued before, not overtake them.
    it('keeps calls in order when a script calls in between two handovers', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.bookmark('earlier')
      inner.kissScorm.score(0.2)
      top.document.addEventListener('DOMContentLoaded', () => {
        inner.kissScorm.bookmark('later')
        inner.kissScorm.score(0.9)
      })
      load(middle)
      middle.ready()
      top.ready()
      const writes = (key) =>
        one
          .sets()
          .filter(([k]) => k === key)
          .map(([, v]) => v)
      expect(writes('cmi.core.lesson_location')).toEqual(['earlier', 'later'])
      expect(writes('cmi.core.score.raw')).toEqual(['20', '90'])
    })

    // Two pages of one SCO, each queueing while a page above loads: their
    // writes share one session, so they replay in the order they were made,
    // whichever page hands over first.
    it('replays writes queued by two pages of one session in the order they were made', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.bookmark('earlier-child')
      inner.kissScorm.save('older-answers')
      inner.kissScorm.score(0.2)
      load(middle)
      middle.kissScorm.bookmark('later-owner')
      middle.kissScorm.save('newer-answers')
      middle.kissScorm.score(0.9)
      middle.ready()
      top.ready()
      expect(one.data.get('cmi.core.lesson_location')).toBe('later-owner')
      expect(one.data.get('cmi.suspend_data')).toBe('newer-answers')
      expect(one.data.get('cmi.core.score.raw')).toBe('90')
    })

    // The queue outlives a page (it is kept on the window above): a page that
    // leaves before its bridge decides takes its calls with it, and holds up
    // no other page's.
    it('drops the calls of a page that left before its bridge decided, and replays the rest', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.bookmark('from-a-page-that-left')
      load(middle)
      middle.kissScorm.bookmark('owner')
      inner.fire('pagehide', { persisted: false })
      middle.ready()
      top.ready()
      const locations = one
        .sets()
        .filter(([k]) => k === 'cmi.core.lesson_location')
        .map(([, v]) => v)
      expect(locations).toEqual(['owner'])
    })

    // The page above loads first, so the owner decides while the embedded
    // page's older call still waits: the owner's newer call must wait too.
    it('keeps the order when the owner decides before the page it embeds', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.score(0.2)
      load(middle)
      top.ready()
      middle.kissScorm.score(0.9)
      middle.ready()
      const scores = one
        .sets()
        .filter(([k]) => k === 'cmi.core.score.raw')
        .map(([, v]) => v)
      expect(scores).toEqual(['20', '90'])
    })

    it('finishes every waiting page when one page’s ready callback throws', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const owner = frame({ parent: top, loading: true })
      const first = load(frame({ parent: owner }))
      const second = load(frame({ parent: owner }))
      first.kissScorm.ready(() => {
        throw new Error('page bug')
      })
      second.kissScorm.score(0.5)
      let seen = false
      second.kissScorm.ready(() => (seen = true))
      load(owner)
      owner.ready()
      expect(() => top.ready()).toThrow('page bug')
      expect(seen).toBe(true)
      expect(second.kissScorm.available).toBe(true)
      expect(one.data.get('cmi.core.score.raw')).toBe('50')
    })

    // A page's own pagehide listener, after the bridge's, may still call it.
    it('takes no call from a page that has left, so the next launch is not held up', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const gone = load(frame({ parent: top }))
      gone.addEventListener('pagehide', () => {
        expect(gone.kissScorm.save('late')).toBe(false)
        gone.kissScorm.score(0.1)
      })
      gone.fire('pagehide', { persisted: false })
      const next = load(frame({ parent: top }))
      next.kissScorm.score(0.7)
      let seen = false
      next.kissScorm.ready(() => (seen = true))
      top.ready()
      expect(seen).toBe(true)
      expect(one.data.get('cmi.core.score.raw')).toBe('70')
      expect(one.data.get('cmi.suspend_data')).toBe('')
    })

    // What a ready() callback writes is written now, so after every call
    // queued before it, whoever queued that.
    it('orders a ready callback’s writes after the calls queued before them', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      load(middle)
      middle.kissScorm.ready((s) => s.score(0.9))
      inner.kissScorm.score(0.2)
      middle.ready()
      top.ready()
      const scores = one
        .sets()
        .filter(([k]) => k === 'cmi.core.score.raw')
        .map(([, v]) => v)
      expect(scores).toEqual(['20', '90'])
    })

    // A callback has read `resumed`: what it keeps is informed, not blind.
    it('sends what a ready callback keeps over what was resumed', () => {
      const one = lms({ entry: 'resume', location: 'old', state: 'v1' })
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      load(middle)
      let kept = null
      inner.kissScorm.ready((s) => {
        kept = s.bookmark('new')
        s.save('v2')
      })
      middle.ready()
      top.ready()
      expect(kept).toBe(true)
      expect(one.data.get('cmi.core.lesson_location')).toBe('new')
      expect(one.data.get('cmi.suspend_data')).toBe('v2')
    })

    // The page embedding it never had to wait (nothing above it loading), so
    // its bridge decides at once, with the embedded page's calls still queued.
    it('holds an owner that never waited behind the calls its embedded page queued', () => {
      const one = lms()
      const middle = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.score(0.2)
      inner.kissScorm.save('older')
      load(middle)
      middle.kissScorm.score(0.9)
      middle.kissScorm.save('newer')
      middle.ready()
      expect(one.data.get('cmi.core.score.raw')).toBe('90')
      expect(one.data.get('cmi.suspend_data')).toBe('newer')
      expect(middle.kissScorm.available).toBe(true)
    })

    // A page that has left writes nothing more into the session it shared,
    // through the object it published or one it kept.
    it('takes no call from an embedded page after it has left, published or not', () => {
      const one = lms()
      const outer = load(frame({ parent: frame({ API: one.api }) }))
      const direct = load(frame({ parent: outer }))
      const keptDirect = direct.kissScorm
      const top = frame({ parent: frame({ API: lms().api }), loading: true })
      const waited = load(frame({ parent: top }))
      const keptWaited = waited.kissScorm
      top.ready()
      direct.fire('pagehide', { persisted: false })
      outer.kissScorm.save('owner-new')
      expect(keptDirect.save('stale')).toBe(false)
      keptDirect.score(0.1)
      expect(one.data.get('cmi.suspend_data')).toBe('owner-new')
      expect(one.data.get('cmi.core.score.raw')).toBe(undefined)
      waited.fire('pagehide', { persisted: false })
      expect(keptWaited.save('stale')).toBe(false)
      expect(waited.kissScorm.save('stale')).toBe(false)
    })

    // Two SCOs, each with its own LMS API, under one same-origin shell: the
    // queue belongs to a SCO's session, so one SCO still waiting holds up
    // nothing of the other's.
    it('keeps the queue to one SCO, so an independent SCO is not held up', () => {
      const shell = frame()
      const lmsA = lms()
      const lmsB = lms()
      const apiA = frame({ parent: shell, API: lmsA.api })
      const scoA = frame({ parent: apiA, loading: true })
      const childA = load(frame({ parent: scoA }))
      childA.kissScorm.score(0.3)
      const apiB = frame({ parent: shell, API: lmsB.api })
      const scoB = load(frame({ parent: apiB }))
      let seen = false
      scoB.kissScorm.ready(() => (seen = true))
      scoB.kissScorm.score(0.6)
      expect(seen).toBe(true)
      expect(lmsB.data.get('cmi.core.score.raw')).toBe('60')
      expect(lmsA.data.get('cmi.core.score.raw')).toBe(undefined)
    })

    // A page under its own SCO's API belongs to that session, not to a kiss
    // page further up that owns another.
    it('never proxies past the nearest LMS API to another SCO’s bridge', () => {
      const lmsA = lms()
      const lmsB = lms()
      const ownerA = load(frame({ parent: frame({ API: lmsA.api }) }))
      const apiB = frame({ parent: ownerA, API: lmsB.api })
      const page = load(frame({ parent: apiB }))
      page.kissScorm.score(0.8)
      expect(lmsB.data.get('cmi.core.score.raw')).toBe('80')
      expect(lmsA.data.get('cmi.core.score.raw')).toBe(undefined)
    })

    // Two kiss pages side by side under a wrapper with no bridge of its own:
    // one session, started once, which both use.
    it('starts one session for sibling pages, and keeps what each of them saved', () => {
      const one = lms()
      const wrapper = frame({ parent: frame({ API: one.api }), loading: true })
      const first = load(frame({ parent: wrapper }))
      const second = load(frame({ parent: wrapper }))
      expect(first.kissScorm.save('first')).toBe(true)
      expect(second.kissScorm.save('second')).toBe(true)
      wrapper.ready()
      expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(1)
      expect(one.data.get('cmi.suspend_data')).toBe('second')
      expect(second.kissScorm.available).toBe(true)
    })

    it('runs no ready callback of an embedded page that has left', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const owner = load(frame({ parent: top }))
      const inner = load(frame({ parent: owner }))
      const calls = []
      inner.kissScorm.ready(() => calls.push('before'))
      inner.fire('pagehide', { persisted: false })
      expect(inner.kissScorm.ready(() => calls.push('after'))).toBe(undefined)
      top.ready()
      expect(calls).toEqual([])
      expect(owner.kissScorm.available).toBe(true)
    })

    // An embedded page that is still waiting can queue at any moment, so its
    // owner stays held while it waits, even with nothing queued yet.
    it('holds an owner while an embedded page still waits, though nothing is queued yet', () => {
      const one = lms()
      const middle = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: middle }))
      load(middle)
      inner.kissScorm.save('older')
      middle.kissScorm.save('newer')
      middle.ready()
      expect(one.data.get('cmi.suspend_data')).toBe('newer')
    })

    it('publishes no owner that decided while an embedded page still waits', () => {
      const one = lms()
      const top = frame({ parent: frame({ API: one.api }), loading: true })
      const middle = frame({ parent: top, loading: true })
      const inner = load(frame({ parent: middle }))
      load(middle)
      top.ready()
      inner.kissScorm.score(0.2)
      middle.kissScorm.score(0.9)
      middle.ready()
      const scores = one
        .sets()
        .filter(([k]) => k === 'cmi.core.score.raw')
        .map(([, v]) => v)
      expect(scores).toEqual(['20', '90'])
    })

    it('runs no ready callback of a held owner that has left', () => {
      const one = lms()
      const middle = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: middle }))
      inner.kissScorm.score(0.2)
      load(middle)
      const calls = []
      middle.kissScorm.ready(() => calls.push('before'))
      middle.fire('pagehide', { persisted: false })
      inner.fire('pagehide', { persisted: false })
      expect(calls).toEqual([])
      expect(middle.kissScorm.ready(() => calls.push('after'))).toBe(undefined)
      expect(calls).toEqual([])
    })

    // Only a resumed field with something in it is protected.
    it('sends a queued bookmark or state when the resumed one is empty', () => {
      const one = lms({ entry: 'resume', location: '', state: 'v1' })
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      inner.kissScorm.bookmark('topic-1')
      inner.kissScorm.save('v0')
      outer.ready()
      inner.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-1')
      expect(one.durable.get('cmi.suspend_data')).toBe('v1')
    })

    // A field the LMS did not return is unknown, not empty: what it may
    // hold is protected, and the page is told it is unknown (null).
    it('protects a resumed field the LMS failed to return, and says it is unknown', () => {
      const one = lms({ entry: 'resume', location: 'topic-2', state: 'v1' })
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      inner.kissScorm.bookmark('')
      inner.kissScorm.save('')
      one.refuseNextRead('cmi.core.lesson_location', '101')
      one.refuseNextRead('cmi.suspend_data', '101')
      let seen = null
      inner.kissScorm.ready((s) => (seen = s.resumed))
      outer.ready()
      inner.advance(3000)
      expect(seen).toEqual({ location: null, state: null })
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.durable.get('cmi.suspend_data')).toBe('v1')
    })

    // Whether the learner is resuming is itself a read: unknown is not "no".
    it('protects the saved place when the LMS fails to say whether the learner is resuming', () => {
      const one = lms({
        entry: 'resume',
        location: 'topic-2',
        state: 'answers-v1',
      })
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      inner.kissScorm.bookmark('')
      inner.kissScorm.save('answers-v0')
      one.refuseNextRead('cmi.core.entry', '101')
      let seen
      inner.kissScorm.ready((s) => (seen = s.resumed))
      outer.ready()
      inner.advance(3000)
      inner.fire('pagehide', { persisted: false })
      expect(seen).toEqual({ location: null, state: null })
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.durable.get('cmi.suspend_data')).toBe('answers-v1')
    })

    // The page was told `true` when it queued them: a refusal at replay is
    // the bridge's to keep and write again, as for any write the page never
    // saw refused.
    it('writes a queued bookmark and state again when the LMS refuses them at replay', () => {
      const one = lms()
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      expect(inner.kissScorm.bookmark('topic-1')).toBe(true)
      expect(inner.kissScorm.save('v1')).toBe(true)
      one.refuseNext('cmi.core.lesson_location', '101')
      one.refuseNext('cmi.suspend_data', '101')
      outer.ready()
      inner.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-1')
      expect(one.durable.get('cmi.suspend_data')).toBe('v1')
      expect(one.durable.get('cmi.core.exit')).toBe('suspend')
    })

    it('sends a queued bookmark when the learner is not resuming', () => {
      const one = lms()
      const outer = frame({ parent: frame({ API: one.api }), loading: true })
      const inner = load(frame({ parent: outer }))
      inner.kissScorm.bookmark('topic-1')
      outer.ready()
      expect(one.data.get('cmi.core.lesson_location')).toBe('topic-1')
    })

    it("on an embedded page, calls back with the page's own kissScorm", async () => {
      const one = lms()
      const outer = load(frame({ parent: frame({ API: one.api }) }))
      const inner = load(frame({ parent: outer }))
      let got = null
      const promised = inner.kissScorm.ready((s) => (got = s))
      expect(got).toBe(inner.kissScorm)
      expect(got.available).toBe(true)
      expect(await promised).toBe(inner.kissScorm)
    })
  })

  it('an embedded kiss page uses the session of the page that embeds it', () => {
    const one = lms()
    const outer = load(frame({ parent: frame({ API: one.api }) }))
    const inner = load(frame({ parent: outer }))
    inner.kissScorm.interaction({ id: 'q1', response: 1, result: true })
    expect(inner.kissScorm.available).toBe(true)
    expect(one.data.get('cmi.interactions.0.id')).toBe('q1')
    inner.fire('pagehide', { persisted: false })
    expect(one.names()).not.toContain('LMSFinish')
    outer.fire('pagehide', { persisted: false })
    expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(1)
    expect(one.names().filter((n) => n === 'LMSFinish')).toHaveLength(1)
  })

  it('hands back the bookmark and state when the learner resumes, and nothing otherwise', () => {
    const one = lms({
      entry: 'resume',
      location: 'topic-2/quiz',
      state: 'v1|a1b0',
    })
    const win = load(frame({ API: one.api }))
    expect(win.kissScorm.resumed).toEqual({
      location: 'topic-2/quiz',
      state: 'v1|a1b0',
    })
    for (const entry of ['ab-initio', '']) {
      const other = lms({ entry, location: 'topic-2/quiz' })
      expect(load(frame({ API: other.api })).kissScorm.resumed).toBeNull()
    }
    expect(load(frame()).kissScorm.resumed).toBeNull()
  })

  it('bookmarks and saves state, and asks the LMS to resume next time, once', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    expect(win.kissScorm.bookmark('topic-3/basics')).toBe(true)
    expect(win.kissScorm.save('v1|q3=b')).toBe(true)
    expect(win.kissScorm.bookmark('topic-4')).toBe(true)
    expect(one.data.get('cmi.core.lesson_location')).toBe('topic-4')
    expect(one.data.get('cmi.suspend_data')).toBe('v1|q3=b')
    expect(one.sets().filter(([k]) => k === 'cmi.core.exit')).toEqual([
      ['cmi.core.exit', 'suspend'],
    ])
  })

  // A real LMS commits with synchronous XHR, which a browser may block while
  // the page is dismissed: the learner's place is committed soon after it is
  // written, not left to the exit.
  describe('the checkpoint after a bookmark or state', () => {
    const commits = (one) => one.names().filter((n) => n === 'LMSCommit')

    it('commits a bookmark a moment later, once', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      const before = commits(one).length
      win.kissScorm.bookmark('topic-2')
      expect(commits(one)).toHaveLength(before)
      win.advance(3000)
      expect(commits(one)).toHaveLength(before + 1)
      win.advance(10_000)
      expect(commits(one)).toHaveLength(before + 1)
    })

    it('commits a burst of bookmarks once', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      const before = commits(one).length
      win.kissScorm.bookmark('topic-2')
      win.advance(500)
      win.kissScorm.bookmark('topic-3')
      win.advance(3000)
      expect(commits(one)).toHaveLength(before + 1)
      expect(one.data.get('cmi.core.lesson_location')).toBe('topic-3')
    })

    it('commits saved state on its own as well', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      const before = commits(one).length
      win.kissScorm.save('v1|q1=a')
      win.advance(3000)
      expect(commits(one)).toHaveLength(before + 1)
    })

    it('is cancelled by any other commit, which carried the bookmark already', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      expect(win.pending()).toBe(1)
      win.kissScorm.score(0.5)
      expect(win.pending()).toBe(0)
      const before = commits(one).length
      win.advance(3000)
      expect(commits(one)).toHaveLength(before)
    })

    it('commits nothing once the session has finished', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      win.fire('pagehide', { persisted: false })
      expect(win.pending()).toBe(0)
      const after = one.calls.length
      win.advance(3000)
      expect(one.calls.length).toBe(after)
    })

    // What the LMS persisted, not how often it was asked to.
    it('retries a timed commit that failed, with no further action from the learner', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      one.failCommits(1)
      win.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('')
      win.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
    })

    it('retries when another commit carrying the bookmark fails', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      one.failCommits(1)
      win.kissScorm.score(0.5)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('')
      win.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.durable.get('cmi.core.score.raw')).toBe('50')
    })

    it('gives up retrying after a few attempts, and leaves no timer behind', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      const before = commits(one).length
      one.failCommits(100)
      win.kissScorm.bookmark('topic-2')
      for (let i = 0; i < 20; i++) win.advance(3000)
      expect(commits(one).length - before).toBeLessThanOrEqual(6)
      expect(win.pending()).toBe(0)
      expect(win.kissScorm.available).toBe(true)
    })

    // Moodle's LMSInitialize rebuilds the data model from what was persisted:
    // a session restarted under a pending commit must get its writes back.
    it('restores what it wrote since the last commit into a session the LMS restarted', () => {
      const one = lms({ resets: true })
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      win.kissScorm.save('v1|q1=a')
      one.end()
      win.advance(3000)
      expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(2)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.durable.get('cmi.suspend_data')).toBe('v1|q1=a')
      expect(one.durable.get('cmi.core.exit')).toBe('suspend')
    })

    // A value the restarted session refused is still unsaved, however well
    // the commit after it goes: it is written again and committed later.
    it('keeps a value the restarted session refused, and writes it again', () => {
      const one = lms({ resets: true })
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      win.kissScorm.save('v1|q1=a')
      one.refuseNext('cmi.core.lesson_location', '101')
      one.end()
      win.advance(3000)
      expect(one.durable.get('cmi.suspend_data')).toBe('v1|q1=a')
      expect(one.durable.get('cmi.core.lesson_location')).toBe('')
      win.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(win.pending()).toBe(0)
    })

    // A refused interaction id leaves the LMS's count short: the next answer
    // must not take the unrestored answer's index.
    it('does not let a new answer overwrite one a restarted session has not taken back', () => {
      const one = lms({ resets: true })
      const win = load(frame({ API: one.api }))
      one.failCommits(1)
      win.kissScorm.interaction({ id: 'a', response: 0, correct: 0 })
      one.end()
      one.refuseNext('cmi.interactions.0.id', '101')
      win.kissScorm.interaction({ id: 'b', response: 1 })
      for (let i = 0; i < 3; i++) win.advance(3000)
      const ids = [0, 1].map((n) => one.durable.get(`cmi.interactions.${n}.id`))
      expect(ids).toEqual(['a', 'b'])
      expect(
        one.durable.get('cmi.interactions.1.correct_responses.0.pattern'),
      ).toBe(undefined)
      expect(win.pending()).toBe(0)
    })

    // The case the checkpoint exists for, on Moodle's commit model: every
    // request made while the page is dismissed is blocked. The learner comes
    // back where the last timed commit left them, not at the start.
    it('keeps the place committed before a dismissal whose requests are all blocked', () => {
      const one = lms({ delta: true })
      const win = load(frame({ API: one.api, visible: true }))
      win.kissScorm.bookmark('topic-3')
      win.kissScorm.save('v1|q3=b')
      win.advance(3000)
      win.kissScorm.bookmark('topic-4')
      one.block()
      win.hide()
      win.fire('pagehide', { persisted: false })
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-3')
      expect(one.durable.get('cmi.suspend_data')).toBe('v1|q3=b')
      expect(one.durable.get('cmi.core.exit')).toBe('suspend')
    })

    // A page may reuse one answer object: what is queued is the answer as
    // given, not whatever the object holds when the queue drains.
    it('records each deferred answer as it was given, though the page reuses the object', () => {
      const one = lms({ resets: true })
      const win = load(frame({ API: one.api }))
      one.failCommits(1)
      win.kissScorm.interaction({ id: 'a', response: 0 })
      one.end()
      one.refuseNext('cmi.interactions.0.id', '101')
      const reused = { id: 'b', response: [1], correct: { anyOf: [[1]] } }
      win.kissScorm.interaction(reused)
      reused.id = 'c'
      reused.response.push(2)
      reused.correct.anyOf[0].push(3)
      win.kissScorm.interaction(reused)
      for (let i = 0; i < 3; i++) win.advance(3000)
      const at = (n, f) => one.durable.get(`cmi.interactions.${n}.${f}`)
      expect([0, 1, 2].map((n) => at(n, 'id'))).toEqual(['a', 'b', 'c'])
      expect(at(1, 'student_response')).toBe('b')
      expect(at(1, 'correct_responses.0.pattern')).toBe('{b}')
      expect(at(2, 'student_response')).toBe('b,c')
      expect(at(2, 'correct_responses.0.pattern')).toBe('{b,d}')
    })

    it('keeps a deferred answer whose id the LMS refuses once, and records it later', () => {
      const one = lms({ resets: true })
      const win = load(frame({ API: one.api }))
      one.failCommits(1)
      win.kissScorm.interaction({ id: 'a', response: 0 })
      one.end()
      one.refuseNext('cmi.interactions.0.id', '101')
      win.kissScorm.interaction({ id: 'b', response: 1 })
      one.refuseNext('cmi.interactions.1.id', '101')
      for (let i = 0; i < 4; i++) win.advance(3000)
      const ids = [0, 1].map((n) => one.durable.get(`cmi.interactions.${n}.id`))
      expect(ids).toEqual(['a', 'b'])
      expect(win.pending()).toBe(0)
    })

    // Written back, at its index, before the commit that follows the answer.
    it('keeps a field of an answer the LMS refuses once, at its index, and writes it again', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      one.refuseNext('cmi.interactions.0.result', '101')
      win.kissScorm.interaction({ id: 'q', response: 0, result: true })
      expect(one.durable.get('cmi.interactions.0.id')).toBe('q')
      expect(one.durable.get('cmi.interactions.0.result')).toBe('correct')
      expect(win.pending()).toBe(0)
    })

    // A bookmark without suspend is a place the LMS will not offer back.
    it('writes the suspend again when the LMS refuses it once', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      one.refuseNext('cmi.core.exit', '101')
      expect(win.kissScorm.bookmark('topic-2')).toBe(true)
      win.advance(3000)
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
      expect(one.durable.get('cmi.core.exit')).toBe('suspend')
    })

    it('writes the suspend of a resumed learner again when the LMS refuses it at the start', () => {
      const one = lms({ entry: 'resume', location: 'topic-2' })
      one.refuseNext('cmi.core.exit', '101')
      const win = load(frame({ API: one.api }))
      win.fire('pagehide', { persisted: false })
      expect(one.durable.get('cmi.core.exit')).toBe('suspend')
    })

    // Every write the page cannot see refused is the bridge's to keep: a
    // completion, a status, a score.
    it('writes a completion, a status and a score again when the LMS refuses them once', () => {
      const one = lms()
      one.refuseNext('cmi.core.lesson_status', '101')
      const win = load(frame({ API: one.api }))
      expect(one.durable.get('cmi.core.lesson_status')).toBe('completed')
      one.refuseNext('cmi.core.score.raw', '101')
      win.kissScorm.score(0.5)
      expect(one.durable.get('cmi.core.score.raw')).toBe('50')
      one.refuseNext('cmi.core.lesson_status', '101')
      win.kissScorm.status('passed')
      expect(one.durable.get('cmi.core.lesson_status')).toBe('passed')
    })

    // A bookmark or state the LMS refuses is the page's to know: `false`,
    // and never written behind its back.
    it('does not write a refused bookmark later: the page was told it failed', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      one.refuseNext('cmi.core.lesson_location', '101')
      expect(win.kissScorm.bookmark('topic-2')).toBe(false)
      win.kissScorm.score(0.5)
      win.advance(3000)
      expect(one.data.get('cmi.core.lesson_location')).toBe('')
    })

    it('leaves no retry behind when the last commit before finishing failed', () => {
      const one = lms()
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      one.failCommits(1)
      win.fire('pagehide', { persisted: false })
      expect(win.pending()).toBe(0)
      // LMSFinish persisted what the failed commit did not.
      expect(one.durable.get('cmi.core.lesson_location')).toBe('topic-2')
    })

    it('schedules nothing in review mode', () => {
      const one = lms({ mode: 'review' })
      const win = load(frame({ API: one.api }))
      win.kissScorm.bookmark('topic-2')
      win.kissScorm.save('v1')
      expect(win.pending()).toBe(0)
    })
  })

  it('keeps a resumed learner resumable when this session saves nothing new', () => {
    const one = lms({ entry: 'resume', location: 'topic-2', state: 'v1|a1' })
    const win = load(frame({ API: one.api }))
    win.kissScorm.bookmark('topic-3')
    expect(one.sets().filter(([k]) => k === 'cmi.core.exit')).toEqual([
      ['cmi.core.exit', 'suspend'],
    ])
    const idle = lms({ entry: 'resume', location: 'topic-2' })
    load(frame({ API: idle.api }))
    expect(idle.data.get('cmi.core.exit')).toBe('suspend')
    const review = lms({ entry: 'resume', location: 'topic-2', mode: 'review' })
    load(frame({ API: review.api }))
    expect(review.data.get('cmi.core.exit')).toBeUndefined()
  })

  it('refuses, without writing, a bookmark or state SCORM 1.2 cannot hold: never truncated', () => {
    const one = lms()
    const win = load(frame({ API: one.api }))
    const before = one.sets().length
    expect(win.kissScorm.bookmark('x'.repeat(256))).toBe(false)
    expect(win.kissScorm.save('x'.repeat(4097))).toBe(false)
    expect(win.kissScorm.save('café')).toBe(false)
    expect(win.kissScorm.save('line\nbreak')).toBe(false)
    expect(one.sets().length).toBe(before)
    expect(win.kissScorm.bookmark('x'.repeat(255))).toBe(true)
    expect(win.kissScorm.save('x'.repeat(4096))).toBe(true)
    expect(load(frame()).kissScorm.bookmark('topic-1')).toBe(false)
  })

  it('records nothing in review mode, and says why', () => {
    const one = lms({ mode: 'review' })
    const win = load(frame({ API: one.api }))
    win.kissScorm.interaction({ id: 'q1', response: 0, result: true })
    win.kissScorm.score(1)
    win.kissScorm.status('passed')
    win.kissScorm.bookmark('topic-1')
    win.kissScorm.save('v1')
    expect(one.sets()).toEqual([])
    expect(win.kissScorm.mode).toBe('review')
    expect(win.kissScorm.available).toBe(true)
  })

  it('does not complete a page on load in browse mode, but records answers', () => {
    const one = lms({ mode: 'browse' })
    const win = load(frame({ API: one.api }))
    expect(one.data.get('cmi.core.lesson_status')).toBe('not attempted')
    win.kissScorm.interaction({ id: 'q1', response: 0, result: true })
    expect(one.data.get('cmi.interactions.0.id')).toBe('q1')
  })

  it('commits, without finishing, when the page is hidden', () => {
    const one = lms()
    const win = load(frame({ API: one.api, visible: true }))
    win.hide()
    expect(one.data.get('cmi.core.session_time')).toMatch(/^\d{2,4}:\d\d:\d\d$/)
    expect(one.names().slice(-2)).toEqual(['LMSSetValue', 'LMSCommit'])
    expect(one.names()).not.toContain('LMSFinish')
  })

  it('logs a failed call with its error, and never a value', () => {
    const one = lms({ refuse: { 'cmi.core.score.raw': '405' } })
    const win = load(frame({ API: one.api }))
    win.kissScorm.bookmark('topic-secret')
    win.kissScorm.save('v1|answer-secret')
    win.kissScorm.score(0.5)
    expect(win.kissScorm.log).toContainEqual(
      expect.objectContaining({
        call: 'LMSSetValue',
        element: 'cmi.core.score.raw',
        ok: false,
        code: '405',
        message: 'error 405',
        diagnostic: 'diagnostic 405',
      }),
    )
    const text = JSON.stringify(win.kissScorm.log)
    for (const value of ['topic-secret', 'answer-secret', 'Doe', '50'])
      expect(text).not.toContain(value)
    expect(load(frame()).kissScorm.log).toContainEqual(
      expect.objectContaining({ event: 'no LMS found' }),
    )
  })

  it('finds an API eleven frames up', () => {
    const one = lms()
    let w = frame({ API: one.api })
    for (let i = 0; i < 11; i++) w = frame({ parent: w })
    expect(load(w).kissScorm.available).toBe(true)
  })

  it('an embedded page bookmarks, saves and reads the resume through its owner', () => {
    const one = lms({ entry: 'resume', location: 'topic-1', state: 'v1' })
    const outer = load(frame({ parent: frame({ API: one.api }) }))
    const inner = load(frame({ parent: outer }))
    expect(inner.kissScorm.resumed).toEqual({
      location: 'topic-1',
      state: 'v1',
    })
    expect(inner.kissScorm.bookmark('topic-2')).toBe(true)
    expect(inner.kissScorm.save('v2')).toBe(true)
    expect(one.data.get('cmi.core.lesson_location')).toBe('topic-2')
    expect(one.data.get('cmi.suspend_data')).toBe('v2')
  })

  it('is harmless included twice, and registers no unload or beforeunload', () => {
    const one = lms()
    const win = frame({ API: one.api })
    load(win)
    load(win)
    expect(one.names().filter((n) => n === 'LMSInitialize')).toHaveLength(1)
    win.fire('pagehide', { persisted: false })
    expect(one.names().filter((n) => n === 'LMSFinish')).toHaveLength(1)
    expect(Object.keys(win.listeners).sort()).toEqual(['pagehide', 'pageshow'])
    expect(win.listeners.pageshow).toHaveLength(1)
  })
})

describe('the scormBridge helper', () => {
  let errors
  const render = (src) => {
    const env = Handlebars.create()
    registerHandlebarsHelpers(
      env,
      { dev: false, sass: { includePaths: [] } },
      {
        markdown: new Remarkable(),
        logger: { ...silentLogger, error: (...args) => errors.push(args) },
      },
    )
    return env.compile(src)({})
  }
  beforeEach(() => (errors = []))

  it('renders the bridge as one inline script, unescaped', () => {
    expect(render('{{scormBridge}}')).toBe(scormBridgeScript())
    expect(render('{{scormBridge complete="seen"}}')).toBe(scormBridgeScript())
    expect(render('{{scormBridge complete="manual"}}')).toBe(
      scormBridgeScript({ manual: true }),
    )
    expect(errors).toEqual([])
  })

  it('renders nothing, and says why, for a completion it does not know', () => {
    expect(render('{{scormBridge complete="never"}}')).toBe('')
    expect(errors).toHaveLength(1)
  })
})
