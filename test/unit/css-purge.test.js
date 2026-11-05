import { describe, it, expect } from 'vitest'
import { purgeCss, resolvePurge } from '../../lib/css-purge.js'
import { createAssetManifest } from '../../lib/asset-manifest.js'

describe('resolvePurge', () => {
  it('is null for nothing, null and false', () => {
    expect(resolvePurge(undefined)).toBeNull()
    expect(resolvePurge(null)).toBeNull()
    expect(resolvePurge(false)).toBeNull()
  })

  it('fills in the defaults and drops a leading slash', () => {
    expect(resolvePurge({ files: ['/css/vendor.css'] })).toEqual({
      files: ['css/vendor.css'],
      safelist: [],
      scripts: true,
    })
  })

  it('keeps strings and RegExps in the safelist', () => {
    const safelist = ['show', /^modal/]
    expect(resolvePurge({ files: ['a.css'], safelist }).safelist).toEqual(
      safelist,
    )
  })

  it.each([
    [true, /must be null, false or/],
    [['a.css'], /must be null, false or/],
    [{ files: [] }, /files must be a non-empty list/],
    [{ files: 'a.css' }, /files must be a non-empty list/],
    [{ files: ['a.css'], safelist: [1] }, /safelist must be a list/],
    [{ files: ['a.css'], scripts: 'yes' }, /scripts must be true or false/],
  ])('refuses %j', (input, message) => {
    expect(() => resolvePurge(input)).toThrow(message)
  })
})

describe('purgeCss', () => {
  const css = '.a{color:red}.b{color:blue}.c{color:green}.d .e{margin:0}'

  it('keeps what the HTML uses, and drops the rest', async () => {
    const out = await purgeCss(css, {
      html: ['<p class="a">x</p>'],
      scripts: [],
      safelist: [],
    })
    expect(out).toContain('.a')
    expect(out).not.toContain('.b')
    expect(out).not.toContain('.c')
  })

  it('keeps a class a script names, and one the safelist names', async () => {
    const out = await purgeCss(css, {
      html: ['<p class="a">x</p>'],
      scripts: ['el.classList.add("b")'],
      safelist: [/^c$/],
    })
    expect(out).toContain('.b')
    expect(out).toContain('.c')
  })
})

describe('the asset manifest follows a purged stylesheet (retarget)', () => {
  it('moves the name and every copy that mapped it, and counts a URL change', () => {
    const manifest = createAssetManifest()
    manifest.reconcile('copy', new Map([['css/v.css', 'css/v.aaaaaaaa.css']]))
    const before = manifest.urlRevision
    manifest.retarget('css/v.css', 'css/v.bbbbbbbb.css')
    expect(manifest.lookup('css/v.css')).toBe('css/v.bbbbbbbb.css')
    expect(manifest.previous('copy', 'css/v.css')).toBe('css/v.bbbbbbbb.css')
    expect(manifest.urlRevision).toBe(before + 1)
  })

  it('does nothing for a name it does not hold', () => {
    const manifest = createAssetManifest()
    manifest.retarget('css/none.css', 'css/x.css')
    expect(manifest.lookup('css/none.css')).toBeNull()
  })
})
