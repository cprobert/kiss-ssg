import { describe, it, expect } from 'vitest'
import {
  contentHash,
  createAssetManifest,
  hashedName,
  isHashable,
  HASH_LENGTH,
} from '../../lib/asset-manifest.js'

describe('contentHash', () => {
  it('is a short hex digest of the bytes it is given', () => {
    const hash = contentHash(Buffer.from('body { color: red }'))
    expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HASH_LENGTH}}$`))
  })

  it('changes when the content changes and not otherwise', () => {
    const a = contentHash(Buffer.from('a'))
    expect(contentHash(Buffer.from('a'))).toBe(a)
    expect(contentHash(Buffer.from('b'))).not.toBe(a)
  })

  it('hashes a string and its bytes to the same value', () => {
    expect(contentHash('a')).toBe(contentHash(Buffer.from('a')))
  })
})

describe('hashedName', () => {
  it('puts the hash before the extension', () => {
    expect(hashedName('css/site.css', 'a1b2c3d4')).toBe('css/site.a1b2c3d4.css')
  })

  it('keeps the last extension only, not an earlier dot', () => {
    expect(hashedName('js/site.min.js', 'a1b2c3d4')).toBe(
      'js/site.min.a1b2c3d4.js',
    )
  })

  it('appends the hash when there is no extension', () => {
    expect(hashedName('css/site', 'a1b2c3d4')).toBe('css/site.a1b2c3d4')
  })

  it('does not mistake a folder dot for the file extension', () => {
    expect(hashedName('css.v2/site', 'a1b2c3d4')).toBe('css.v2/site.a1b2c3d4')
  })
})

describe('isHashable', () => {
  it('renames a stylesheet and a script', () => {
    expect(isHashable('css/site.css')).toBe(true)
    expect(isHashable('js/app.JS')).toBe(true)
  })

  it('leaves everything a template does not link by name alone', () => {
    // robots.txt is asked for by a fixed name, and an image is linked from
    // inside a stylesheet kiss does not rewrite.
    expect(isHashable('robots.txt')).toBe(false)
    expect(isHashable('img/logo.png')).toBe(false)
    expect(isHashable('fonts/x.woff2')).toBe(false)
  })
})

describe('createAssetManifest', () => {
  it('looks up what was recorded, and null for anything else', () => {
    const manifest = createAssetManifest()
    manifest.record('css/site.css', 'css/site.a1b2c3d4.css')
    expect(manifest.lookup('css/site.css')).toBe('css/site.a1b2c3d4.css')
    expect(manifest.lookup('css/other.css')).toBeNull()
  })

  it('reports the name it replaced, so the caller can delete it', () => {
    const manifest = createAssetManifest()
    expect(manifest.record('css/site.css', 'css/site.aaaaaaaa.css')).toBeNull()
    expect(manifest.record('css/site.css', 'css/site.bbbbbbbb.css')).toBe(
      'css/site.aaaaaaaa.css',
    )
  })

  it('reports nothing stale when the name has not changed', () => {
    const manifest = createAssetManifest()
    manifest.record('css/site.css', 'css/site.aaaaaaaa.css')
    expect(manifest.record('css/site.css', 'css/site.aaaaaaaa.css')).toBeNull()
  })

  it('is per instance — two manifests never see each other', () => {
    const a = createAssetManifest()
    const b = createAssetManifest()
    a.record('css/site.css', 'css/site.aaaaaaaa.css')
    expect(b.lookup('css/site.css')).toBeNull()
  })
})
