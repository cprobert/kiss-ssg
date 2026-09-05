import { describe, it, expect } from 'vitest'
import {
  resolveConfig,
  resolveFolders,
  foldersToEnsure,
  DEFAULT_FOLDERS,
} from '../../lib/config.js'

describe('resolveFolders', () => {
  it('returns the defaults when nothing is given', () => {
    expect(resolveFolders()).toEqual(DEFAULT_FOLDERS)
  })

  it('re-derives every subfolder from src, unless explicitly set', () => {
    const f = resolveFolders({ src: './site', build: 'out', models: null })
    expect(f.pages).toBe('./site/pages')
    expect(f.partials).toBe('./site/partials')
    expect(f.build).toBe('out')
    expect(f.models).toBeNull()
  })
})

describe('resolveConfig', () => {
  it('applies defaults and merges sass options', () => {
    const c = resolveConfig({ verbose: true, sass: { includePaths: ['x'] } })
    expect(c.dev).toBe(false)
    expect(c.cleanBuild).toBe(true)
    expect(c.port).toBe(3001)
    expect(c.verbose).toBe(true)
    expect(c.sass.includePaths).toEqual(['x'])
    expect(c.folders.pages).toBe('./src/pages')
  })
})

describe('foldersToEnsure', () => {
  it('lists every non-null folder that Kiss must create, regardless of assets', () => {
    const list = foldersToEnsure(resolveFolders({ src: 's', assets: null }))
    expect(list).toContain('s/layouts')
    expect(list).toContain('s/partials')
    expect(list).toContain('s/models')
    expect(list).toContain('s/controllers')
    expect(list).not.toContain(null)
  })
})
