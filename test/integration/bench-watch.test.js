import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'

import { benchSiteWatch } from '../../scripts/bench.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LIB = path.resolve(HERE, '../../lib')
const url = (rel) => pathToFileURL(path.join(LIB, rel)).href

// A port the OS has just handed back is the only port this machine can promise
// is free; the engine's default 35729 collides with any dev server the operator
// happens to have left open.
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const canBind = (port) =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })

// The smallest site that still exercises all three edit routes: a page view
// (single-page re-render), a partial it includes (scoped re-render) and a model
// it reads (full replay).
async function makeDevSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-bench-watch-'))
  const posix = dir.replace(/\\/g, '/')
  const port = await freePort()
  const livereloadPort = await freePort()
  const write = (rel, body) => {
    const file = path.join(dir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }
  write('src/partials/p.hbs', '<p>partial</p>\n')
  write('src/pages/index.hbs', '<h1>{{model.title}}</h1>\n{{> "p"}}\n')
  write('src/models/m.json', '{ "title": "hello" }\n')
  // A junction rather than a copy, so `resolveKissFrom` — the check that stops
  // a before/after quietly comparing two different engines — has something to
  // resolve from a temp dir that no npm install ever touched.
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(
    path.resolve(LIB, '..'),
    path.join(dir, 'node_modules/kiss-ssg'),
    'junction',
  )
  write(
    'dev.mjs',
    `import Kiss from '${url('kiss.js')}'
import { silentLogger } from '${url('logger.js')}'

new Kiss({
  dev: true,
  port: ${port},
  livereloadPort: ${livereloadPort},
  logger: silentLogger,
  folders: { src: '${posix}/src', build: '${posix}/public' },
})
  .page({ view: 'index.hbs', model: 'm.json' })
  .generate()
`,
  )
  return { dir, port, livereloadPort }
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel))

let site
afterEach(() => {
  if (site) fs.rmSync(site.dir, { recursive: true, force: true })
  site = null
})

describe('benchSiteWatch', () => {
  it('times a page, a partial and a model edit against a real dev process', async () => {
    site = await makeDevSite()
    const before = {
      page: read(site.dir, 'src/pages/index.hbs'),
      partial: read(site.dir, 'src/partials/p.hbs'),
      model: read(site.dir, 'src/models/m.json'),
    }

    const result = await benchSiteWatch(site.dir, {
      dev: 'dev.mjs',
      runs: 1,
      livereloadPort: site.livereloadPort,
      devPort: site.port,
      partial: null,
      model: null,
      page: null,
    })

    expect(result.ok).toBe(true)
    expect(result.builtPages).toBe(1)
    // The engine under measurement must be this repo's, not some other copy
    // that happened to be resolvable from a temp dir.
    expect(result.kiss?.path.replace(/\\/g, '/')).toContain('/lib/kiss.js')
    for (const phase of ['page', 'partial', 'model']) {
      expect(result.phases[phase].median).toBeGreaterThan(0)
      expect(Number.isFinite(result.phases[phase].median)).toBe(true)
    }
    expect(result.touched).toEqual({
      partial: 'src/partials/p.hbs',
      model: 'src/models/m.json',
      page: 'src/pages/index.hbs',
    })
    expect(result.ratio).toBeGreaterThan(0)

    // The bench edits the site it measures; one byte left behind would make the
    // next reading a reading of a different site.
    expect(read(site.dir, 'src/pages/index.hbs')).toEqual(before.page)
    expect(read(site.dir, 'src/partials/p.hbs')).toEqual(before.partial)
    expect(read(site.dir, 'src/models/m.json')).toEqual(before.model)

    // A dev process left running holds its ports, the temp folder and the
    // vitest worker open — the freed port is the proof it is gone.
    await expect(canBind(site.livereloadPort)).resolves.toBe(true)
  }, 60000)
})
