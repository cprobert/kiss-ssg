import { describe, it, expect, afterEach } from 'vitest'
import { activate, decodeRun, isBuildFailure } from '../../lib/run-preload.js'
import { runState } from '../../lib/run-state.js'

const KEY = Symbol.for('kiss-ssg.run')
const url = (request) =>
  `file:///C:/x/lib/run-preload.js?run=${encodeURIComponent(JSON.stringify(request))}`

let listenersBefore = process.listeners('uncaughtException')

afterEach(() => {
  for (const listener of process.listeners('uncaughtException'))
    if (!listenersBefore.includes(listener))
      process.removeListener('uncaughtException', listener)
  delete globalThis[KEY]
})

describe('decodeRun', () => {
  it('reads the request, spaces and non-ASCII included', () => {
    const request = { mode: 'build', report: 'C:/a b/é.jsonl', owner: 12 }
    expect(decodeRun(url(request))).toEqual(request)
  })

  it('answers null for no query, bad JSON or a non-object', () => {
    expect(decodeRun('file:///x/run-preload.js')).toBeNull()
    expect(decodeRun('file:///x/run-preload.js?run=%7Bnope')).toBeNull()
    expect(decodeRun('file:///x/run-preload.js?run=3')).toBeNull()
  })
})

describe('isBuildFailure', () => {
  it('recognises the engine mark, from any copy', () => {
    const err = new Error('x')
    err[Symbol.for('kiss-ssg.buildFailure')] = true
    expect(isBuildFailure(err)).toBe(true)
    expect(isBuildFailure(new Error('x'))).toBe(false)
    expect(isBuildFailure(undefined)).toBe(false)
  })
})

describe('activate', () => {
  it('stores the request and arms one listener in the direct child', () => {
    const request = { mode: 'build', owner: 99 }
    listenersBefore = process.listeners('uncaughtException')
    expect(activate(url(request), { ppid: 99, main: true })).toBe(true)
    expect(runState().request).toEqual(request)
    expect(activate(url(request), { ppid: 99, main: true })).toBe(true)
    expect(
      process
        .listeners('uncaughtException')
        .filter((l) => !listenersBefore.includes(l)),
    ).toHaveLength(1)
  })

  it('does nothing when the process is not the command’s direct child', () => {
    listenersBefore = process.listeners('uncaughtException')
    expect(activate(url({ mode: 'build', owner: 99 }), { ppid: 5 })).toBe(false)
    expect(runState().request).toBeNull()
    expect(process.listeners('uncaughtException')).toEqual(listenersBefore)
  })

  it('does nothing off the main thread', () => {
    expect(
      activate(url({ mode: 'build', owner: 99 }), { ppid: 99, main: false }),
    ).toBe(false)
    expect(runState().request).toBeNull()
  })

  it('does nothing when the URL carries no request', () => {
    expect(activate('file:///x/run-preload.js', { ppid: 99, main: true })).toBe(
      false,
    )
  })
})
