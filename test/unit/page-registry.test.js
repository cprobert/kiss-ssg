import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  defaultIdForPath,
  defaultIdForView,
  explicitIdOf,
  idIndexFor,
  idSlugMismatch,
  logViewStats,
  lookupPage,
  registerPage,
  stackForRecord,
} from '../../lib/page-registry.js'
import { makeSite, waitFor } from '../helpers/site.js'

describe('defaultIdForPath', () => {
  it('is the served location as a key: .html and a trailing /index removed', () => {
    expect(defaultIdForPath('about.html')).toBe('about')
    expect(defaultIdForPath('about/index.html')).toBe('about')
    expect(defaultIdForPath('courses/index.html')).toBe('courses')
    expect(defaultIdForPath('c/acute-medicine-courses.html')).toBe(
      'c/acute-medicine-courses',
    )
    expect(defaultIdForPath('/blog/post.html')).toBe('blog/post')
  })

  it('names the home page index, never the empty string', () => {
    expect(defaultIdForPath('index.html')).toBe('index')
    expect(defaultIdForPath('/index.html')).toBe('index')
  })

  it('keeps every extension but .html, so two formats never compete', () => {
    expect(defaultIdForPath('feed.xml')).toBe('feed.xml')
    expect(defaultIdForPath('data/index.json')).toBe('data/index.json')
    // extensionLess writes a non-HTML page to <x>/index.<ext>, served there.
    expect(defaultIdForPath('feed/index.xml')).toBe('feed/index.xml')
    expect(defaultIdForPath('old.htm')).toBe('old.htm')
  })

  it('strips /index only as a whole segment', () => {
    expect(defaultIdForPath('reindex.html')).toBe('reindex')
    expect(defaultIdForPath('a/reindex.html')).toBe('a/reindex')
  })
})

describe('idSlugMismatch', () => {
  it('names an id that ends in a slug toSlug changed', () => {
    expect(idSlugMismatch('blog/a/foo ', 'foo ', 'foo')).toBe(
      "id 'blog/a/foo ' ends in the slug as given; the page was written as 'foo'",
    )
    expect(idSlugMismatch('-foo', '-foo', 'foo')).toMatch(/^id '-foo'/)
  })

  it('says nothing when the slug was already clean, or the id was built from the written one', () => {
    expect(idSlugMismatch('blog/foo', 'foo', 'foo')).toBeNull()
    expect(idSlugMismatch('blog/foo', 'Foo', 'foo')).toBeNull()
  })

  it('says nothing about an id that is a choice, not a slug', () => {
    expect(idSlugMismatch('home', 'Index Page', 'index-page')).toBeNull()
    // "ends in" means a whole segment: `xfoo ` is not built from `foo `.
    expect(idSlugMismatch('blog/xfoo ', 'foo ', 'foo')).toBeNull()
  })

  it('says nothing without an explicit id or a given slug', () => {
    expect(idSlugMismatch(null, 'foo ', 'foo')).toBeNull()
    expect(idSlugMismatch('foo', undefined, 'foo')).toBeNull()
  })
})

// The identity state these functions read on a Kiss instance. `_idIndexFor`
// is wired the way Kiss wires it, so `lookupPage` and `stackForRecord` reach
// the index through the instance.
const instance = (stack) => {
  const kiss = {
    _stack: stack,
    _idIndex: null,
    _idNoticed: new Set(),
    logger: { notice: vi.fn() },
  }
  kiss._idIndexFor = () => idIndexFor(kiss)
  return kiss
}
const entry = (view, id, explicit = false) => ({ view, id, explicit })

describe('defaultIdForView', () => {
  it("is a .hbs view's route without its extension", () => {
    expect(defaultIdForView('courses/index.hbs')).toBe('courses/index')
    expect(defaultIdForView('/about.hbs')).toBe('about')
    expect(defaultIdForView('blog\\post.hbs')).toBe('blog/post')
  })

  it('is null for an inline template or anything that is not a string', () => {
    expect(defaultIdForView('<h1>{{title}}</h1>')).toBe(null)
    expect(defaultIdForView(undefined)).toBe(null)
    expect(defaultIdForView('.hbs')).toBe(null)
  })
})

describe('explicitIdOf', () => {
  it('counts only a non-empty string', () => {
    expect(explicitIdOf({ id: 'home' })).toBe('home')
    expect(explicitIdOf({ id: 42 })).toBe(null)
    expect(explicitIdOf({ id: '  ' })).toBe(null)
    expect(explicitIdOf(undefined)).toBe(null)
  })
})

