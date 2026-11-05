import { describe, it, expect, afterEach, vi } from 'vitest'
import { minifyFile, minifyText, shouldMinify } from '../../lib/asset-minify.js'
import { copyAssets } from '../../lib/assets.js'
import { createAssetManifest } from '../../lib/asset-manifest.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

const JS =
  '/* a comment */\nfunction greet (name) {\n  const message = "Hello, " + name\n  return message\n}\nwindow.greet = greet\n'
const CSS =
  '/* a comment */\n.card {\n  color: #ff0000;\n  margin: 0px 0px 0px 0px;\n}\n'

describe('shouldMinify', () => {
  it('takes .css, .js and .mjs, and never a *.min.* file', () => {
    expect(shouldMinify('css/site.css')).toBe(true)
    expect(shouldMinify('js/app.js')).toBe(true)
    expect(shouldMinify('js/app.mjs')).toBe(true)
    expect(shouldMinify('js/jquery.min.js')).toBe(false)
    expect(shouldMinify('css/bootstrap.min.css')).toBe(false)
    expect(shouldMinify('img/logo.svg')).toBe(false)
    expect(shouldMinify('js/app.js.map')).toBe(false)
  })
})

describe('minifyText', () => {
  it('minifies a classic script, dropping comments and whitespace', async () => {
    const out = await minifyText('js/app.js', JS)
    expect(out.length).toBeLessThan(JS.length)
    expect(out).not.toContain('a comment')
    expect(out).toContain('window.greet')
  })

  it('keeps an ES module a module, in a .mjs or in a .js that only parses as one', async () => {
    const mod = 'import { a } from "./a.js"\nexport const b = await a()\n'
    for (const name of ['js/app.mjs', 'js/app.js']) {
      const out = await minifyText(name, mod)
      // terser may rename the binding (`import{a as o}`); the module syntax
      // is what has to survive.
      expect(out).toMatch(/^import\{a(?: as \w+)?\}from"\.\/a\.js"/)
      expect(out).toMatch(/export/)
      expect(out).toMatch(/await/)
    }
  })

  it('minifies a stylesheet, dropping comments and shortening values', async () => {
    const out = await minifyText('css/site.css', CSS)
    expect(out).toBe('.card{color:red;margin:0}')
  })

  it('throws on a script that does not parse', async () => {
    await expect(minifyText('js/bad.js', 'function (')).rejects.toThrow()
  })
})

describe('minifyFile', () => {
  it('rewrites the file smaller, and reports both sizes', async () => {
    site = await makeSite({ 'app.js': JS })
    const result = await minifyFile(`${site.root}/app.js`, 'app.js')
    expect(result.ok).toBe(true)
    expect(result.after).toBeLessThan(result.before)
    expect(await site.read('app.js')).not.toContain('a comment')
  })

  it('leaves a file it cannot read exactly as it was, and never throws', async () => {
    site = await makeSite({ 'bad.js': 'function (' })
    const result = await minifyFile(`${site.root}/bad.js`, 'bad.js')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^bad\.js: /)
    expect(await site.read('bad.js')).toBe('function (')
  })

  it('keeps the original when minifying would not make it smaller', async () => {
    site = await makeSite({ 'tiny.css': 'a{b:c}' })
    const result = await minifyFile(`${site.root}/tiny.css`, 'tiny.css')
    expect(result.ok).toBe(true)
    expect(await site.read('tiny.css')).toBe('a{b:c}')
  })
})

describe('the asset copy minifies before it hashes (assets.minify)', () => {
  const files = {
    'a/js/app.js': JS,
    'a/js/lib.min.js': '/* keep */ var x = 1 ;',
    'a/css/plain.css': CSS,
    'a/css/site.scss': '$c: red; .s { color: $c; }',
    'a/js/bad.js': 'function (',
  }
  const copy = async (config, logger = silentLogger) => {
    site = await makeSite(files)
    const manifest = createAssetManifest()
    await copyAssets(`${site.root}/a`, `${site.root}/out`, {
      config: { sass: { includePaths: [] }, ...config },
      logger,
      manifest,
    })
    return manifest
  }

  it('minifies copied .js and .css by default, outside dev', async () => {
    await copy({ dev: false })
    expect(await site.read('out/js/app.js')).not.toContain('a comment')
    expect(await site.read('out/css/plain.css')).toBe(
      '.card{color:red;margin:0}',
    )
  })

  it('leaves a *.min.* file and a Sass compile as they are', async () => {
    await copy({ dev: false })
    expect(await site.read('out/js/lib.min.js')).toBe('/* keep */ var x = 1 ;')
    expect(await site.read('out/css/site.css')).toContain('.s{color:red}')
  })

  it('warns about a file it cannot read, copies it unchanged, and does not fail', async () => {
    const warn = vi.fn()
    await copy({ dev: false }, { ...silentLogger, warn })
    expect(await site.read('out/js/bad.js')).toBe('function (')
    expect(warn.mock.calls.map(([m]) => String(m)).join('\n')).toMatch(
      /assets\.minify: bad\.js: [\s\S]*copied as it is/,
    )
  })

  it('does nothing in dev, nor under assets.minify: false', async () => {
    await copy({ dev: true })
    expect(await site.read('out/js/app.js')).toBe(JS)
    await site.cleanup()
    await copy({ dev: false, assets: { minify: false } })
    expect(await site.read('out/js/app.js')).toBe(JS)
    expect(await site.read('out/css/plain.css')).toBe(CSS)
  })

  it('hashes the minified bytes, so the name follows what is served', async () => {
    const manifest = await copy({ dev: false, assets: { hash: true } })
    const name = manifest.lookup('js/app.js')
    expect(name).toMatch(/^js\/app\.[0-9a-f]{8}\.js$/)
    expect(await site.read(`out/${name}`)).not.toContain('a comment')
  })
})
