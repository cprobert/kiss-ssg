import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveConfig,
  resolveFolders,
  foldersToEnsure,
  DEFAULT_FOLDERS,
  DEFAULT_AUDIT,
  DEFAULT_MARKDOWN_COPIES,
  resolveMarkdownCopies,
} from '../../lib/config.js'
import { CHECKS } from '../../lib/audit.js'

it('names a working-directory inspection failure without blaming folders.src', () => {
  const realpath = vi
    .spyOn(fs.realpathSync, 'native')
    .mockImplementationOnce(() => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    })
  try {
    expect(() => resolveConfig({ folders: { src: null } })).toThrow(
      /Cannot safely resolve working directory/,
    )
  } finally {
    realpath.mockRestore()
  }
})

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

  it('strips trailing slashes from every folder, derived or explicit', () => {
    const f = resolveFolders({ src: './site/', assets: './src/assets/' })
    expect(f.src).toBe('./site')
    expect(f.pages).toBe('./site/pages')
    expect(f.partials).toBe('./site/partials')
    expect(f.assets).toBe('./src/assets')
  })

  it('normalises separators and collapses repeated slashes', () => {
    const f = resolveFolders({ src: '.\\site\\', build: 'out//dist/' })
    expect(f.src).toBe('./site')
    expect(f.models).toBe('./site/models')
    expect(f.build).toBe('out/dist')
  })

  it('preserves the UNC share prefix when normalising Windows folders', () => {
    expect(resolveFolders({ src: '\\\\server\\share\\site\\' }).src).toBe(
      '//server/share/site',
    )
  })

  it('keeps a folder usable when it is only a slash', () => {
    expect(resolveFolders({ build: '/' }).build).toBe('/')
    expect(resolveFolders({ build: './' }).build).toBe('./')
  })

  it('has no root key — it was documented but never read', () => {
    expect(resolveFolders()).not.toHaveProperty('root')
  })

  it('has no static key — it was documented but never read', () => {
    expect(resolveFolders()).not.toHaveProperty('static')
    expect(resolveFolders({ src: './site' })).not.toHaveProperty('static')
  })
})

