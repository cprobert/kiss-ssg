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
// `location`, `state` and `mode` are what it launches the SCO with, and
// `refuse` maps an element to the error code a write to it raises.
function lms({
  status = 'not attempted',
  interactions = true,
  reinit = true,
  entry = '',
  location = '',
  state = '',
  mode = 'normal',
  refuse = {},
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
      initialised = true
      return ok()
    },
    LMSFinish() {
      calls.push(['LMSFinish'])
      if (!initialised) return fail('301')
      initialised = false
      return ok()
    },
    LMSGetValue(key) {
      calls.push(['LMSGetValue', key])
      if (!initialised) return fail('301', '')
      if (key.startsWith('cmi.interactions') && !interactions)
        return fail('401', '')
      return ok(data.get(key) ?? '')
    },
    LMSSetValue(key, value) {
      calls.push(['LMSSetValue', key, value])
      if (!initialised) return fail('301')
      if (key.startsWith('cmi.interactions') && !interactions)
        return fail('401')
      if (refuse[key]) return fail(refuse[key])
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
      return ok()
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
  const win = {
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    fire: (type, event = {}) =>
      (listeners[type] ?? []).forEach((fn) => fn(event)),
    listeners,
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

  // Runs the bridge in its own context with `win` as its window, as a page's script runs.
  const load = (win, { manual = false } = {}) => {
    vm.runInNewContext(source(manual), { window: win })
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
    expect(Object.keys(win.listeners).sort()).toEqual(['pagehide'])
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
