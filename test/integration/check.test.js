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

// One page, one internal reference that resolves to nothing: the finding is
// advisory, so the build is still `ok` and the exit code is still 0.
const ONE_BROKEN_LINK = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

const NEVER_COMPLETES = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()`)

// A site with a knowledge base configured: the only thing `folders.aikb` does
// on its own is say where `kiss-ssg aikb` would write one.
const WITH_AIKB = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' } })
kiss.scan().generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

const WITH_AIKB_BROKEN = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' } })
kiss.scan().page({ view: 'missing.hbs' }).generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

// The same site after a rename: the page that was recorded is gone, the one
// that replaced it carries an alias — and that alias is a path the home page
// already answers, so both redirect findings have something to say.
const RENAMED_WITH_ALIAS = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' } })
kiss
  .page({ view: 'index.hbs' })
  .page({ view: 'new.hbs', aliases: ['/index.html'] })
  .generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

// The same site after a **move**: the page keeps its view, and so its default
// id, and changes only where it is written — the rename a record can follow by
// identity rather than by path.
const MOVED = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' } })
kiss
  .page({ view: 'index.hbs' })
  .page({ view: 'about.hbs', path: 'company' })
  .generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

// A site with a subject in it — a controller **file**, the one thing a note
// can be stale about — so the two mechanical note lints have something to
// find.
const WITH_SUBJECT = site(`
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' } })
kiss.page({ view: 'index.hbs', controller: 'index.js' }).generate()
await kiss.complete().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})`)

// A real build of the same site, with its report appended to `reportFile` —
// how a site keeps the last build it published, and what `--against` reads.
function record(cwd, reportFile) {
  return spawnSync(process.execPath, ['build.js'], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KISS_REPORT: reportFile },
  })
}

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
      {
        view: 'index.hbs',
        buildTo: './public/index.html',
        ok: true,
        // sha1 of the bytes the page wrote — the staged ones, in a check.
        hash: expect.stringMatching(/^[0-9a-f]{40}$/),
        // The page's identity, defaulted from the view's route.
        id: 'index',
      },
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
      hash: expect.stringMatching(/^[0-9a-f]{40}$/),
      id: 'index',
    })
    // The page that failed wrote nothing, so it names no bytes.
    expect(report.pages.find((p) => p.view === 'missing.hbs')?.hash).toBeNull()
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

  it('names a broken internal link under --summary, without moving the exit code', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<a href="/news/gone.html">Gone</a>',
      'build.js': ONE_BROKEN_LINK,
    })

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    // The pages are scanned before the staging folder is discarded, so a check
    // finds this at all; and the page is named in the folder the site asked
    // for, not in the staging sibling it was actually written to.
    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines[0]).toMatch(/^ok \.\/public \(check\) — 1 pages, 0 failed/)
    expect(lines).toContain(
      '  broken link: ./public/index.html -> /news/gone.html',
    )
    expect(await temp.exists('public')).toBe(false)
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

  it('names the page that changed since the report --against reads', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'build.js': ONE_PAGE,
    })

    expect(
      record(temp.root, path.join(temp.root, 'last-build.jsonl')).status,
    ).toBe(0)
    await temp.touch('src/pages/about.hbs', '<p>about, rewritten</p>')

    const run = check(temp.root, [
      'check',
      '--against',
      'last-build.jsonl',
      'build.js',
    ])

    expect(run.status).toBe(0)
    const { reports, diff } = JSON.parse(run.stdout)
    expect(reports).toHaveLength(1)
    expect(diff).toEqual([
      {
        buildDir: './public',
        added: [],
        removed: [],
        changed: ['./public/about.html'],
        unchanged: 1,
      },
    ])
  }, 60000)

  it('prints the diff under each site in --summary, without moving the exit code', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'build.js': ONE_PAGE,
    })

    expect(
      record(temp.root, path.join(temp.root, 'last-build.jsonl')).status,
    ).toBe(0)
    await temp.touch('src/pages/contact.hbs', '<p>contact</p>')
    await fs.remove(path.join(temp.root, 'src/pages/about.hbs'))

    const run = check(temp.root, [
      'check',
      '--summary',
      '--against',
      'last-build.jsonl',
      'build.js',
    ])

    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines[0]).toMatch(/^ok \.\/public \(check\) — 2 pages/)
    expect(lines.slice(1)).toEqual([
      '  + ./public/contact.html',
      '  - ./public/about.html',
      '  = 1 unchanged',
    ])
  }, 60000)

  it('refuses an --against file it cannot read, before building anything', () => {
    const run = check(repoRoot, [
      'check',
      '--against',
      'no-such-report.json',
      'build.js',
    ])

    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain(
      'cannot read --against file no-such-report.json',
    )
    // A usage error, so it prints the help the way every other one does.
    expect(run.stderr).toContain('kiss-ssg <command> <script>')
  })

  it('prints the help for --help, and a usage error for anything it cannot parse', () => {
    const help = check(repoRoot, ['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('kiss-ssg <command> <script>')
    expect(help.stdout).toContain('aikb <script>')

    const wrong = check(repoRoot, ['build', 'site.js'])
    expect(wrong.status).toBe(1)
    expect(wrong.stderr).toContain('unknown command: build')
  })
})

describe('kiss-ssg aikb', () => {
  it('records the folder from a passing build, publishes nothing, and says so', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': WITH_AIKB,
    })

    const run = check(temp.root, ['aikb', '--summary', 'build.js'])

    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines[0]).toMatch(/^ok \.\/public \(check\) — 1 pages/)
    expect(lines[1]).toBe('  recorded AIKB')
    for (const file of [
      'README.md',
      'site-map.md',
      'site-map.json',
      'last-build.json',
    ])
      expect(await temp.exists(`AIKB/${file}`)).toBe(true)
    // The same staged, discarded build `check` runs: the site itself is never
    // published, and the only thing on disk afterwards is the knowledge base.
    expect(await temp.exists('public')).toBe(false)
    expect(siblings(temp.root)).toEqual([])
  }, 60000)

  it('refuses to record a failed build, writes nothing and exits 1', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': WITH_AIKB_BROKEN,
    })

    const run = check(temp.root, ['aikb', '--summary', 'build.js'])

    expect(run.status).toBe(1)
    expect(run.stdout).toContain('  not recorded — build failed')
    expect(await temp.exists('AIKB')).toBe(false)
  }, 60000)

  it('leaves an already-recorded folder untouched when the build fails', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': WITH_AIKB,
    })
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)
    const before = await temp.read('AIKB/last-build.json')
    // Now break the site, and record again.
    await temp.touch('build.js', WITH_AIKB_BROKEN)

    const run = check(temp.root, ['aikb', '--summary', 'build.js'])

    expect(run.status).toBe(1)
    expect(run.stdout).toContain('  not recorded — build failed')
    // The baseline still describes the last build that worked, which is the
    // one property the whole ceremony exists to keep.
    expect(await temp.read('AIKB/last-build.json')).toBe(before)
  }, 60000)
})

describe('kiss-ssg check, against the knowledge base', () => {
  it('diffs against the recorded baseline with no --against at all', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'build.js': WITH_AIKB,
    })
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)

    // Nothing has changed since the record, so the diff says exactly that.
    const clean = check(temp.root, ['check', '--summary', 'build.js'])
    expect(clean.status).toBe(0)
    expect(clean.stdout.trim().split('\n').slice(1)).toEqual([
      '  = 2 unchanged',
    ])

    // ...and one edit later it names the page and nothing else. The check
    // publishes nothing, so the baseline it just read is still the same file.
    await temp.touch('src/pages/about.hbs', '<p>about, rewritten</p>')
    const dirty = check(temp.root, ['check', '--summary', 'build.js'])
    expect(dirty.status).toBe(0)
    expect(dirty.stdout.trim().split('\n').slice(1)).toEqual([
      '  ~ ./public/about.html',
      '  = 1 unchanged',
    ])
  }, 60000)

  it('names a page removed without a redirect, and a colliding alias, under --summary', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/pages/old.hbs': '<p>old</p>',
      'build.js': WITH_AIKB,
    })
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)

    // The rename the finding exists to catch: `old.hbs` is gone, `new.hbs` has
    // taken its place, and the alias it carries answers the wrong path.
    await fs.remove(path.join(temp.root, 'src/pages/old.hbs'))
    await temp.touch('src/pages/new.hbs', '<p>new</p>')
    await temp.touch('build.js', RENAMED_WITH_ALIAS)

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    // Advisory, both of them: the build is still `ok` and the exit code is
    // still 0. The paths are build-relative, so they read the same whichever
    // folder the check was run from.
    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines[0]).toMatch(/^ok \.\/public \(check\) — 2 pages, 0 failed/)
    expect(lines).toContain('  removed without redirect: /old.html')
    expect(lines).toContain('  alias collides with a page: /index.html')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('names a page that moved without a redirect, under --summary', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'build.js': WITH_AIKB,
    })
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)

    // The page is still there and still called `about`; only its path moved.
    await temp.touch('build.js', MOVED)

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines).toContain(
      '  moved without redirect: /about.html -> /company/about.html (about)',
    )
    // One event, one line: the old path is not also reported as removed.
    expect(
      lines.filter((line) => line.startsWith('  removed without redirect:')),
    ).toEqual([])
  }, 60000)

  it('prints the stale and dangling note lines under --summary', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'src/controllers/index.js': 'export default () => ({ title: "Home" })\n',
      'build.js': WITH_SUBJECT,
    })
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)
    // Written after the record, the way a person writes a note: stamped with
    // a hash that is not this controller's, and citing a file that is gone.
    await temp.touch(
      'AIKB/notes/controllers/index.md',
      `---\nsubject-hash: ${'0'.repeat(40)}\n---\n\n## What it does\n\nReplaced \`src/pages/old.hbs\`.\n`,
    )

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    // Findings, not failures: both lines print and the check still passes.
    expect(run.status).toBe(0)
    const lines = run.stdout.trim().split('\n')
    expect(lines).toContain('  note stale: AIKB/notes/controllers/index.md')
    expect(lines).toContain(
      '  note dangling: AIKB/notes/controllers/index.md: src/pages/old.hbs',
    )
  }, 60000)

  it('does not diff a site that has never been recorded', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': WITH_AIKB,
    })

    const run = check(temp.root, ['check', '--summary', 'build.js'])

    // `folders.aikb` names a folder nobody has recorded, so there is no
    // baseline, no diff — and the report has nothing to say about it either.
    expect(run.status).toBe(0)
    expect(run.stdout.trim().split('\n')).toHaveLength(1)
    expect(
      JSON.parse(check(temp.root, ['check', 'build.js']).stdout)[0].aikb,
    ).toBeNull()
  }, 60000)

  it('lets --against win over the recorded baseline', async () => {
    temp = await makeSite({
      'src/pages/index.hbs': '<p>hello</p>',
      'build.js': WITH_AIKB,
    })
    // The record is the site at one page...
    expect(check(temp.root, ['aikb', 'build.js']).status).toBe(0)
    // ...and this published build, kept separately, is the site at two.
    await temp.touch('src/pages/about.hbs', '<p>about</p>')
    expect(
      record(temp.root, path.join(temp.root, 'published.jsonl')).status,
    ).toBe(0)

    const run = check(temp.root, [
      'check',
      '--summary',
      '--against',
      'published.jsonl',
      'build.js',
    ])

    expect(run.status).toBe(0)
    // Against the baseline it would be `+ ./public/about.html, = 1 unchanged`.
    expect(run.stdout.trim().split('\n').slice(1)).toEqual(['  = 2 unchanged'])
  }, 60000)
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
      {
        view: 'index.hbs',
        buildTo: `${temp.build}/index.html`,
        ok: true,
        hash: expect.stringMatching(/^[0-9a-f]{40}$/),
        id: 'index',
      },
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