describe('resolveConfig', () => {
  it('applies defaults and merges sass options', () => {
    const c = resolveConfig({ verbose: true, sass: { includePaths: ['x'] } })
    expect(c.dev).toBe(false)
    expect(c.cleanBuild).toBe(true)
    expect(c.port).toBe(3001)
    expect(c.livereloadPort).toBe(35729)
    expect(c.devHost).toBe('127.0.0.1')
    expect(c.verbose).toBe(true)
    expect(c.sass.includePaths).toEqual(['x'])
    expect(c.folders.pages).toBe('./src/pages')
  })

  it('defaults the fetch block for url models', () => {
    const c = resolveConfig({})
    expect(c.fetch).toEqual({
      headers: {},
      timeout: 10000,
      retries: 0,
      cache: false,
    })
  })

  it('merges the fetch block one level deep, like sass', () => {
    const c = resolveConfig({ fetch: { timeout: 1 } })
    expect(c.fetch).toEqual({
      headers: {},
      timeout: 1,
      retries: 0,
      cache: false,
    })
  })

  it('defaults the assets block: no cache busting, no pipeline', () => {
    expect(resolveConfig({}).assets).toEqual({
      hash: false,
      version: null,
      pipeline: [],
    })
  })

  it('merges the assets block one level deep, like sass', () => {
    expect(resolveConfig({ assets: { version: '1.2.3' } }).assets).toEqual({
      hash: false,
      version: '1.2.3',
      pipeline: [],
    })
    expect(resolveConfig({ assets: { hash: true } }).assets).toEqual({
      hash: true,
      version: null,
      pipeline: [],
    })
  })

  it('defaults the links block: the broken-link scan is on', () => {
    // The scan is advisory — it never changes `ok` or the exit code — so it is
    // on by default and a site opts *out*.
    expect(resolveConfig({}).links).toEqual({
      check: true,
      canonical: false,
      trailingSlash: true,
      hostServed: [],
    })
  })

  it('merges the links block one level deep, like sass', () => {
    expect(resolveConfig({ links: { check: false } }).links).toEqual({
      check: false,
      canonical: false,
      trailingSlash: true,
      hostServed: [],
    })
  })

  it('defaults links.canonical off, so a bare {{link}} keeps its extension', () => {
    // Turning it on changes the URL every bare `{{link}}` emits — a site's
    // whole internal link graph — which is a major-version decision.
    expect(resolveConfig({}).links.canonical).toBe(false)
    expect(resolveConfig({ links: { canonical: true } }).links).toEqual({
      check: true,
      canonical: true,
      trailingSlash: true,
      hostServed: [],
    })
  })

  it('defaults links.trailingSlash on: a directory index keeps its slash', () => {
    // Netlify serves `/courses/` and 301s the bare `/courses` (measured on
    // a1k9training.co.uk, 2026-09-16), and every `<loc>` in that site's live
    // sitemap returns 200 under this default. Moving it would turn six of
    // them into redirects, so it does not move.
    expect(resolveConfig({}).links.trailingSlash).toBe(true)
    expect(resolveConfig({ links: { trailingSlash: false } }).links).toEqual({
      check: true,
      canonical: false,
      trailingSlash: false,
      hostServed: [],
    })
  })

  it('defaults links.hostServed empty, and keeps the patterns a site gives it', () => {
    // Paths the host serves that the build never writes — a function rewrite,
    // a post-build bundle. Empty by default: kiss does not guess a host.
    expect(resolveConfig({}).links.hostServed).toEqual([])
    expect(
      resolveConfig({ links: { hostServed: ['/v1/**', '/llms.txt'] } }).links
        .hostServed,
    ).toEqual(['/v1/**', '/llms.txt'])
  })

  it('refuses a links.hostServed that is not a list of root-relative paths', () => {
    expect(() => resolveConfig({ links: { hostServed: '/v1/**' } })).toThrow(
      /config\.links\.hostServed must be an array/,
    )
    expect(() => resolveConfig({ links: { hostServed: ['v1/**'] } })).toThrow(
      /"v1\/\*\*" must start with "\/"/,
    )
  })

  it('defaults the redirects block to no host format at all', () => {
    // The IR is the baseline and a host encoding is opt-in: kiss does not
    // guess where a site is deployed. A build with aliases and no format
    // says so once, in a notice, because v2.3 always wrote `_redirects`.
    expect(resolveConfig({}).redirects).toEqual({ format: null })
  })

  it('takes a list of formats, so a site can deploy to two hosts', () => {
    expect(
      resolveConfig({ redirects: { format: ['netlify', 'firebase'] } })
        .redirects.format,
    ).toEqual(['netlify', 'firebase'])
  })

  it('refuses a typo inside a list rather than quietly dropping it', () => {
    expect(() =>
      resolveConfig({ redirects: { format: ['netlify', 'firbase'] } }),
    ).toThrow(/"firbase"/)
  })

  it('merges the redirects block one level deep and keeps unknown keys', () => {
    expect(resolveConfig({ redirects: { format: 'none' } }).redirects).toEqual({
      format: 'none',
    })
    expect(
      resolveConfig({ redirects: { format: undefined } }).redirects.format,
    ).toBe(null)
    expect(resolveConfig({ redirects: { statusCode: 308 } }).redirects).toEqual(
      { format: null, statusCode: 308 },
    )
  })

  it('accepts every built-in redirect format, and a writer function', () => {
    for (const format of ['netlify', 'firebase', 'vercel', 'htaccess', 'none'])
      expect(resolveConfig({ redirects: { format } }).redirects.format).toBe(
        format,
      )
    const writer = () => []
    expect(
      resolveConfig({ redirects: { format: writer } }).redirects.format,
    ).toBe(writer)
  })

  it('refuses an unknown redirect format rather than writing nothing', () => {
    // The whole point of the block: a misspelled format that silently wrote no
    // host file would leave every old URL 404ing while the report said the
    // redirects were written — the exact silent failure this key exists to end.
    expect(() => resolveConfig({ redirects: { format: 'firbase' } })).toThrow(
      /config\.redirects\.format must be one of/,
    )
    expect(() => resolveConfig({ redirects: { format: 'firbase' } })).toThrow(
      /"firbase"/,
    )
    // `null` is legal: it is the default and means "no host format".
    expect(() => resolveConfig({ redirects: { format: null } })).not.toThrow()
  })

  it('defaults the audit block: on, nothing ignored', () => {
    expect(resolveConfig({}).audit).toEqual({ check: true, ignore: [] })
    expect(DEFAULT_AUDIT).toEqual({ check: true, ignore: [] })
    expect(Object.isFrozen(DEFAULT_AUDIT)).toBe(true)
  })

  it('merges the audit block one level deep, like links', () => {
    expect(
      resolveConfig({ audit: { ignore: ['og-image-missing'] } }).audit,
    ).toEqual({ check: true, ignore: ['og-image-missing'] })
    expect(resolveConfig({ audit: { check: false } }).audit).toEqual({
      check: false,
      ignore: [],
    })
    expect(resolveConfig({ audit: { check: undefined } }).audit).toEqual({
      check: true,
      ignore: [],
    })
  })

  it('reads audit: false as the whole audit off, and true as the defaults', () => {
    expect(resolveConfig({ audit: false }).audit).toEqual({
      check: false,
      ignore: [],
    })
    expect(resolveConfig({ audit: true }).audit).toEqual({
      check: true,
      ignore: [],
    })
  })

  it('refuses an audit that is neither a boolean nor a plain object', () => {
    for (const audit of ['off', 0, null, ['title-missing']])
      expect(() => resolveConfig({ audit })).toThrow(
        /config\.audit must be true, false or an object/,
      )
  })

  it('refuses an ignore list that is not an array', () => {
    expect(() =>
      resolveConfig({ audit: { ignore: 'og-image-missing' } }),
    ).toThrow(/config\.audit\.ignore must be an array/)
  })

  it('refuses an unknown check id, naming it and every valid one', () => {
    // The same stance as `redirects.format`: a misspelled id that silently
    // ignored nothing would leave the finding on every build while the author
    // believed it turned off.
    const attempt = () =>
      resolveConfig({ audit: { ignore: ['og-image-mising'] } })
    expect(attempt).toThrow(/"og-image-mising"/)
    for (const check of CHECKS) expect(attempt).toThrow(check)
  })

  it('carries an unknown links key through, like the other blocks', () => {
    // A one-level-merged block rather than a bare boolean is what made the
    // second knob (`hostServed`) an addition rather than a breaking rename, and
    // what keeps the next one an addition too.
    expect(resolveConfig({ links: { future: true } }).links).toEqual({
      check: true,
      canonical: false,
      trailingSlash: true,
      hostServed: [],
      future: true,
    })
    expect(resolveConfig({ links: { check: undefined } }).links).toEqual({
      check: true,
      canonical: false,
      trailingSlash: true,
      hostServed: [],
    })
  })

  it('defaults the markdown block: html on, xhtml output, no hard breaks', () => {
    // `breaks: false` is the published v1 value, restored: a hard-wrapped `.md`
    // partial is one paragraph, not one `<br />` per source line.
    expect(resolveConfig({}).markdown).toEqual({
      html: true,
      xhtmlOut: true,
      breaks: false,
    })
  })

  it('merges the markdown block one level deep, like sass', () => {
    expect(resolveConfig({ markdown: { breaks: true } }).markdown).toEqual({
      html: true,
      xhtmlOut: true,
      breaks: true,
    })
    expect(resolveConfig({ markdown: { html: false } }).markdown).toEqual({
      html: false,
      xhtmlOut: true,
      breaks: false,
    })
  })

  it('carries an arbitrary remarkable option through untouched', () => {
    // The block is passed to Remarkable as-is, so an option kiss has no opinion
    // about (typographer, langPrefix) reaches it without kiss knowing the name.
    expect(resolveConfig({ markdown: { typographer: true } }).markdown).toEqual(
      {
        html: true,
        xhtmlOut: true,
        breaks: false,
        typographer: true,
      },
    )
  })

  it('takes the defaults for an undefined markdown key, and for no block', () => {
    expect(resolveConfig({ markdown: undefined }).markdown).toEqual(
      resolveConfig({}).markdown,
    )
    expect(resolveConfig({ markdown: { breaks: undefined } }).markdown).toEqual(
      resolveConfig({}).markdown,
    )
  })

  it('takes the pipeline as given — an array value replaces the default', () => {
    const pipeline = [{ run: 'npx tailwindcss -i a.css -o b.css' }]
    expect(resolveConfig({ assets: { pipeline } }).assets).toEqual({
      hash: false,
      version: null,
      pipeline,
    })
  })

  it('refuses a pipeline that is not an array of steps with a command', () => {
    // The same rule as cleanBuild: a shape that cannot be run is refused where
    // it is written, not discovered as a spawn of `undefined` mid-build.
    expect(() =>
      resolveConfig({ assets: { pipeline: 'npx tailwindcss' } }),
    ).toThrow(/config\.assets\.pipeline must be an array of steps/)
    expect(() =>
      resolveConfig({ assets: { pipeline: ['npx tailwindcss'] } }),
    ).toThrow(
      /config\.assets\.pipeline\[0\] must be an object with a string `run`/,
    )
    expect(() =>
      resolveConfig({ assets: { pipeline: [{ run: '  ' }] } }),
    ).toThrow(/config\.assets\.pipeline\[0\]\.run must be a non-empty string/)
    expect(() =>
      resolveConfig({ assets: { pipeline: [{ run: 'a', cwd: 3 }] } }),
    ).toThrow(/config\.assets\.pipeline\[0\]\.cwd must be a string/)
  })

  it('takes the default for a key passed explicitly as undefined', () => {
    expect(resolveConfig({ port: undefined }).port).toBe(3001)
    expect(resolveConfig({ cleanBuild: undefined }).cleanBuild).toBe(true)
    expect(
      resolveConfig({ sass: { includePaths: undefined } }).sass.includePaths,
    ).toEqual([])
    expect(resolveConfig({ fetch: { timeout: undefined } }).fetch.timeout).toBe(
      10000,
    )
    expect(resolveConfig({ assets: { hash: undefined } }).assets.hash).toBe(
      false,
    )
  })

  it('takes the default for a folder passed explicitly as undefined', () => {
    expect(
      resolveConfig({ folders: { assets: undefined } }).folders.assets,
    ).toBe('./src/assets')
  })

  it('keeps null as a value — it switches a folder off', () => {
    expect(
      resolveConfig({ folders: { assets: null } }).folders.assets,
    ).toBeNull()
  })

  it("accepts true, false and 'atomic' for cleanBuild, and nothing else", () => {
    expect(resolveConfig({ cleanBuild: true }).cleanBuild).toBe(true)
    expect(resolveConfig({ cleanBuild: false }).cleanBuild).toBe(false)
    expect(resolveConfig({ cleanBuild: 'atomic' }).cleanBuild).toBe('atomic')
    expect(() => resolveConfig({ cleanBuild: 'yes' })).toThrow(/cleanBuild/)
    expect(() => resolveConfig({ cleanBuild: 1 })).toThrow(/cleanBuild/)
    expect(() => resolveConfig({ cleanBuild: null })).toThrow(/cleanBuild/)
  })

  it('resolves no root folder', () => {
    expect(resolveConfig({}).folders).not.toHaveProperty('root')
  })

  it('resolves no static folder', () => {
    expect(resolveConfig({}).folders).not.toHaveProperty('static')
  })
})

