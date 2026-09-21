// The staging folder — `<build>.kiss-staging-<pid>-<random>` under
// `cleanBuild: 'atomic'` and under check — is an implementation detail. It is
// the folder pages are WRITTEN into, never the folder the site asked for, and
// nothing outside the engine should be able to see its name: not a site's own
// `complete()` callback, not a template, not a record the build writes.
//
// Measured on student-handbooks during the 2.5.0 fleet upgrade: under
// `kiss-ssg check` the site's callback printed `Handbooks generated to:
// ./handbooks/test.kiss-staging-…` because `config.folders.build` had been
// pointed at staging and was only pointed back on promotion, which a check
// never does.
import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'
import Kiss from '../../lib/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  vi.unstubAllEnvs()
  await kiss?.close?.()
  await site?.cleanup()
  site = null
  kiss = null
})

const FILES = {
  'src/pages/index.hbs': 'built into {{config.folders.build}}',
}

describe('the staging folder is an implementation detail', () => {
  it('under check, a complete() callback reads the real build folder from config', async () => {
    vi.stubEnv('KISS_CHECK', '1')
    site = await makeSite(FILES)
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    let seen = null
    kiss.page({ view: 'index.hbs' }).generate()
    await kiss.complete(function () {
      seen = this.config.folders.build
    })
    expect(seen).toBe(site.folders.build)
  })

  it('under atomic, a template that renders config.folders.build prints the real folder', async () => {
    site = await makeSite(FILES)
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      cleanBuild: 'atomic',
    })
    kiss.page({ view: 'index.hbs' }).generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe(
      `built into ${site.folders.build}`,
    )
  })

  it('still publishes nothing under check, and still writes every page into staging', async () => {
    // The guard for the change above: moving the write root out of config
    // must not move a single write. Under check the real folder stays absent.
    vi.stubEnv('KISS_CHECK', '1')
    site = await makeSite(FILES)
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate()
    await kiss.complete()
    expect(await site.exists('public')).toBe(false)
    expect(kiss.report().pages[0].hash).toMatch(/^[0-9a-f]{40}$/)
  })
})

// The gate: nothing a build writes, records or reports carries the staging
// folder's name. One test per mode, walking every artefact the build can
// produce, so a new writer that forgets to map its path is caught here rather
// than by a consumer reading a report.
describe('no artefact carries the staging folder name', () => {
  const walk = async (dir) => {
    const out = []
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else out.push(full)
    }
    return out
  }

  const build = async (over) => {
    site = await makeSite({
      ...FILES,
      'src/pages/about.hbs': 'about',
      'src/assets/css/site.css': 'body{}',
    })
    kiss = new Kiss({
      folders: { ...site.folders, aikb: `${site.root}/AIKB` },
      siteUrl: 'https://e.com',
      logger: silentLogger,
      verbose: true,
      ...over,
    })
    kiss
      .page({ view: 'index.hbs', aliases: ['/old.html'] })
      .page({ view: 'about.hbs', published: '2026-01-01' })
      .generate()
      .sitemap()
      .llms({ title: 'T', summary: 'S' })
      .feed({ title: 'T', description: 'D' })
      .robots()
    await kiss.complete()
  }

  const expectClean = (label, text) => {
    expect(text, label).not.toContain('kiss-staging')
  }

  it('under atomic: every written file, the report and the KISS_REPORT line', async () => {
    const reportFile = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-report-')),
      'r.jsonl',
    )
    vi.stubEnv('KISS_REPORT', reportFile)
    await build({ cleanBuild: 'atomic' })
    for (const file of await walk(site.folders.build))
      expectClean(file, await fs.readFile(file, 'utf8'))
    expectClean('report()', JSON.stringify(kiss.report()))
    expectClean('KISS_REPORT', await fs.readFile(reportFile, 'utf8'))
    await fs.remove(path.dirname(reportFile))
  })

  it('under check with aikb: the report, the KISS_REPORT line and last-build.json', async () => {
    const reportFile = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-report-')),
      'r.jsonl',
    )
    vi.stubEnv('KISS_CHECK', '1')
    vi.stubEnv('KISS_AIKB', '1')
    vi.stubEnv('KISS_REPORT', reportFile)
    await build({})
    expectClean('report()', JSON.stringify(kiss.report()))
    expectClean('KISS_REPORT', await fs.readFile(reportFile, 'utf8'))
    for (const file of await walk(`${site.root}/AIKB`))
      expectClean(file, await fs.readFile(file, 'utf8'))
    await fs.remove(path.dirname(reportFile))
  })
})
