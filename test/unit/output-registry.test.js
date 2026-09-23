import { describe, it, expect, vi } from 'vitest'
import { OutputRegistry } from '../../lib/output-registry.js'

describe('output ownership', () => {
  it('keeps restorable asset producers after releasing a page and retires absent assets', () => {
    const outputs = new OutputRegistry({ warn: vi.fn() })
    outputs.claim('public/x.html', 'assets', 'asset')
    outputs.claim('public/x.html', 'page', 'page')
    outputs.release('public/x.html', 'page')
    expect(outputs.assetOwners('public/x.html')).toEqual(['assets'])
    expect(outputs.hasProducer('assets')).toBe(true)
    expect(outputs.hasProducer('page')).toBe(false)
    outputs.retain('assets', new Set())
    expect(outputs.assetOwners('public/x.html')).toEqual([])
    expect(outputs.hasProducer('assets')).toBe(false)
  })

  it('retires page producers without giving asset copies permission to erase their bytes', () => {
    const outputs = new OutputRegistry({ warn: vi.fn() })
    outputs.claim('public/x.html', 'assets', 'asset')
    outputs.claim('public/x.html', 'old page', 'page')
    outputs.beginPages()
    expect(outputs.owner('public/x.html')).toBe('old page')
    expect(outputs.snapshot()).toEqual([])
    expect(outputs.canWriteAsset('public/x.html', 'assets')).toBe(false)
    outputs.claim('public/x.html', 'new page', 'page')
    expect(outputs.snapshot()[0].producers).toEqual([
      { owner: 'assets', kind: 'asset' },
      { owner: 'new page', kind: 'page' },
    ])
    outputs.retain('assets', new Set())
    expect(outputs.snapshot()).toEqual([])
    expect(outputs.owner('public/x.html')).toBe('new page')
  })
  it('reports asset precedence, refusals, recovery and detached snapshots', () => {
    const warn = vi.fn()
    const outputs = new OutputRegistry({ warn })
    outputs.claim('public/x.css', 'first', 'asset')
    outputs.claim('public/x.css', 'second', 'asset')
    expect(warn.mock.calls[0][0]).toContain('later asset copy wins')
    expect(warn.mock.calls[0][0]).not.toContain('Generated output')
    outputs.claim('public/x.css', 'page', 'page')
    expect(outputs.canWriteAsset('public/x.css', 'second')).toBe(false)
    const snapshot = outputs.snapshot()
    expect(snapshot[0].refused).toEqual(['second'])
    expect(snapshot[0].winner).toEqual({ owner: 'page', kind: 'page' })
    outputs.release('public/x.css', 'page')
    outputs.claim('public/x.css', 'second', 'asset')
    expect(outputs.snapshot()[0].refused).toEqual([])
    expect(snapshot[0].winner.owner).toBe('page')
  })

  it('relocates collision paths and clears only discarded live claims', () => {
    const outputs = new OutputRegistry({ warn: vi.fn() })
    outputs.claim('staging/file.txt', 'first', 'asset')
    outputs.claim('staging/file.txt', 'second')
    outputs.claim('staging-sibling/file.txt', 'unrelated')
    outputs.relocate('staging', 'public')
    expect(outputs.snapshot()[0].file).toMatch(/\/public\/file.txt$/)
    outputs.clearUnder('public')
    expect(outputs.owner('public/file.txt')).toBeNull()
    expect(outputs.owner('staging-sibling/file.txt')).toBe('unrelated')
    expect(outputs.snapshot()[0].winner.owner).toBe('second')
  })
  it('moves ownership with an atomic promotion', () => {
    const outputs = new OutputRegistry({ warn: vi.fn() })
    outputs.claim('staging/nested/robots.txt', 'robots')
    outputs.relocate('staging', 'public')
    expect(outputs.owns('public/nested/robots.txt', 'robots')).toBe(true)
    expect(outputs.owner('staging/nested/robots.txt')).toBeNull()
  })
  it('lets a generated writer take ownership and prevents asset overwrite or release', () => {
    const warn = vi.fn()
    const outputs = new OutputRegistry({ warn })
    outputs.claim('./public/robots.txt', 'assets', 'asset')
    outputs.claim('./public/robots.txt', 'robots')
    expect(outputs.canWriteAsset('./public/robots.txt', 'assets')).toBe(false)
    outputs.release('./public/robots.txt', 'assets')
    expect(outputs.owns('./public/robots.txt', 'robots')).toBe(true)
    outputs.release('./public/robots.txt', 'robots')
    expect(outputs.canWriteAsset('./public/robots.txt', 'assets')).toBe(true)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/collision.*robots/)
  })

  it('does not warn on repeated writes by the same producer and keeps instances separate', () => {
    const warn = vi.fn()
    const outputs = new OutputRegistry({ warn })
    outputs.claim('public/page.html', 'page')
    outputs.claim('public/page.html', 'page')
    expect(warn).not.toHaveBeenCalled()
    expect(new OutputRegistry({ warn }).owns('public/page.html', 'page')).toBe(
      false,
    )
  })
})