describe('markdownCopies', () => {
  it('is on by default, converting <main>', () => {
    expect(DEFAULT_MARKDOWN_COPIES).toEqual({ write: true, selector: 'main' })
    expect(Object.isFrozen(DEFAULT_MARKDOWN_COPIES)).toBe(true)
    expect(resolveConfig({}).markdownCopies).toEqual({
      write: true,
      selector: 'main',
    })
  })

  it('reads false as off and true as the defaults, like audit', () => {
    expect(resolveConfig({ markdownCopies: false }).markdownCopies).toEqual({
      write: false,
      selector: 'main',
    })
    expect(resolveConfig({ markdownCopies: true }).markdownCopies).toEqual({
      write: true,
      selector: 'main',
    })
  })

  it('merges an object one level deep', () => {
    expect(
      resolveConfig({ markdownCopies: { selector: 'article' } }).markdownCopies,
    ).toEqual({ write: true, selector: 'article' })
    expect(
      resolveConfig({ markdownCopies: { write: undefined } }).markdownCopies,
    ).toEqual({ write: true, selector: 'main' })
  })

  it('refuses anything else, naming the value', () => {
    for (const markdownCopies of ['off', 0, null, ['main']])
      expect(() => resolveConfig({ markdownCopies })).toThrow(
        /config\.markdownCopies must be true, false or an object/,
      )
    expect(() => resolveConfig({ markdownCopies: { selector: '' } })).toThrow(
      /config\.markdownCopies\.selector must be a non-empty string/,
    )
    expect(() => resolveConfig({ markdownCopies: { write: 'yes' } })).toThrow(
      /config\.markdownCopies\.write must be a boolean/,
    )
  })

  it('resolves an already-resolved block to itself, for a page override', () => {
    // A page's `config` is the site's resolved config with the page's own keys
    // merged over it, so the page registry resolves whichever it finds.
    const resolved = resolveConfig({}).markdownCopies
    expect(resolveMarkdownCopies(resolved)).toEqual(resolved)
    expect(resolveMarkdownCopies(false)).toEqual({
      write: false,
      selector: 'main',
    })
  })
})

