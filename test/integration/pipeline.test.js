import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// Steps are `node -e` commands, so the suite needs no fixture tool and runs
// the same everywhere. The executable is quoted for a path with spaces.
const node = `"${process.execPath}"`
const run = (source) => `${node} -e "${source.replace(/"/g, '\\"')}"`
const write = (file, body) =>
  run(`require('fs').writeFileSync('${file}', '${body}')`)

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

describe('config.assets.pipeline', () => {
  it('runs a step before the asset copy, so what it wrote is in the build and in the manifest', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    const generated = `${site.src}/assets/css/generated.css`

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [
          {
            name: 'stylesheet',
            run: run(
              `require('fs').mkdirSync('${site.src}/assets/css', { recursive: true }); require('fs').writeFileSync('${generated}', 'body{color:teal}')`,
            ),
          },
        ],
      },
    })
      .scan()
      .generate()

    await kiss.complete()

    // The step wrote a source file and the copy that followed it picked that
    // file up — the ordering is the whole feature.
    expect(await site.read('public/css/generated.css')).toBe('body{color:teal}')
    const report = kiss.report()
    expect(report.assets).toContainEqual({
      source: 'css/generated.css',
      target: 'css/generated.css',
    })
    expect(report.pipeline).toEqual([
      { name: 'stylesheet', ok: true, duration: expect.any(Number) },
    ])
    expect(report.ok).toBe(true)
  })

  it('reports no pipeline for a site that configured none, and changes nothing else', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()

    const data = await kiss.complete()

    expect(kiss.report().pipeline).toEqual([])
    // The documented shape of the data array: entry 0 is still the
    // construction-time asset copy, not a pipeline result.
    expect(data[0].data).toContain('assets')
  })

  it('runs the steps in order and hands each one the build env', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    const log = `${site.root}/steps.txt`

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [
          {
            name: 'first',
            run: run(
              `require('fs').appendFileSync('${log}', 'first:' + process.env.KISS_BUILD + ':' + process.env.KISS_ASSETS + ':' + process.env.KISS_DEV + '\\n')`,
            ),
          },
          {
            name: 'second',
            run: run(`require('fs').appendFileSync('${log}', 'second\\n')`),
          },
        ],
      },
    }).generate()

    await kiss.complete()

    expect(await fs.readFile(log, 'utf8')).toBe(
      `first:${site.build}:${site.src}/assets:0\nsecond\n`,
    )
    expect(kiss.report().pipeline.map((step) => step.name)).toEqual([
      'first',
      'second',
    ])
  })

  it('fails the build when a step exits non-zero, and still builds the pages', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [{ name: 'tailwind', run: run('process.exit(2)') }],
      },
    })
      .scan()
      .generate()

    const err = await kiss.complete().then(
      () => null,
      (e) => e,
    )

    expect(err).toBeInstanceOf(AggregateError)
    expect(err.failures.map((f) => f.view)).toEqual(['<pipeline: tailwind>'])
    expect(err.failures[0].buildTo).toBeNull()
    expect(err.failures[0].error.message).toContain('exit code 2')
    expect(err.report.ok).toBe(false)
    expect(err.report.pipeline).toEqual([
      { name: 'tailwind', ok: false, duration: expect.any(Number) },
    ])
    expect(kiss.report().pipeline[0].ok).toBe(false)
    // A broken tool must not hide the rest of the build: the page still built,
    // and it is still reported as ok.
    expect(await site.exists('public/index.html')).toBe(true)
    expect(err.report.pages[0].ok).toBe(true)
  })

  it('fails the build when a step cannot be spawned at all', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [{ name: 'gone', run: run('1'), cwd: `${site.root}/nope` }],
      },
    }).generate()

    const err = await kiss.complete().then(
      () => null,
      (e) => e,
    )

    expect(err.failures.map((f) => f.view)).toEqual(['<pipeline: gone>'])
    expect(kiss.report().pipeline[0].ok).toBe(false)
  })

  it('runs the steps again on a whole-site rebuild, and copies what they wrote', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    const counter = `${site.root}/runs.txt`
    const target = `${site.src}/assets/count.txt`

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [
          {
            name: 'count',
            run: run(
              `const fs = require('fs'); fs.appendFileSync('${counter}', 'x'); fs.writeFileSync('${target}', fs.readFileSync('${counter}', 'utf8'))`,
            ),
          },
        ],
      },
    })
      .scan()
      .generate()

    await kiss.complete()
    expect(await site.read('public/count.txt')).toBe('x')

    // What a watch rebuild does for an edited model or controller: replay the
    // pipeline from the registrations. A tool whose input changed has to run
    // again, and the build has to pick up what it wrote.
    await kiss._replay()

    expect(await fs.readFile(counter, 'utf8')).toBe('xx')
    expect(await site.read('public/count.txt')).toBe('xx')
    expect(kiss.report().pipeline).toEqual([
      { name: 'count', ok: true, duration: expect.any(Number) },
    ])
  })

  it('starts a watch process in dev mode and close() ends it', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    const started = `${site.root}/watch-started.txt`

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      dev: true,
      assets: {
        pipeline: [
          {
            name: 'compiler',
            run: run('1'),
            watch: run(
              `require('fs').writeFileSync('${started}', 'up'); setInterval(() => {}, 1000)`,
            ),
          },
        ],
      },
    })
    kiss.watch({ entry: null })
    kiss.scan().generate()

    await kiss.complete()
    await vi.waitFor(() => expect(fs.existsSync(started)).toBe(true))
    expect(kiss._pipeline.watching()).toEqual(['compiler'])

    await kiss.close()
    kiss = null

    // close() awaits the watch process's own exit, so there is nothing left
    // holding the event loop (or the temp folder) open by the time it returns.
    expect(fs.existsSync(started)).toBe(true)
  })

  it('starts no watch process outside dev mode', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '<p>hi</p>' })
    const started = `${site.root}/watch-started.txt`

    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      assets: {
        pipeline: [
          {
            name: 'compiler',
            run: run('1'),
            watch: write(started, 'up'),
          },
        ],
      },
    }).generate()

    await kiss.complete()

    expect(kiss._pipeline.watching()).toEqual([])
    expect(await fs.pathExists(started)).toBe(false)
  })

  it('refuses a malformed pipeline at construction', async () => {
    site = await makeSite({})
    const build = (pipeline) => () =>
      new Kiss({
        folders: site.folders,
        logger: silentLogger,
        assets: { pipeline },
      })

    expect(build('npx tailwindcss')).toThrow(
      /config\.assets\.pipeline must be an array/,
    )
    expect(build([{ watch: 'npx tailwindcss --watch' }])).toThrow(
      /config\.assets\.pipeline\[0\]\.run must be a non-empty string/,
    )
    expect(build([{ run: 'a' }, { run: 'b', watch: true }])).toThrow(
      /config\.assets\.pipeline\[1\]\.watch must be a string/,
    )
  })
})
