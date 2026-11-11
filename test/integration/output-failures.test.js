import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// An output the build asked for (.sitemap(), .feed(), .robots(), .llms()) that
// cannot be written, or that is skipped for a missing input, is a build
// failure: complete() rejects, report().ok is false and the failure is named.
// A build that has everything passes, unchanged.

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  site = null
  kiss = null
})

const OUTPUTS = {
  sitemap: { file: 'sitemap.xml', call: (k) => k.sitemap(), view: '<sitemap>' },
  feed: {
    file: 'feed.xml',
    call: (k) => k.feed({ title: 'T' }),
    view: '<feed>',
  },
  robots: { file: 'robots.txt', call: (k) => k.robots(), view: '<robots>' },
  llms: {
    file: 'llms.txt',
    call: (k) => k.llms({ title: 'T', summary: 'S' }),
    view: '<llms>',
  },
}

const build = async (name, { config = {}, blockFile = false, call } = {}) => {
  site = await makeSite({
    'src/pages/index.hbs': 'home',
    // A directory where the file must go: the copy puts it there first, on
    // the queue ahead of every output.
    ...(blockFile ? { [`src/assets/${OUTPUTS[name].file}/x.txt`]: 'x' } : {}),
  })
  kiss = new Kiss({
    folders: { ...site.folders, assets: `${site.src}/assets` },
    logger: silentLogger,
    ...config,
  })
  kiss.page({ view: 'index.hbs', date: '2026-01-01' }).generate()
  ;(call ?? OUTPUTS[name].call)(kiss)
  return kiss.complete().then(
    () => ({ error: null }),
    (error) => ({ error }),
  )
}

describe.each(Object.keys(OUTPUTS))('.%s() failing', (name) => {
  const { file, view } = OUTPUTS[name]

  it('passes when everything is present', async () => {
    const { error } = await build(name, {
      config: { siteUrl: 'https://e.com' },
    })
    expect(error).toBeNull()
    expect(kiss.report().ok).toBe(true)
    expect(await site.exists(`public/${file}`)).toBe(true)
  })

  it(`fails the build when ${file} cannot be written`, async () => {
    const { error } = await build(name, {
      config: { siteUrl: 'https://e.com' },
      blockFile: true,
    })
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.failures.map((f) => f.view)).toContain(view)
    expect(error.message).toContain(view)
    expect(kiss.report().ok).toBe(false)
    expect(kiss.report().failures.map((f) => f.view)).toContain(view)
  })

  if (name !== 'robots') {
    it('fails the build, naming the fix, without a siteUrl', async () => {
      const { error } = await build(name)
      expect(error).toBeInstanceOf(AggregateError)
      const failure = error.failures.find((f) => f.view === view)
      expect(failure.error.message).toContain(`${file} needs config.siteUrl`)
      expect(kiss.report().ok).toBe(false)
      expect(await site.exists(`public/${file}`)).toBe(false)
    })
  }
})

describe('a missing option', () => {
  it('fails .feed() without a title', async () => {
    const { error } = await build('feed', {
      config: { siteUrl: 'https://e.com' },
      call: (k) => k.feed({}),
    })
    const failure = error.failures.find((f) => f.view === '<feed>')
    expect(failure.error.message).toContain('feed.xml needs options.title')
    expect(kiss.report().ok).toBe(false)
  })

  it('fails .llms() without a title', async () => {
    const { error } = await build('llms', {
      config: { siteUrl: 'https://e.com' },
      call: (k) => k.llms({ summary: 'S' }),
    })
    const failure = error.failures.find((f) => f.view === '<llms>')
    expect(failure.error.message).toContain('llms.txt needs options.title')
  })

  it('fails .llms() without a summary', async () => {
    const { error } = await build('llms', {
      config: { siteUrl: 'https://e.com' },
      call: (k) => k.llms({ title: 'T' }),
    })
    const failure = error.failures.find((f) => f.view === '<llms>')
    expect(failure.error.message).toContain('llms.txt needs options.summary')
  })
})

describe('an output requested after the build settled', () => {
  it('still reaches the verdict', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
    kiss.page({ view: 'index.hbs' }).generate()
    await kiss.complete()
    expect(kiss.report().ok).toBe(true)

    kiss.sitemap()
    await kiss.complete().catch(() => {})
    expect(kiss.report().ok).toBe(false)
    expect(kiss.report().failures.map((f) => f.view)).toContain('<sitemap>')
  })
})
