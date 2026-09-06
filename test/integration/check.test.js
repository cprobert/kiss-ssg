import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// The real bin, run as a real child process — the only way to assert on an exit
// code and on stdout being nothing but the JSON report.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
// A temp site cannot resolve `kiss-ssg` from node_modules, so its build script
// imports this repo's engine by absolute file URL.
const engine = pathToFileURL(path.join(repoRoot, 'lib', 'kiss.js')).href

const site = (body) => `import Kiss from '${engine}'\n${body}\n`

const ONE_PAGE = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

const ONE_BROKEN_PAGE = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().page({ view: 'missing.hbs' }).generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

const TWO_SITES = site(`
for (const name of ['a', 'b']) {
  const kiss = new Kiss({ folders: { src: './src', build: './public/' + name } })
  kiss.scan().generate()
  await kiss.complete()
}`)

const NEVER_COMPLETES = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()`)

function check(cwd, args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
  })
}

const siblings = (dir) =>
  fs.readdirSync(dir).filter((name) => name.includes('.kiss-'))

let temp
afterEach(async () => {
  if (temp) await temp.cleanup()
  temp = null
})

describe('kiss-ssg check', () => {
  it('reports a clean build, exits 0 and publishes nothing', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': ONE_PAGE,
    })

    const run = check(temp.root, ['check', 'build.js'])

    expect(run.status).toBe(0)
    const reports = JSON.parse(run.stdout)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      ok: true,
      mode: 'check',
      buildDir: './public',
      failures: [],
      sitemap: null,
    })
    expect(reports[0].pages).toEqual([
      { view: 'index.hbs', buildTo: './public/index.html', ok: true },
    ])
    expect(await temp.exists('public')).toBe(false)
    expect(siblings(temp.root)).toEqual([])
  }, 60000)

  it('reports the failed page, exits 1 and still publishes nothing', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': ONE_BROKEN_PAGE,
    })

    const run = check(temp.root, ['check', 'build.js'])

    expect(run.status).toBe(1)
    const [report] = JSON.parse(run.stdout)
    expect(report.ok).toBe(false)
    expect(report.mode).toBe('check')
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0].view).toBe('missing.hbs')
    expect(report.failures[0].buildTo).toBe('./public/missing.html')
    expect(report.failures[0].message).toBeTruthy()
    // The page that did build is still reported, and reported as ok.
    expect(report.pages).toContainEqual({
      view: 'index.hbs',
      buildTo: './public/index.html',
      ok: true,
    })
    expect(await temp.exists('public')).toBe(false)
    expect(siblings(temp.root)).toEqual([])
  }, 60000)

  it('leaves published output exactly as it was', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': ONE_BROKEN_PAGE,
      'public/index.html': 'the published page',
      'public/sentinel.txt': 'untouched',
    })

    const run = check(temp.root, ['check', 'build.js'])

    expect(run.status).toBe(1)
    expect(await temp.read('public/index.html')).toBe('the published page')
    expect(await temp.read('public/sentinel.txt')).toBe('untouched')
    expect(siblings(temp.root)).toEqual([])
  }, 60000)

  it('reports one line per Kiss instance the script created', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': TWO_SITES,
    })

    const run = check(temp.root, ['check', 'build.js'])

    expect(run.status).toBe(0)
    const reports = JSON.parse(run.stdout)
    expect(reports).toHaveLength(2)
    expect(reports.map((r) => r.buildDir)).toEqual(['./public/a', './public/b'])
    expect(reports.every((r) => r.ok)).toBe(true)
    expect(await temp.exists('public/a')).toBe(false)
    expect(await temp.exists('public/b')).toBe(false)
  }, 60000)

  it('prints one summary line per site under --summary', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': ONE_PAGE,
    })

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    expect(run.status).toBe(0)
    expect(run.stdout.trim()).toMatch(
      /^ok \.\/public \(check\) — 1 pages, 0 failed, \d+ assets, \d+ms$/,
    )
  }, 60000)

  it('fails when the script never settles a build', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': NEVER_COMPLETES,
    })

    const run = check(temp.root, ['check', 'build.js'])

    expect(run.status).toBe(1)
    expect(run.stdout.trim()).toBe('')
    expect(run.stderr).toContain('no build report')
  }, 60000)

  it('prints the help for --help, and a usage error for anything it cannot parse', () => {
    const help = check(repoRoot, ['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('kiss-ssg check <script>')

    const wrong = check(repoRoot, ['build', 'site.js'])
    expect(wrong.status).toBe(1)
    expect(wrong.stderr).toContain('unknown command: build')
  })
})

// The same report, read through the API rather than through the bin: `report()`
// and `err.report` are what a deploy script uses without spawning anything.
describe('kiss.report()', () => {
  it('is null until a build has settled, then describes it', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/assets/robots.txt': 'User-agent: *',
    })
    const kiss = new Kiss({
      folders: temp.folders,
      siteUrl: 'https://example.com',
      logger: silentLogger,
    })
    expect(kiss.report()).toBeNull()

    kiss.scan().generate().sitemap()
    await kiss.complete()

    const report = kiss.report()
    expect(report).toMatchObject({ ok: true, mode: 'build', failures: [] })
    expect(report.buildDir).toBe(temp.build)
    expect(report.pages).toEqual([
      { view: 'index.hbs', buildTo: `${temp.build}/index.html`, ok: true },
    ])
    expect(report.assets).toEqual([
      { source: 'robots.txt', target: 'robots.txt' },
    ])
    expect(report.sitemap).toBe(`${temp.build}/sitemap.xml`)
    expect(report.duration).toBeGreaterThanOrEqual(0)
  })

  it('rides on the rejection as err.report, and is the same object', async () => {
    temp = await makeSite({ 'src/pages/index.hbs': '<p>hello</p>' })
    const kiss = new Kiss({ folders: temp.folders, logger: silentLogger })
    kiss.scan().page({ view: 'missing.hbs' }).generate()

    const err = await kiss.complete().then(
      () => null,
      (e) => e,
    )

    expect(err).toBeInstanceOf(AggregateError)
    expect(err.report).toBe(kiss.report())
    expect(err.report.ok).toBe(false)
    expect(err.report.failures.map((f) => f.view)).toEqual(['missing.hbs'])
    // The Error is still on the AggregateError; the report carries the message.
    expect(err.failures[0].error).toBeInstanceOf(Error)
    expect(err.report.failures[0].message).toBe(err.failures[0].error.message)
  })

  it('names the real build folder after an atomic build, not the staging one', async () => {
    temp = await makeSite({ 'src/pages/index.hbs': '<p>hello</p>' })
    const kiss = new Kiss({
      folders: temp.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().generate()
    await kiss.complete()

    const report = kiss.report()
    expect(report.mode).toBe('build')
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    expect(report.pages[0].buildTo).toBe(`${temp.build}/index.html`)
  })

  it('names the real build folder after a failed atomic build too', async () => {
    temp = await makeSite({ 'src/pages/index.hbs': '<p>hello</p>' })
    const kiss = new Kiss({
      folders: temp.folders,
      cleanBuild: 'atomic',
      logger: silentLogger,
    })
    kiss.scan().page({ view: 'missing.hbs' }).generate()
    await kiss.complete().catch(() => {})

    const report = kiss.report()
    expect(report.ok).toBe(false)
    // The staging folder is discarded, so a path naming it would name nothing.
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
    expect(report.failures[0].buildTo).toBe(`${temp.build}/missing.html`)
  })

  it('reports the same build once, however many times complete() is called', async () => {
    temp = await makeSite({ 'src/pages/index.hbs': '<p>hello</p>' })
    const kiss = new Kiss({ folders: temp.folders, logger: silentLogger })
    kiss.scan().generate()

    await kiss.complete()
    const first = kiss.report()
    await kiss.complete()

    expect(kiss.report()).toBe(first)
  })
})
