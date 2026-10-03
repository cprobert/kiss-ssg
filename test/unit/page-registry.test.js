import { describe, it, expect, vi } from 'vitest'
import {
  defaultIdForView,
  explicitIdOf,
  idIndexFor,
  lookupPage,
  stackForRecord,
} from '../../lib/page-registry.js'

// The identity state these functions read on a Kiss instance. `_idIndexFor`
// is wired the way Kiss wires it, so `lookupPage` and `stackForRecord` reach
// the index through the instance.
const instance = (stack) => {
  const kiss = {
    _stack: stack,
    _idIndex: null,
    _idNoticed: new Set(),
    logger: { notice: vi.fn() },
  }
  kiss._idIndexFor = () => idIndexFor(kiss)
  return kiss
}
const entry = (view, id, explicit = false) => ({ view, id, explicit })

describe('defaultIdForView', () => {
  it("is a .hbs view's route without its extension", () => {
    expect(defaultIdForView('courses/index.hbs')).toBe('courses/index')
    expect(defaultIdForView('/about.hbs')).toBe('about')
    expect(defaultIdForView('blog\\post.hbs')).toBe('blog/post')
  })

  it('is null for an inline template or anything that is not a string', () => {
    expect(defaultIdForView('<h1>{{title}}</h1>')).toBe(null)
    expect(defaultIdForView(undefined)).toBe(null)
    expect(defaultIdForView('.hbs')).toBe(null)
  })
})

describe('explicitIdOf', () => {
  it('counts only a non-empty string', () => {
    expect(explicitIdOf({ id: 'home' })).toBe('home')
    expect(explicitIdOf({ id: 42 })).toBe(null)
    expect(explicitIdOf({ id: '  ' })).toBe(null)
    expect(explicitIdOf(undefined)).toBe(null)
  })
})

describe('idIndexFor', () => {
  it('maps each id to its entry and memoises the index on the instance', () => {
    const home = entry('index.hbs', 'index')
    const kiss = instance([home])
    const index = idIndexFor(kiss)
    expect(index.byId.get('index')).toBe(home)
    expect(kiss._idIndex).toBe(index)
    expect(idIndexFor(kiss)).toBe(index)
  })

  it('withdraws a default id two pages share, and says so once', () => {
    const kiss = instance([entry('a.hbs', 'post'), entry('b.hbs', 'post')])
    const { byId, withdrawn } = idIndexFor(kiss)
    expect(byId.has('post')).toBe(false)
    expect(withdrawn.get('post')).toEqual(['a.hbs', 'b.hbs'])
    kiss._idIndex = null
    idIndexFor(kiss)
    expect(kiss.logger.notice).toHaveBeenCalledTimes(1)
  })

  it('lets an explicit id beat a default one', () => {
    const named = entry('landing.hbs', 'home', true)
    const kiss = instance([entry('home.hbs', 'home'), named])
    const { byId, withdrawn } = idIndexFor(kiss)
    expect(byId.get('home')).toBe(named)
    expect(withdrawn.get('home')).toEqual(['landing.hbs', 'home.hbs'])
  })
})

describe('lookupPage', () => {
  it('finds an entry, reports a withdrawn id, and is null for anything else', () => {
    const about = entry('about.hbs', 'about')
    const kiss = instance([
      about,
      entry('a.hbs', 'post'),
      entry('b.hbs', 'post'),
    ])
    expect(lookupPage(kiss, 'about')).toEqual({ entry: about })
    expect(lookupPage(kiss, 'post')).toEqual({
      withdrawn: true,
      views: ['a.hbs', 'b.hbs'],
    })
    expect(lookupPage(kiss, 'nowhere')).toBe(null)
    expect(lookupPage(kiss, '')).toBe(null)
  })
})

describe('stackForRecord', () => {
  it('is the stack itself when nothing is withdrawn', () => {
    const stack = [entry('about.hbs', 'about')]
    expect(stackForRecord(instance(stack))).toBe(stack)
  })

  it('nulls a withdrawn default id and leaves the explicit owner alone', () => {
    const named = entry('landing.hbs', 'home', true)
    const kiss = instance([entry('home.hbs', 'home'), named])
    const record = stackForRecord(kiss)
    expect(record.map((e) => e.id)).toEqual([null, 'home'])
    expect(record[1]).toBe(named)
    expect(kiss._stack[0].id).toBe('home')
  })
})
