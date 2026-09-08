import { describe, it, expect } from 'vitest'
import { DependencyGraph } from '../../lib/dependency-graph.js'

describe('DependencyGraph', () => {
  it('answers null for a partial it has never seen', () => {
    const g = new DependencyGraph()
    expect(g.dependentsOf('nav')).toBeNull()
    expect(g.usesOf('a.html')).toEqual([])
    expect(g.size).toBe(0)
  })

  it('records an edge in both directions, once', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.record('a.html', 'nav')
    g.record('b.html', 'nav')
    g.record('a.html', 'footer')
    expect(g.dependentsOf('nav')).toEqual(['a.html', 'b.html'])
    expect(g.usesOf('a.html')).toEqual(['footer', 'nav'])
    expect(g.size).toBe(2)
  })

  it('clearPage drops that page from every partial but keeps the partials known', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.record('b.html', 'nav')
    g.clearPage('a.html')
    expect(g.dependentsOf('nav')).toEqual(['b.html'])
    expect(g.usesOf('a.html')).toEqual([])
    g.clearPage('b.html')
    // Known with no dependents is not the same as unknown: an edit to it
    // re-renders nothing, rather than everything.
    expect(g.dependentsOf('nav')).toEqual([])
  })

  it('clear forgets everything', () => {
    const g = new DependencyGraph()
    g.record('a.html', 'nav')
    g.clear()
    expect(g.dependentsOf('nav')).toBeNull()
    expect(g.size).toBe(0)
  })

  it('serialises sorted, partial to pages', () => {
    const g = new DependencyGraph()
    g.record('b.html', 'nav')
    g.record('a.html', 'nav')
    g.record('a.html', 'footer')
    expect(g.toJSON()).toEqual({
      footer: ['a.html'],
      nav: ['a.html', 'b.html'],
    })
    expect(JSON.stringify(g)).toBe(
      '{"footer":["a.html"],"nav":["a.html","b.html"]}',
    )
  })
})
