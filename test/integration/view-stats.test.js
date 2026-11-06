import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { inspect } from 'node:util'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  site = null
  kiss = null
  vi.unstubAllGlobals()
})

// `viewStats()` does not await its write, so poll for the file. Poll on it
// parsing, not on it existing: the write creates the file truncated and fills
// it a tick later, so existence alone reads back an empty string.
const readDebug = async () => {
  let stats
  await waitFor(async () => {
    try {
      stats = JSON.parse(await site.read('public/debug.json'))
      return true
    } catch {
      return false
    }
  })
  return stats
}

describe('viewStats()', () => {
  it('writes a serialisable debug.json when verbose', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    kiss = new Kiss({
      folders: site.folders,
      verbose: true,
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    kiss.viewStats()

    const stats = await readDebug()
    expect(stats).toHaveLength(1)
    expect(stats[0].view).toBe('index.hbs')
    expect(stats[0].options.slug).toBe('index')
  })
})

// `GUIDE.md` names `config.fetch.headers` as where an API token goes, and every
// page's options carry the whole resolved config. The two files that serialise
// a page's options are written into the build folder, which is served (dev) and
// can be deployed (`debug.json` is not gated on dev), so neither may carry the
// config; and the verbose log line goes to a terminal or a CI log, so it may not
// carry the header values.
describe('the config stays out of the debug files and the log', () => {
  const TOKEN = 'SECRET-TOKEN-1'
  const files = {
    // The template reads `config`, so the render still has it.
    'src/pages/index.hbs':
      '<h1>{{model.heading}}</h1><p>{{config.siteUrl}}</p>',
    'src/models/index.json': { heading: 'Hello' },
  }

  // Every argument of every logger call, whatever the method: `debug` is gated
  // on `verbose` inside `createLogger`, so an injected logger is handed what it
  // would print either way.
  const recordingLogger = () => {
    const calls = []
    const record =
      (method) =>
      (...args) =>
        calls.push({ method, args })
    const logger = {
      verbose: true,
      banner: record('banner'),
      info: record('info'),
      success: record('success'),
      highlight: record('highlight'),
      notice: record('notice'),
      warn: record('warn'),
      error: record('error'),
      debug: record('debug'),
      plain: record('plain'),
    }
    return { logger, calls }
  }

  // The whole build folder, not one file: whichever file carried the token is
  // named, so the failure says where it leaked.
  const filesHolding = async (needle) => {
    const entries = await fs.readdir(site.build, {
      recursive: true,
      withFileTypes: true,
    })
    const holding = []
    for (const e of entries) {
      if (!e.isFile()) continue
      const file = path.join(e.parentPath ?? e.path, e.name)
      const text = await fs.readFile(file, 'utf8')
      if (text.includes(needle))
        holding.push(path.relative(site.build, file).replace(/\\/g, '/'))
    }
    return holding.sort()
  }

  const callsHolding = (calls, needle) =>
    calls
      .filter(({ args }) =>
        args.some((a) =>
          inspect(a, { depth: Infinity, maxStringLength: Infinity }).includes(
            needle,
          ),
        ),
      )
      .map(({ method, args }) => `${method}(${String(args[0])})`)

  const config = (over) => ({
    folders: site.folders,
    siteUrl: 'https://example.com',
    fetch: { headers: { Authorization: `Bearer ${TOKEN}` } },
    ...over,
  })

  it('a dev build writes the token into no file in the build folder', async () => {
    site = await makeSite(files)
    const { logger } = recordingLogger()
    kiss = new Kiss(
      config({ dev: true, port: 0, livereloadPort: 0, verbose: true, logger }),
    )
      .scan()
      .generate()
    await kiss.complete()
    kiss.viewStats()
    await readDebug()

    // The files under test are there, so an empty answer is not a missing one.
    expect(await site.exists('public/index.json')).toBe(true)
    expect(await site.exists('public/debug.json')).toBe(true)
    expect(await filesHolding(TOKEN)).toEqual([])
  })

  it('a verbose build with viewStats() writes the token into neither debug.json nor the log', async () => {
    site = await makeSite(files)
    const { logger, calls } = recordingLogger()
    kiss = new Kiss(config({ verbose: true, logger })).scan().generate()
    await kiss.complete()
    kiss.viewStats()
    await readDebug()

    // One assertion, so a failure names every file and every logger call.
    expect({
      files: await filesHolding(TOKEN),
      log: callsHolding(calls, TOKEN),
    }).toEqual({ files: [], log: [] })
    // The log line still prints the config, and still names the header.
    const logged = calls.find(
      ({ method, args }) => method === 'debug' && args[0] === 'config: ',
    )
    expect(logged.args[1].fetch.headers).toEqual({
      Authorization: '[redacted]',
    })
    expect(logged.args[1].siteUrl).toBe('https://example.com')
    // The redaction is of what is logged, never of the live config.
    expect(kiss.config.fetch.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('the dev sibling and debug.json still carry the model and the page’s own options, and the render still reads config', async () => {
    site = await makeSite(files)
    kiss = new Kiss(
      config({
        dev: true,
        port: 0,
        livereloadPort: 0,
        verbose: true,
        logger: silentLogger,
      }),
    )
      .scan()
      .generate()
    await kiss.complete()
    kiss.viewStats()
    const stats = await readDebug()

    const sibling = JSON.parse(await site.read('public/index.json'))
    expect(sibling).not.toHaveProperty('config')
    expect(sibling.model).toEqual({ heading: 'Hello' })
    expect(sibling).toMatchObject({ view: 'index.hbs', slug: 'index' })
    expect(sibling.title).toBeTypeOf('string')

    expect(stats).toHaveLength(1)
    expect(stats[0].options).not.toHaveProperty('config')
    expect(stats[0].options.model).toEqual({ heading: 'Hello' })
    expect(stats[0].options).toMatchObject({ view: 'index.hbs', slug: 'index' })

    // `options.config` itself is untouched: the template read it.
    expect(await site.read('public/index.html')).toContain(
      '<p>https://example.com</p>',
    )
    expect(kiss._stack[0].page.options.config.siteUrl).toBe(
      'https://example.com',
    )
  })

  // Leaving `config` out of the two debug files is not enough: the guide's own
  // "take a peek" idiom, `{{{stringify this}}}`, prints the whole render
  // context into the page, and a controller can copy the config under another
  // name past `withoutConfig`. So the copy each page gets carries the header
  // names with every value redacted, and fetching reads the instance's own.
  describe('the token never reaches the render context', () => {
    const peek = {
      'src/pages/index.hbs': '<pre>{{{stringify this}}}</pre>',
    }

    it('{{{stringify this}}} writes no token into the page, in a production build', async () => {
      site = await makeSite(peek)
      kiss = new Kiss(config({ logger: silentLogger })).scan().generate()
      await kiss.complete()

      const html = await site.read('public/index.html')
      // The dump really is there, so an absent token is not an absent dump.
      expect(html).toContain('https://example.com')
      expect(html).toContain('Authorization')
      expect(await filesHolding(TOKEN)).toEqual([])
    })

    it('{{{stringify this}}} writes no token into any file, in a dev build', async () => {
      site = await makeSite(peek)
      kiss = new Kiss(
        config({ dev: true, port: 0, livereloadPort: 0, logger: silentLogger }),
      )
        .scan()
        .generate()
      await kiss.complete()

      expect(await site.read('public/index.html')).toContain('Authorization')
      expect(await filesHolding(TOKEN)).toEqual([])
    })

    it('a controller that copies config under another name writes no token into the page, the dev sibling or debug.json', async () => {
      site = await makeSite({
        'src/pages/index.hbs': '<pre>{{{stringify site}}}</pre>',
      })
      kiss = new Kiss(
        config({
          dev: true,
          port: 0,
          livereloadPort: 0,
          verbose: true,
          logger: silentLogger,
        }),
      )
        .page({
          view: 'index.hbs',
          controller: (options) => ({ ...options, site: options.config }),
        })
        .generate()
      await kiss.complete()
      kiss.viewStats()
      await readDebug()

      // The copy is in all three files, so an absent token is not an absent copy.
      expect(await site.read('public/index.html')).toContain('Authorization')
      expect(JSON.parse(await site.read('public/index.json')).site).toBeTruthy()
      expect(await site.exists('public/debug.json')).toBe(true)
      expect(await filesHolding(TOKEN)).toEqual([])
    })

    it('{{{stringify this}}} writes no token into any page of a fan-out', async () => {
      site = await makeSite(peek)
      kiss = new Kiss(config({ logger: silentLogger }))
        .page({
          view: 'index.hbs',
          dynamic: true,
          model: [{ slug: 'one' }, { slug: 'two' }],
        })
        .generate()
      await kiss.complete()

      expect(kiss._stack).toHaveLength(2)
      for (const { page } of kiss._stack)
        expect(page.options.config.fetch.headers).toEqual({
          Authorization: '[redacted]',
        })
      expect(await filesHolding(TOKEN)).toEqual([])
    })

    it('a page’s own config override that supplies fetch.headers is redacted too', async () => {
      site = await makeSite(peek)
      kiss = new Kiss({
        folders: site.folders,
        siteUrl: 'https://example.com',
        logger: silentLogger,
      })
        .page({
          view: 'index.hbs',
          config: { fetch: { headers: { 'X-Api-Key': TOKEN } } },
        })
        .generate()
      await kiss.complete()

      expect(await site.read('public/index.html')).toContain('X-Api-Key')
      expect(await filesHolding(TOKEN)).toEqual([])
    })

    it('a template still reads config, and a header value reads [redacted]', async () => {
      site = await makeSite({
        'src/pages/index.hbs':
          '<p>{{config.siteUrl}}|{{config.fetch.headers.Authorization}}</p>',
      })
      kiss = new Kiss(config({ logger: silentLogger })).scan().generate()
      await kiss.complete()

      expect(await site.read('public/index.html')).toContain(
        '<p>https://example.com|[redacted]</p>',
      )
    })

    it('a URL model is still fetched with the real header, and the instance’s config keeps it', async () => {
      const sent = []
      vi.stubGlobal('fetch', async (url, init) => {
        sent.push({ url, headers: init?.headers })
        return { ok: true, status: 200, json: async () => ({ heading: 'Hi' }) }
      })
      site = await makeSite({
        'src/pages/index.hbs': '<h1>{{model.heading}}</h1>',
      })
      kiss = new Kiss(config({ logger: silentLogger }))
        .page({ view: 'index.hbs', model: 'https://api.example/home' })
        .generate()
      await kiss.complete()

      expect(await site.read('public/index.html')).toContain('<h1>Hi</h1>')
      expect(sent).toEqual([
        {
          url: 'https://api.example/home',
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      ])
      expect(kiss.config.fetch.headers.Authorization).toBe(`Bearer ${TOKEN}`)
      expect(kiss._stack[0].page.options.config.fetch.headers).toEqual({
        Authorization: '[redacted]',
      })
    })
  })
})