describe('idIndexFor', () => {
  it('maps each id to its entry and memoises the index on the instance', () => {
    const home = entry('index.hbs', 'index')
    const kiss = instance([home])
    const index = idIndexFor(kiss)
    expect(index.byId.get('index')).toBe(home)
    expect(kiss._idIndex).toBe(index)
    expect(idIndexFor(kiss)).toBe(index)
  })

  it('withdraws a default id two pages share, and says so once', () => {
    const kiss = instance([entry('a.hbs', 'post'), entry('b.hbs', 'post')])
    const { byId, withdrawn } = idIndexFor(kiss)
    expect(byId.has('post')).toBe(false)
    expect(withdrawn.get('post')).toEqual(['a.hbs', 'b.hbs'])
    kiss._idIndex = null
    idIndexFor(kiss)
    expect(kiss.logger.notice).toHaveBeenCalledTimes(1)
  })

  it('lets an explicit id beat a default one', () => {
    const named = entry('landing.hbs', 'home', true)
    const kiss = instance([entry('home.hbs', 'home'), named])
    const { byId, withdrawn } = idIndexFor(kiss)
    expect(byId.get('home')).toBe(named)
    expect(withdrawn.get('home')).toEqual(['landing.hbs', 'home.hbs'])
  })
})

describe('lookupPage', () => {
  it('finds an entry, reports a withdrawn id, and is null for anything else', () => {
    const about = entry('about.hbs', 'about')
    const kiss = instance([
      about,
      entry('a.hbs', 'post'),
      entry('b.hbs', 'post'),
    ])
    expect(lookupPage(kiss, 'about')).toEqual({ entry: about })
    expect(lookupPage(kiss, 'post')).toEqual({
      withdrawn: true,
      views: ['a.hbs', 'b.hbs'],
    })
    expect(lookupPage(kiss, 'nowhere')).toBe(null)
    expect(lookupPage(kiss, '')).toBe(null)
  })
})

// The one log line that printed a page's options whole: a registration with no
// view. Those options are the author's as written, so a URL model still has its
// query values and a page-level `config` still has its header values.
describe('registerPage', () => {
  it('logs a page with no view without its model URL’s query values or a header value', () => {
    const error = vi.fn()
    registerPage(
      { logger: { error } },
      {
        title: 'T',
        model:
          'https://cdn.example.com/entries?access_token=SECRET-TOKEN-3&type=course',
        config: {
          siteUrl: 'https://example.com',
          fetch: { headers: { Authorization: 'Bearer SECRET-TOKEN-4' } },
        },
      },
      '.',
    )
    expect(error).toHaveBeenCalledTimes(1)
    const [message, shown] = error.mock.calls[0]
    expect(message).toBe('No view specified')
    expect(JSON.stringify(shown)).not.toContain('SECRET-TOKEN-3')
    expect(JSON.stringify(shown)).not.toContain('SECRET-TOKEN-4')
    // Still enough to find the registration by.
    expect(shown).toEqual({
      title: 'T',
      model:
        'https://cdn.example.com/entries?access_token=[redacted]&type=[redacted]',
      config: {
        siteUrl: 'https://example.com',
        fetch: { headers: { Authorization: '[redacted]' } },
      },
    })
  })

  it('logs a page with no view and a model that is not a URL as it was given', () => {
    const error = vi.fn()
    const model = { rows: [1, 2] }
    registerPage({ logger: { error } }, { title: 'T', model }, '.')
    expect(error.mock.calls[0][1]).toEqual({ title: 'T', model })
  })
})

// `debug.json` is not gated on dev, so it can be deployed; `config` carries the
// site's `fetch.headers`, where an API token goes.
describe('logViewStats', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
    site = null
  })

  it('writes debug.json under verbose without each page’s config, keeping the model and other options', async () => {
    site = await makeSite({})
    const config = {
      siteUrl: 'https://example.com',
      fetch: { headers: { Authorization: 'Bearer SECRET-TOKEN-1' } },
    }
    const options = { view: 'a.hbs', slug: 'a', model: { a: 1 }, config }
    const claim = vi.fn()
    const kiss = {
      verbose: true,
      _stack: [
        {
          view: 'a.hbs',
          buildTo: 'public/a.html',
          runCount: 1,
          page: { options },
        },
      ],
      _promises: [],
      _writeRoot: site.build,
      _outputs: { claim },
      logger: { plain: vi.fn() },
    }
    logViewStats(kiss)

    // The write is not awaited: poll until it parses, as the integration test does.
    let text
    await waitFor(async () => {
      try {
        text = await site.read('public/debug.json')
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    })
    expect(text).not.toContain('SECRET-TOKEN-1')
    const [row] = JSON.parse(text)
    expect(row).toMatchObject({
      view: 'a.hbs',
      buildTo: 'public/a.html',
      runCount: 1,
    })
    expect(row.options).not.toHaveProperty('config')
    expect(row.options).toEqual({ view: 'a.hbs', slug: 'a', model: { a: 1 } })
    // The page keeps it: only the dump leaves it out.
    expect(options.config).toBe(config)
  })
})

describe('stackForRecord', () => {
  it('is the stack itself when nothing is withdrawn', () => {
    const stack = [entry('about.hbs', 'about')]
    expect(stackForRecord(instance(stack))).toBe(stack)
  })

  it('nulls a withdrawn default id and leaves the explicit owner alone', () => {
    const named = entry('landing.hbs', 'home', true)
    const kiss = instance([entry('home.hbs', 'home'), named])
    const record = stackForRecord(kiss)
    expect(record.map((e) => e.id)).toEqual([null, 'home'])
    expect(record[1]).toBe(named)
    expect(kiss._stack[0].id).toBe('home')
  })
})
