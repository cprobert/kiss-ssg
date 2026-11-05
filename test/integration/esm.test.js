import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Kiss, { ENTRY, utils } from '../helpers/kiss.js'
import { makeSite } from '../helpers/site.js'

const run = promisify(execFile)
let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('file controllers', () => {
  it('loads an auto-mapped legacy module.exports controller', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{model.name}}',
      'src/models/index.json': { name: 'kiss' },
      'src/controllers/index.js':
        'module.exports = ({ model }) => ({ model: { ...model, name: model.name.toUpperCase() } })',
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('KISS')
  })

  it('loads an explicit export-default controller', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs':
        'export default () => ({ title: "From ESM" })',
    })
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/about.html')).toBe('From ESM')
  })
})

describe('package entry', () => {
  it('can still be require()d from CommonJS and yields the Kiss class', async () => {
    site = await makeSite({
      'use.cjs': `const Kiss = require(${JSON.stringify(ENTRY)}); console.log(typeof Kiss, typeof Kiss.prototype.page)`,
    })
    const { stdout } = await run(process.execPath, [
      path.join(site.root, 'use.cjs'),
    ])
    expect(stdout.trim()).toBe('function function')
  })

  // `export { Kiss as 'module.exports' }` makes `require()` return the class
  // and nothing else, so a named export is reachable from CommonJS only as a
  // static on the class. Every one of them, not `utils` alone: a CommonJS
  // build script needs `toSlug` and a redirect writer needs its renderers
  // (diploma-msc, 2026-11-05).
  it('reaches every named export from CommonJS, as a static on the class', async () => {
    site = await makeSite({
      'use.cjs': [
        `const Kiss = require(${JSON.stringify(ENTRY)})`,
        `import(require('node:url').pathToFileURL(${JSON.stringify(ENTRY)}).href).then((esm) => {`,
        `  const names = Object.keys(esm).filter((n) => n !== 'default' && n !== 'module.exports')`,
        `  console.log(JSON.stringify({ names, missing: names.filter((n) => Kiss[n] !== esm[n]), slug: Kiss.utils && Kiss.utils.toSlug(' -Malformed slug ') }))`,
        `})`,
      ].join('\n'),
    })
    const { stdout } = await run(process.execPath, [
      path.join(site.root, 'use.cjs'),
    ])
    const result = JSON.parse(stdout)
    expect(result.names).toContain('utils')
    expect(result.missing).toEqual([])
    expect(result.slug).toBe('malformed-slug')
  })

  it('exposes utils as a named export', () => {
    expect(typeof Kiss).toBe('function')
    expect(utils.toSlug('A B')).toBe('a-b')
  })
})