describe('the build folder may never contain the source folder', () => {
  it('refuses a build folder that is the source folder', () => {
    expect(() =>
      resolveConfig({ folders: { src: './site', build: './site' } }),
    ).toThrow(/build folder/i)
  })

  it('refuses a build folder that is an ancestor of the source folder', () => {
    expect(() => resolveConfig({ folders: { build: '.' } })).toThrow(
      /build folder/i,
    )
    expect(() => resolveConfig({ folders: { build: './' } })).toThrow(
      /build folder/i,
    )
    expect(() => resolveConfig({ folders: { build: '/' } })).toThrow(
      /build folder/i,
    )
    expect(() =>
      resolveConfig({ folders: { src: './site/src', build: './site' } }),
    ).toThrow(/build folder/i)
  })

  it('allows a build folder that merely sits beside the source folder', () => {
    // The metacarpus shape: an archive root the source folder is not under.
    // The guard is a floor, not the fix for a build folder holding published
    // output — that is `cleanBuild: 'atomic'` plus validating the name.
    expect(
      resolveConfig({ folders: { build: './handbooks' } }).folders.build,
    ).toBe('./handbooks')
    expect(
      resolveConfig({ folders: { build: './handbooks/2026-sept' } }).folders
        .build,
    ).toBe('./handbooks/2026-sept')
  })

  it('leaves resolveFolders alone — the guard is a config-level refusal', () => {
    expect(resolveFolders({ build: '/' }).build).toBe('/')
  })
})

