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

// A discard whose removal fails. On Windows a transient lock (an antivirus or
// indexer holding a file, or a delete still pending) makes the removal throw
// EBUSY / ENOTEMPTY; the discard used to swallow that at debug level and skip
// clearing the output claims, so the failure was silent and the claims stale.
describe('discarding a staging folder that will not go', () => {
  async function staged(logger = silentLogger) {
    site = await makeSite({ 'src/assets/file.txt': 'A' })
    kiss = new Kiss({ folders: site.folders, cleanBuild: 'atomic', logger })
    await kiss._drain()
    return kiss._stagingDir
  }
  // Both spellings: the discard used to call fs.remove, and a test that
  // mocked only the new call would pass against the old code for nothing.
  // Before the file's own afterEach, which closes the instance and removes the
  // site: both need the real fs back.
  afterEach(() => vi.restoreAllMocks())
  const lockEverything = () => {
    vi.spyOn(fs, 'rm').mockRejectedValue(locked())
    vi.spyOn(fs, 'remove').mockRejectedValue(locked())
  }
  const locked = () =>
    Object.assign(new Error('EBUSY: resource busy or locked'), {
      code: 'EBUSY',
    })

  it('removes with Node’s own retries for transient Windows errors', async () => {
    const staging = await staged()
    const rm = vi.spyOn(fs, 'rm')
    await kiss._discardStaging()
    expect(rm).toHaveBeenCalledWith(
      staging,
      expect.objectContaining({ recursive: true, force: true }),
    )
    expect(rm.mock.calls[0][1].maxRetries).toBeGreaterThan(0)
    expect(await fs.pathExists(staging)).toBe(false)
  })

  it('clears the output claims even when the folder cannot be removed', async () => {
    const staging = await staged()
    lockEverything()
    expect(kiss._outputs.owner(`${staging}/file.txt`)).not.toBeNull()
    await kiss._discardStaging()
    expect(kiss._outputs.owner(`${staging}/file.txt`)).toBeNull()
  })

  it('warns once, naming the folder and what to do about it', async () => {
    const warn = vi.fn()
    const staging = await staged({ ...silentLogger, warn })
    lockEverything()
    await kiss._discardStaging()
    expect(warn).toHaveBeenCalledTimes(1)
    const [message] = warn.mock.calls[0]
    expect(message).toContain(staging)
    expect(message).toMatch(/EBUSY/)
    expect(message).toMatch(/delete it by hand/)
  })

  // The other way a staged build ends: close() with nothing promoted (a build
  // that never called complete()). Same folder, same silence, same fix.
  it('close() warns the same way when it cannot remove an unpromoted staging folder', async () => {
    const warn = vi.fn()
    const staging = await staged({ ...silentLogger, warn })
    lockEverything()
    await kiss.close()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(staging)
    expect(warn.mock.calls[0][0]).toMatch(/delete it by hand/)
    vi.restoreAllMocks()
    await fs.remove(staging)
  })

  it('says nothing when the removal succeeds', async () => {
    const warn = vi.fn()
    await staged({ ...silentLogger, warn })
    await kiss._discardStaging()
    expect(warn).not.toHaveBeenCalled()
  })
})
