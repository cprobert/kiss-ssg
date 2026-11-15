import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  closed,
  currentRun,
  register,
  runState,
  settled,
  unsettledMessage,
} from '../../lib/run-state.js'

const KEY = Symbol.for('kiss-ssg.run')

const fake = (over = {}) => ({
  config: { dev: false, folders: { build: './public' } },
  logger: { error: () => {} },
  close: async () => {},
  ...over,
})

let listenersBefore
let exitCodeBefore

beforeEach(() => {
  delete globalThis[KEY]
  listenersBefore = process.listeners('beforeExit')
  exitCodeBefore = process.exitCode
})

afterEach(() => {
  for (const listener of process.listeners('beforeExit'))
    if (!listenersBefore.includes(listener))
      process.removeListener('beforeExit', listener)
  process.exitCode = exitCodeBefore
  delete globalThis[KEY]
})

const added = () =>
  process.listeners('beforeExit').filter((l) => !listenersBefore.includes(l))

describe('currentRun', () => {
  it('returns the request when one is stored', () => {
    runState().request = { mode: 'dev', owner: 7 }
    expect(currentRun({})).toEqual({ mode: 'dev', owner: 7 })
  })

  it('builds the same shape from the aliases when there is no request', () => {
    expect(
      currentRun({
        KISS_CHECK: '1',
        KISS_AIKB: '1',
        KISS_REPORT: '/tmp/r.jsonl',
        KISS_IMAGES: '/tmp/i.jsonl',
        KISS_IMAGES_REFRESH: '1',
      }),
    ).toEqual({
      mode: 'check',
      aikb: true,
      report: '/tmp/r.jsonl',
      images: '/tmp/i.jsonl',
      imagesRefresh: true,
      owner: null,
    })
  })

  it('says mode null when neither a request nor an alias names one', () => {
    expect(currentRun({}).mode).toBeNull()
    expect(currentRun({ KISS_CHECK: '0' }).mode).toBeNull()
    expect(currentRun({ KISS_CHECK: 'false' }).mode).toBeNull()
  })

  it('reads an unlisted KISS_CHECK value as on', () => {
    expect(currentRun({ KISS_CHECK: 'true' }).mode).toBe('check')
  })

  it('lets the request win when the aliases are set too', () => {
    runState().request = { mode: 'build', report: '/a', owner: 1 }
    const run = currentRun({ KISS_CHECK: '1', KISS_REPORT: '/b' })
    expect(run.mode).toBe('build')
    expect(run.report).toBe('/a')
  })
})

describe('runState', () => {
  it('is one object, kept at a global symbol', () => {
    expect(runState()).toBe(runState())
    expect(globalThis[KEY]).toBe(runState())
    expect(runState().v).toBe(1)
  })

  it('throws, naming both versions, on a shape it does not know', () => {
    globalThis[KEY] = { v: 2 }
    expect(() => runState()).toThrow(/version 1.*version 2/)
  })
})

describe('register, settled and closed', () => {
  it('never counts a dev instance as unsettled', () => {
    const dev = fake({ config: { dev: true, folders: { build: './public' } } })
    register(dev)
    expect(runState().live.has(dev)).toBe(true)
    expect(runState().unsettled.has(dev)).toBe(false)
    expect(added()).toHaveLength(0)
  })

  it('settled removes from unsettled and keeps the instance live', () => {
    const one = fake()
    register(one)
    expect(runState().unsettled.has(one)).toBe(true)
    settled(one)
    expect(runState().unsettled.has(one)).toBe(false)
    expect(runState().live.has(one)).toBe(true)
  })

  it('closed removes from both sets', () => {
    const one = fake()
    register(one)
    closed(one)
    expect(runState().unsettled.has(one)).toBe(false)
    expect(runState().live.has(one)).toBe(false)
  })

  it('arms the beforeExit listener once for two instances', () => {
    register(fake())
    register(fake())
    expect(added()).toHaveLength(1)
    expect(runState().armed.beforeExit).toBe(true)
  })

  it('the listener takes each instance out first, says so, fails the run and closes', async () => {
    const order = []
    const one = fake({
      _failures: [{}],
      logger: { error: (message) => order.push(['log', message]) },
      close: async () => {
        order.push(['close', runState().unsettled.has(one)])
      },
    })
    register(one)
    process.exitCode = 0
    await added()[0]()
    expect(order[0][0]).toBe('log')
    expect(order[0][1]).toContain('built without complete()')
    expect(order[1]).toEqual(['close', false])
    expect(process.exitCode).toBe(1)
  })

  it('the listener leaves a settled instance alone', async () => {
    const one = fake({
      close: async () => {
        throw new Error('closed a settled build')
      },
    })
    register(one)
    settled(one)
    process.exitCode = 0
    await added()[0]()
    expect(process.exitCode).toBe(0)
  })
})

describe('unsettledMessage', () => {
  it('names the folder and counts the failures that went unreported', () => {
    const text = unsettledMessage(fake({ _failures: [{}, {}] }))
    expect(text).toContain('./public was built without complete()')
    expect(text).toContain('2 page failures went unreported')
    expect(text).toContain('Add `await kiss.complete()`')
  })

  it('says nothing of failures when there were none', () => {
    expect(unsettledMessage(fake({ _failures: [] }))).not.toContain(
      'unreported',
    )
  })
})
