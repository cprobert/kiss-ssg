import { describe, it, expect, vi } from 'vitest'
import { OutputRegistry } from '../../lib/output-registry.js'

describe('output ownership', () => {
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
