import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { makeSite } from '../helpers/site.js'

// A script that ends without complete() (spec § 4.5). Run as plain
// `node build.js`: no preload, no alias, which is where the engine has to
// notice by itself.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const enginePath = path.join(repoRoot, 'lib', 'kiss.js')
const engine = pathToFileURL(enginePath).href
const WARNING = 'was built without complete()'

const node = (root, script) => {
  const env = { ...process.env, NO_COLOR: '1' }
  for (const name of [
    'KISS_CHECK',
    'KISS_AIKB',
    'KISS_REPORT',
    'KISS_IMAGES',
    'KISS_IMAGES_REFRESH',
  ])
    delete env[name]
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    out: `${result.stdout}${result.stderr}`,
  }
}

const count = (text, needle) => text.split(needle).length - 1

const CONFIG = (extra = '') =>
  `{ folders: { src: './src', build: './public' }${extra} }`

const ESM = (extra = '', end = '') => `import Kiss from '${engine}'
const kiss = new Kiss(${CONFIG(extra)})
kiss.scan().page({ view: 'missing.hbs' }).generate()
${end}`

const CJS = (
  extra = '',
  end = '',
) => `const Kiss = require(${JSON.stringify(enginePath)})
const kiss = new Kiss(${CONFIG(extra)})
kiss.scan().page({ view: 'missing.hbs' }).generate()
${end}`

let temp
afterEach(async () => {
  await temp?.cleanup()
  temp = null
})

const make = (files) =>
  makeSite({ 'src/pages/index.hbs': '<p>hello</p>', ...files })

describe('a build script that ends without complete()', () => {
  it('warns once and exits 1, in an ES module', async () => {
    temp = await make({ 'build.mjs': ESM() })
    const result = node(temp.root, 'build.mjs')
    expect(result.status).toBe(1)
    expect(count(result.out, WARNING)).toBe(1)
    expect(result.out).toContain('Add `await kiss.complete()`')
  }, 60000)

  it('warns once and exits 1, in a CommonJS script', async () => {
    temp = await make({ 'build.cjs': CJS() })
    const result = node(temp.root, 'build.cjs')
    expect(result.status).toBe(1)
    expect(count(result.out, WARNING)).toBe(1)
  }, 60000)

  it('says how many page failures went unreported', async () => {
    temp = await make({ 'build.mjs': ESM() })
    const result = node(temp.root, 'build.mjs')
    expect(result.out).toContain('1 page failure went unreported')
  }, 60000)

  it('leaves no staging folder under cleanBuild: atomic', async () => {
    temp = await make({ 'build.mjs': ESM(", cleanBuild: 'atomic'") })
    const result = node(temp.root, 'build.mjs')
    expect(result.status).toBe(1)
    expect(count(result.out, WARNING)).toBe(1)
    const left = (await fs.readdir(temp.root)).filter((name) =>
      name.includes('.kiss-staging-'),
    )
    expect(left).toEqual([])
  }, 60000)

  it('is silent for a script that awaits complete()', async () => {
    temp = await make({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.mjs': `import Kiss from '${engine}'
const kiss = new Kiss(${CONFIG()})
kiss.scan().generate()
await kiss.complete()
`,
    })
    const result = node(temp.root, 'build.mjs')
    expect(result.status).toBe(0)
    expect(result.out).not.toContain(WARNING)
  }, 60000)

  it('is silent for a script that awaits a failing complete() and catches it', async () => {
    temp = await make({
      'build.mjs': ESM('', 'await kiss.complete().catch(() => {})'),
    })
    const result = node(temp.root, 'build.mjs')
    expect(result.status).toBe(0)
    expect(result.out).not.toContain(WARNING)
  }, 60000)
})
