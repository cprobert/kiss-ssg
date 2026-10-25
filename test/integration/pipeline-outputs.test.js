import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'
import { readZipEntries } from '../helpers/zip.js'

// A step that writes into the build folder directly (KISS_BUILD), and declares
// it in `outputs` (planning/plans/2026-10-24-learning-packages.md, amendment 3).
// Steps are `node -e` commands, as in pipeline.test.js, so nothing needs installing.
const node = `"${process.execPath}"`
const run = (source) => `${node} -e "${source.replace(/"/g, '\\"')}"`
const writeIntoBuild = (rel, body) =>
  run(
    `const p = require('path'); const f = p.join(process.env.KISS_BUILD, '${rel}'); require('fs').mkdirSync(p.dirname(f), { recursive: true }); require('fs').writeFileSync(f, '${body}')`,
  )
const nothing = run(`process.exit(0)`)
const failing = run(`process.exit(3)`)

// One packaged page that links the stylesheet through {{asset}}.
const PAGE = `<html><head><link rel="stylesheet" href="../{{asset 'css/site.css'}}"></head><body><p>One</p></body></html>`

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

async function build(steps, { files = {}, config = {} } = {}) {
  site = await makeSite({ 'src/pages/one.hbs': PAGE, ...files })
  kiss = new Kiss({
    folders: site.folders,
    logger: silentLogger,
    ...config,
    assets: { ...(config.assets ?? {}), pipeline: steps },
  })
  kiss
    .page({
      view: 'one.hbs',
      path: 'course',
      slug: 'one',
      id: 'one',
      title: 'One',
      package: 'p',
    })
    .generate()
  await kiss.complete()
  return kiss
}

const failures = () =>
  kiss
    .report()
    .failures.map((f) => `${f.view} ${f.message}`)
    .join('\n')

describe('config.assets.pipeline outputs', () => {
  it('claims a declared output, so {{asset}} names it and its package carries it', async () => {
    await build([
      {
        name: 'css',
        run: writeIntoBuild('css/site.css', 'body{}'),
        outputs: ['css/site.css'],
      },
    ])
    expect(kiss.report().ok).toBe(true)
    expect(await site.read('public/course/one.html')).toContain(
      'href="../css/site.css"',
    )
    const pkg = kiss.report().packages[0]
    expect(pkg.outside).toEqual([])
    expect([...readZipEntries(fs.readFileSync(pkg.file)).keys()]).toContain(
      'css/site.css',
    )
  })

  it('keeps a declared output unhashed when assets.hash is on', async () => {
    await build(
      [
        {
          name: 'css',
          run: writeIntoBuild('css/site.css', 'body{}'),
          outputs: ['css/site.css'],
        },
      ],
      {
        config: { assets: { hash: true } },
      },
    )
    expect(kiss.report().ok).toBe(true)
    expect(await site.read('public/course/one.html')).toContain(
      'href="../css/site.css"',
    )
  })

  it('leaves out an undeclared file written into the build folder, and says how to declare it', async () => {
    const files = {
      'src/pages/one.hbs': PAGE.replace(
        "../{{asset 'css/site.css'}}",
        '../css/site.css',
      ),
    }
    await build(
      [{ name: 'css', run: writeIntoBuild('css/site.css', 'body{}') }],
      { files },
    )
    const [finding] = kiss.report().packages[0].outside
    expect(finding.href).toBe('../css/site.css')
    expect(finding.reason).toMatch(/^not written by this build: .*outputs/)
  })

  it('fails the build for a declared output the step did not write, even with an old copy in the build folder', async () => {
    site = null
    const files = { 'public/css/site.css': 'old{}' }
    await expect(
      build([{ name: 'css', run: nothing, outputs: ['css/site.css'] }], {
        files,
        config: { cleanBuild: false },
      }),
    ).rejects.toThrow(/pipeline: css/)
    expect(failures()).toMatch(
      /<pipeline: css>.*declared output not written: css\/site\.css/s,
    )
  })

  it('checks no outputs of a step that failed: the step is the one failure', async () => {
    await expect(
      build([{ name: 'css', run: failing, outputs: ['css/site.css'] }]),
    ).rejects.toThrow()
    expect(
      kiss.report().failures.filter((f) => f.view === '<pipeline: css>'),
    ).toHaveLength(1)
    expect(failures()).not.toMatch(/declared output not written/)
  })

  it('keeps the outputs of two unnamed steps apart, though both are named after `node`', async () => {
    const files = {
      'src/pages/one.hbs': `<html><head><link rel="stylesheet" href="../{{asset 'css/a.css'}}"><link rel="stylesheet" href="../{{asset 'css/b.css'}}"></head><body></body></html>`,
    }
    await build(
      [
        { run: writeIntoBuild('css/a.css', 'a{}'), outputs: ['css/a.css'] },
        { run: writeIntoBuild('css/b.css', 'b{}'), outputs: ['css/b.css'] },
      ],
      { files },
    )
    expect(kiss.report().ok).toBe(true)
    const html = await site.read('public/course/one.html')
    expect(html).toContain('href="../css/a.css"')
    expect(html).toContain('href="../css/b.css"')
  })

  it('reports a collision when the asset copy writes a declared output too', async () => {
    const files = { 'src/assets/css/site.css': 'copied{}' }
    await build(
      [
        {
          name: 'css',
          run: writeIntoBuild('css/site.css', 'body{}'),
          outputs: ['css/site.css'],
        },
      ],
      { files },
    )
    const collision = kiss
      .report()
      .outputs.collisions.find((c) => c.file.endsWith('/css/site.css'))
    expect(collision.producers.map((p) => p.kind).sort()).toEqual([
      'asset',
      'pipeline',
    ])
    expect(await site.read('public/css/site.css')).toBe('body{}')
  })
})