describe('source and output boundaries', () => {
  it.each(['.', './', path.resolve('.'), path.resolve('child', '..')])(
    'rejects a source rooted at the working project: %s',
    (src) => {
      expect(() => resolveConfig({ folders: { src } })).toThrow(
        /folders\.src.*project root/i,
      )
    },
  )

  it('rejects a filesystem root as source', () => {
    expect(() =>
      resolveConfig({ folders: { src: path.parse(process.cwd()).root } }),
    ).toThrow(/folders\.src.*root/i)
  })

  it.each(['.', path.parse(process.cwd()).root])(
    'protects a root output even with src disabled: %s',
    (build) => {
      expect(() => resolveConfig({ folders: { src: null, build } })).toThrow(
        /build folder/i,
      )
    },
  )

  it('allows a separate output under src', () => {
    expect(
      resolveConfig({ folders: { build: './src/public' } }).folders.build,
    ).toBe('./src/public')
  })

  it('compares path segments, not shared name prefixes', () => {
    expect(
      resolveConfig({
        folders: { pages: './content', build: './content-output' },
      }).folders.build,
    ).toBe('./content-output')
  })

  it('ignores disabled source folders', () => {
    expect(
      resolveConfig({ folders: { pages: null, build: './src/pages' } }).folders
        .pages,
    ).toBeNull()
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
    expect(list).not.toContain('s/static')
  })

  it('never creates the AIKB folder', () => {
    // `npx kiss-ssg aikb` writes it; a site that has never recorded one must
    // not find an empty AIKB/ beside its source that it did not ask for.
    const list = foldersToEnsure(resolveFolders({}))
    expect(list).not.toContain('./AIKB')
    expect(list).not.toContain(DEFAULT_FOLDERS.aikb)
  })
})

describe('folders.aikb', () => {
  it('defaults to ./AIKB and is not derived from src', () => {
    // It is source written for people, at the root of the repository beside
    // README.md — not another subfolder of the site's own source tree.
    expect(resolveFolders({}).aikb).toBe('./AIKB')
    expect(resolveFolders({ src: 'site' }).aikb).toBe('./AIKB')
  })

  it('is overridable and normalised like every other folder', () => {
    expect(resolveFolders({ aikb: '.\\docs\\AIKB\\' }).aikb).toBe('./docs/AIKB')
    // `null` is a real value: it switches the knowledge base off entirely.
    expect(resolveFolders({ aikb: null }).aikb).toBe(null)
  })
})
