import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  canonicalPathFor,
  collectAliases,
  coveredByAlias,
  normaliseAlias,
  redirectFindings,
  renderFirebaseRedirects,
  renderHtaccessRedirects,
  renderRedirects,
  renderRedirectsJson,
  renderVercelRedirects,
  normaliseWriterOutput,
  writeRedirects,
} from '../../lib/redirects.js'
import { silentLogger } from '../../lib/logger.js'

// A stack entry, as `Kiss._preparePage` builds one: the output path, and the
// page's options.
const entry = (buildTo, options = {}) => ({ buildTo, page: { options } })

let temp
afterEach(async () => {
  if (temp) await fs.remove(temp)
  temp = null
})

describe('canonicalPathFor', () => {
  // The three shapes a page can have, and the reason the derivation is
  // `toAbsoluteUrl('', toCanonicalPath(rel))` rather than `toCanonicalPath`
  // alone: two of these three would be wrong without the `index` collapse.
  it('gives the home page, a directory index and a file page their served paths', () => {
    expect(canonicalPathFor('./public/index.html', './public')).toBe('/')
    expect(canonicalPathFor('./public/courses/index.html', './public')).toBe(
      '/courses/',
    )
    expect(canonicalPathFor('./public/about.html', './public')).toBe('/about')
  })

  it('is the same string the sitemap and {{canonical}} emit', async () => {
    const { buildSitemapEntries } = await import('../../lib/sitemap.js')
    const stack = [
      entry('./public/index.html'),
      entry('./public/courses/index.html'),
      entry('./public/about.html'),
    ]
    const locs = buildSitemapEntries(stack, {
      siteUrl: 'https://e.com',
      buildDir: './public',
    }).map((url) => url.loc)

    expect(locs).toEqual(
      stack.map(
        (e) => `https://e.com${canonicalPathFor(e.buildTo, './public')}`,
      ),
    )
  })
})

describe('normaliseAlias', () => {
  it('adds the leading slash, strips query and fragment, keeps the trailing slash', () => {
    expect(normaliseAlias('old-slug')).toBe('/old-slug')
    expect(normaliseAlias('/news/2024/thing.html')).toBe(
      '/news/2024/thing.html',
    )
    expect(normaliseAlias('/old?utm=1')).toBe('/old')
    expect(normaliseAlias('/old#top')).toBe('/old')
    // Preserved as written: `/old/` and `/old` are two different source paths
    // to a host, and only the author knows which one used to be linked.
    expect(normaliseAlias('/old/')).toBe('/old/')
    expect(normaliseAlias('  /spaced  ')).toBe('/spaced')
  })

  it('collapses repeated slashes, so an alias cannot read as protocol-relative', () => {
    expect(normaliseAlias('//old')).toBe('/old')
    expect(normaliseAlias('/a//b')).toBe('/a/b')
  })

  it('drops an alias with whitespace inside it, so one alias is only ever one rule', () => {
    // The `_redirects` format is space-separated columns and newline-separated
    // rules; an alias carrying either would write more than the one line it
    // was promised, and a record from a fetched model is not a hand-typed path.
    expect(normaliseAlias('/old post')).toBeNull()
    expect(normaliseAlias('/old\t/maintenance')).toBeNull()
    expect(
      normaliseAlias('/old /maintenance 302\n/* /maintenance 302'),
    ).toBeNull()
    expect(
      renderRedirects(
        collectAliases(
          [entry('./public/x.html', { slug: 'x', aliases: ['/a b'] })],
          {
            buildDir: './public',
          },
        ),
      ),
    ).toBe('')
  })

  it('drops an alias with no path in it at all', () => {
    expect(normaliseAlias('')).toBeNull()
    expect(normaliseAlias('   ')).toBeNull()
    expect(normaliseAlias('?utm=1')).toBeNull()
    expect(normaliseAlias(undefined)).toBeNull()
    // `/` is a path — the home page — so it survives.
    expect(normaliseAlias('/')).toBe('/')
  })
})

describe('collectAliases', () => {
  const stack = [
    entry('./public/index.html'),
    entry('./public/about.html', { aliases: ['/about-us', '/about-us'] }),
    entry('./public/courses/index.html', { aliases: ['courses.html'] }),
  ]

  it('takes every page’s aliases and targets its canonical path', () => {
    expect(collectAliases(stack, { buildDir: './public' })).toEqual([
      { from: '/about-us', to: '/about' },
      { from: '/courses.html', to: '/courses/' },
    ])
  })

  it('accepts a bare string, and ignores a page with none', () => {
    expect(
      collectAliases([entry('./public/a.html', { aliases: '/old' })], {
        buildDir: './public',
      }),
    ).toEqual([{ from: '/old', to: '/a' }])
    expect(collectAliases([entry('./public/a.html')], {})).toEqual([])
  })

  it('skips a generate:false page, which has no file to redirect to', () => {
    expect(
      collectAliases(
        [entry('./public/a.html', { aliases: ['/old'], generate: false })],
        { buildDir: './public' },
      ),
    ).toEqual([])
  })

  it('keeps two pages claiming one alias as two rules', () => {
    expect(
      collectAliases(
        [
          entry('./public/b.html', { aliases: ['/old'] }),
          entry('./public/a.html', { aliases: ['/old'] }),
        ],
        { buildDir: './public' },
      ),
    ).toEqual([
      { from: '/old', to: '/a' },
      { from: '/old', to: '/b' },
    ])
  })
})

describe('renderRedirects', () => {
  const rules = [
    { from: '/z', to: '/zed' },
    { from: '/a', to: '/ay' },
    { from: '/m/', to: '/em/' },
  ]

  it('writes one 301 line per rule, sorted, newline-terminated', () => {
    expect(renderRedirects(rules)).toBe(
      '/a /ay 301\n/m/ /em/ 301\n/z /zed 301\n',
    )
  })

  it('is byte-stable whatever order the rules arrive in', () => {
    const shuffled = [rules[2], rules[0], rules[1]]
    expect(renderRedirects(shuffled)).toBe(renderRedirects(rules))
  })

  it('writes nothing at all for no rules', () => {
    expect(renderRedirects([])).toBe('')
  })
})

describe('redirectFindings — collisions', () => {
  const currentPages = [
    { buildTo: './public/index.html' },
    { buildTo: './public/about.html' },
    { buildTo: './public/courses/index.html' },
  ]
  const findings = (rules) =>
    redirectFindings({ rules, currentPages, buildDir: './public' })

  it('reports an alias a live page already answers, in either form', () => {
    // `/about` is what the host serves the page at; `/about.html` is the file
    // itself. A non-forced rule is silently skipped for both.
    expect(findings([{ from: '/about', to: '/x' }]).collisions).toEqual([
      '/about',
    ])
    expect(findings([{ from: '/about.html', to: '/x' }]).collisions).toEqual([
      '/about.html',
    ])
    expect(findings([{ from: '/courses/', to: '/x' }]).collisions).toEqual([
      '/courses/',
    ])
  })

  it('reports a from two pages both claim, once, and sorted with the rest', () => {
    const { collisions } = findings([
      { from: '/old', to: '/a' },
      { from: '/old', to: '/b' },
      { from: '/about', to: '/x' },
    ])
    expect(collisions).toEqual(['/about', '/old'])
  })

  it('says nothing about an alias no live page answers', () => {
    expect(findings([{ from: '/gone', to: '/about' }]).collisions).toEqual([])
  })
})

describe('redirectFindings — removed', () => {
  // The same site, recorded from `examples/` and rebuilt from the repo root:
  // not one path string is shared, which is why the comparison is made on the
  // build-relative half of each path.
  const previousPages = {
    buildDir: '../public/site',
    pages: [
      { buildTo: '../public/site/index.html', hash: 'aaa' },
      { buildTo: '../public/site/old-post.html', hash: 'bbb' },
      { buildTo: '../public/site/draft.html', hash: null },
    ],
  }
  const currentPages = [
    { buildTo: 'public/site/index.html' },
    { buildTo: 'public/site/new-post.html' },
  ]
  const removed = (rules) =>
    redirectFindings({
      rules,
      currentPages,
      previousPages,
      buildDir: 'public/site',
    }).removed

  it('names the page that vanished, across two different working directories', () => {
    expect(removed([])).toEqual(['/old-post.html'])
  })

  it('says nothing once an alias covers it', () => {
    // The alias is the canonical path (`/old-post`), which is what the old
    // file's path reduces to — the comparison the two halves have to agree on.
    expect(removed([{ from: '/old-post', to: '/new-post' }])).toEqual([])
    // A rule for some other path leaves the finding standing.
    expect(removed([{ from: '/elsewhere', to: '/new-post' }])).toEqual([
      '/old-post.html',
    ])
  })

  it('ignores a page the record wrote no bytes for', () => {
    // `draft.html` is `generate: false` in the record: nothing was ever
    // published there, so nothing was lost.
    expect(removed([])).not.toContain('/draft.html')
  })

  it('names a directory index by the URL a browser asked for, not by the file', () => {
    // `/old/index.html` is the file; `/old/` is what anyone ever linked to, and
    // what an alias covering it has to be written as.
    const { removed } = redirectFindings({
      currentPages: [{ buildTo: 'public/site/index.html' }],
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/index.html', hash: 'aaa' },
          { buildTo: '../public/site/old/index.html', hash: 'bbb' },
        ],
      },
      buildDir: 'public/site',
    })

    expect(removed).toEqual(['/old/'])
  })

  it('is empty with no record at all', () => {
    expect(
      redirectFindings({ currentPages, buildDir: 'public/site' }).removed,
    ).toEqual([])
  })

  it('is empty, and never throws, for a record it cannot make sense of', () => {
    for (const previous of [
      {},
      { pages: null },
      { pages: [{}, { buildTo: 42 }] },
      /** @type {any} */ ('not a report'),
    ])
      expect(
        redirectFindings({
          currentPages,
          previousPages: previous,
          buildDir: 'public/site',
        }),
      ).toEqual({ removed: [], collisions: [], moved: [] })
  })
})

describe('coveredByAlias', () => {
  // The one predicate both findings ask, so they can never disagree about a
  // page. An alias covers in either spelling: the canonical form the sitemap
  // uses, or the served form the finding itself reports — so the alias a
  // notice recommends always silences the finding that recommended it.
  it('matches an alias in canonical or served form, and nothing else', () => {
    expect(coveredByAlias('/old-post.html', new Set(['/old-post']))).toBe(true)
    expect(coveredByAlias('/old-post.html', new Set(['/old-post.html']))).toBe(
      true,
    )
    expect(coveredByAlias('/old/index.html', new Set(['/old/']))).toBe(true)
    expect(coveredByAlias('/old-post.html', new Set(['/other']))).toBe(false)
    expect(coveredByAlias('/old-post.html', new Set())).toBe(false)
  })
})

describe('redirectFindings — moved', () => {
  // The same page, recorded at one path and built at another: same `id`, so the
  // record and the build can be paired across the rename.
  const previousPages = {
    buildDir: '../public/site',
    pages: [
      { buildTo: '../public/site/index.html', hash: 'aaa', id: 'index' },
      { buildTo: '../public/site/about.html', hash: 'bbb', id: 'about' },
    ],
  }
  const currentPages = [
    { buildTo: 'public/site/index.html', id: 'index' },
    { buildTo: 'public/site/company/about.html', id: 'about' },
  ]
  const findings = (rules = [], over = {}) =>
    redirectFindings({
      rules,
      currentPages,
      previousPages,
      buildDir: 'public/site',
      ...over,
    })

  it('pairs the record and the build by id, and reports the move instead of a removal', () => {
    const { moved, removed } = findings()

    expect(moved).toEqual([
      { id: 'about', from: '/about.html', to: '/company/about.html' },
    ])
    // One event, one finding: the old path is not also reported as a page that
    // vanished, which it would be on the path comparison alone.
    expect(removed).toEqual([])
  })

  it('says nothing once an alias covers the old path', () => {
    expect(findings([{ from: '/about', to: '/company/about' }])).toEqual({
      removed: [],
      collisions: [],
      moved: [],
    })
  })

  it('decides both findings by the same alias predicate', () => {
    // An unrelated alias covers neither finding...
    const other = [{ from: '/elsewhere', to: '/company/about' }]
    expect(findings(other).moved).toHaveLength(1)
    expect(
      findings(other, { currentPages: [currentPages[0]] }).removed,
    ).toEqual(['/about.html'])
    // ...and either spelling of the old page — the served one the finding
    // reports, or the canonical one — covers both.
    for (const from of ['/about.html', '/about']) {
      const rules = [{ from, to: '/company/about' }]
      expect(findings(rules).moved).toEqual([])
      expect(
        findings(rules, { currentPages: [currentPages[0]] }).removed,
      ).toEqual([])
    }
  })

  it('falls back to the path comparison for a record written before ids', () => {
    // No `id` key anywhere: the same rename can only be seen as a removal, and
    // that is the answer this version of the record earns.
    const { moved, removed } = findings([], {
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/index.html', hash: 'aaa' },
          { buildTo: '../public/site/about.html', hash: 'bbb' },
        ],
      },
    })

    expect(moved).toEqual([])
    expect(removed).toEqual(['/about.html'])
  })

  it('never pairs a null id with anything, on either side', () => {
    // `null` means two different things — an inline template, a `generate:
    // false` page, a withdrawn default id — and none of them is an identity.
    // Pairing nulls would pair every idless page with every other.
    const { moved, removed } = findings([], {
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/index.html', hash: 'aaa', id: 'index' },
          { buildTo: '../public/site/about.html', hash: 'bbb', id: null },
        ],
      },
      currentPages: [
        { buildTo: 'public/site/index.html', id: 'index' },
        { buildTo: 'public/site/company/about.html', id: null },
      ],
    })

    expect(moved).toEqual([])
    expect(removed).toEqual(['/about.html'])
  })

  it('ignores a page the record wrote no bytes for, and one with no current page', () => {
    const { moved, removed } = findings([], {
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/draft.html', hash: null, id: 'draft' },
          { buildTo: '../public/site/gone.html', hash: 'ccc', id: 'gone' },
        ],
      },
    })

    expect(moved).toEqual([])
    // `draft` was never published; `gone` has no page with its id in this
    // build, so it is a removal and not a move.
    expect(removed).toEqual(['/gone.html'])
  })

  it('reports a moved directory index as served URLs, and an alias on the old one silences it', () => {
    // The extension-less shape every blog on this engine has: the page is a
    // folder with an `index.html` in it, and the address is the folder. Both
    // halves of the finding have to say so, or the fix it recommends is a path
    // no browser ever requested.
    const over = {
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/old/index.html', hash: 'aaa', id: 'post' },
        ],
      },
      currentPages: [{ buildTo: 'public/site/new/index.html', id: 'post' }],
    }

    expect(findings([], over).moved).toEqual([
      { id: 'post', from: '/old/', to: '/new/' },
    ])
    // And the alias the finding asks for is one the predicate accepts: the
    // served path and the canonical path are the same string for a directory
    // index, which is what makes the advice actionable.
    expect(findings([{ from: '/old/', to: '/new/' }], over).moved).toEqual([])
  })

  it('is sorted by from', () => {
    const { moved } = findings([], {
      previousPages: {
        buildDir: '../public/site',
        pages: [
          { buildTo: '../public/site/zebra.html', hash: 'a', id: 'z' },
          { buildTo: '../public/site/apple.html', hash: 'b', id: 'a' },
          { buildTo: '../public/site/mango.html', hash: 'c', id: 'm' },
        ],
      },
      currentPages: [
        { buildTo: 'public/site/moved/zebra.html', id: 'z' },
        { buildTo: 'public/site/moved/apple.html', id: 'a' },
        { buildTo: 'public/site/moved/mango.html', id: 'm' },
      ],
    })

    expect(moved.map((move) => move.from)).toEqual([
      '/apple.html',
      '/mango.html',
      '/zebra.html',
    ])
  })
})

describe('writeRedirects', () => {
  const build = async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-redirects-'))
    return { folders: { build: temp.replace(/\\/g, '/') } }
  }

  it('writes the file, and reports the rules it wrote', async () => {
    const config = await build()
    const result = await writeRedirects(
      [entry(`${config.folders.build}/about.html`, { aliases: ['/old'] })],
      { config, logger: silentLogger },
    )

    expect(result.status).toBe('written')
    expect(result.rules).toEqual([{ from: '/old', to: '/about' }])
    expect(
      await fs.readFile(`${config.folders.build}/_redirects`, 'utf8'),
    ).toBe('/old /about 301\n')
  })

  it('writes nothing for a site with no aliases, and leaves an existing file alone', async () => {
    const config = await build()
    const file = `${config.folders.build}/_redirects`
    // What a project that keeps its own `_redirects` in `src/assets/` has: the
    // asset copy put it there, and kiss must not touch it.
    await fs.outputFile(file, '/hand-written /x 301\n')

    const result = await writeRedirects(
      [entry(`${config.folders.build}/about.html`)],
      { config, logger: silentLogger },
    )

    expect(result.status).toBe('none')
    expect(await fs.readFile(file, 'utf8')).toBe('/hand-written /x 301\n')
  })

  it('leaves an existing host file alone under overwrite:false, and still writes the IR', async () => {
    const config = await build()
    const file = `${config.folders.build}/_redirects`
    await fs.outputFile(file, 'kept\n')

    const result = await writeRedirects(
      [entry(`${config.folders.build}/about.html`, { aliases: ['/old'] })],
      { config, logger: silentLogger, overwrite: false },
    )

    // The invariant this test has always guarded: a `_redirects` the project
    // keeps in `src/assets/` is never clobbered.
    expect(await fs.readFile(file, 'utf8')).toBe('kept\n')
    expect(result.rules).toEqual([{ from: '/old', to: '/about' }])
    // The IR did not exist, so `overwrite` has nothing to protect and it is
    // written: the rules are the one thing a site cannot reconstruct if this
    // build declines to say them. `status` reports the build as a whole, so
    // it is `written` rather than `skipped`.
    expect(result.status).toBe('written')
    expect(result.files).toEqual([`${config.folders.build}/redirects.json`])
    expect(
      JSON.parse(
        await fs.readFile(`${config.folders.build}/redirects.json`, 'utf8'),
      ),
    ).toEqual({
      version: 1,
      rules: [{ from: '/old', to: '/about', status: 301 }],
    })
  })

  it('skips everything, and says so, when both files already exist', async () => {
    const config = await build()
    await fs.outputFile(`${config.folders.build}/_redirects`, 'kept\n')
    await fs.outputFile(`${config.folders.build}/redirects.json`, 'kept too\n')

    const result = await writeRedirects(
      [entry(`${config.folders.build}/about.html`, { aliases: ['/old'] })],
      { config, logger: silentLogger, overwrite: false },
    )

    expect(result.status).toBe('skipped')
    expect(result.files).toEqual([])
  })
})

// `aliases` records a fact about the site — "this page used to answer /old" —
// and that fact is portable. `_redirects` is one vendor's encoding of it.
// Firebase reads a `redirects` array in firebase.json and ignores `_redirects`
// entirely; Vercel reads vercel.json. A site on either used to get a file its
// host never reads, while the report said the redirects were written.
describe('the redirect formats', () => {
  const rules = [
    { from: '/team', to: '/about' },
    { from: '/old', to: '/courses/' },
  ]

  it('renders the host-neutral IR, sorted, with an explicit status', () => {
    expect(JSON.parse(renderRedirectsJson(rules))).toEqual({
      version: 1,
      rules: [
        { from: '/old', to: '/courses/', status: 301 },
        { from: '/team', to: '/about', status: 301 },
      ],
    })
    // Sorted here as well as in `collectAliases`: two identical builds must
    // write identical bytes or a committed file churns in git.
    expect(renderRedirectsJson(rules)).toBe(
      renderRedirectsJson([...rules].reverse()),
    )
    expect(renderRedirectsJson(rules).endsWith('\n')).toBe(true)
  })

  it('renders a Firebase fragment, not a firebase.json', () => {
    // The fragment is the `redirects` array alone. A site's firebase.json
    // holds hosting targets, headers and rewrites — one real site keeps 227
    // redirects in it by hand — and a build step that rewrote that file is a
    // build step that can lose a site's deploy config.
    const payload = JSON.parse(renderFirebaseRedirects(rules))
    expect(Object.keys(payload)).toEqual(['redirects'])
    expect(payload.redirects).toEqual([
      { source: '/old', destination: '/courses/', type: 301 },
      { source: '/team', destination: '/about', type: 301 },
    ])
  })

  it('renders an Apache fragment of Redirect directives, not a .htaccess', () => {
    expect(renderHtaccessRedirects(rules)).toBe(
      ['Redirect 301 /old /courses/', 'Redirect 301 /team /about'].join('\n') +
        '\n',
    )
  })

  it('uses Redirect, not RewriteRule, so a dot in an alias is literal', () => {
    // `RewriteRule`'s left-hand side is a regex: `/news/2024/a.b.html` would
    // match `/news/2024/axbxhtml` too. mod_alias `Redirect` takes a literal
    // path prefix, which is what an alias is.
    expect(renderHtaccessRedirects([{ from: '/a.b.html', to: '/c' }])).toBe(
      'Redirect 301 /a.b.html /c\n',
    )
    expect(renderHtaccessRedirects([])).toBe('')
  })

  it('renders a Vercel fragment, with its permanent flag', () => {
    const payload = JSON.parse(renderVercelRedirects(rules))
    expect(Object.keys(payload)).toEqual(['redirects'])
    expect(payload.redirects).toEqual([
      { source: '/old', destination: '/courses/', permanent: true },
      { source: '/team', destination: '/about', permanent: true },
    ])
  })
})

describe('writeRedirects: format dispatch', () => {
  const build = async (redirects) => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-formats-'))
    return {
      folders: { build: temp.replace(/\\/g, '/') },
      links: { trailingSlash: true },
      redirects,
    }
  }
  const stack = (buildDir) => [
    entry(`${buildDir}/about.html`, { aliases: ['/old'] }),
  ]

  it('writes the IR beside _redirects under the default format', async () => {
    const config = await build({ format: 'netlify' })
    const result = await writeRedirects(stack(config.folders.build), {
      config,
      logger: silentLogger,
    })

    expect(result.format).toBe('netlify')
    expect(result.files).toEqual([
      `${config.folders.build}/redirects.json`,
      `${config.folders.build}/_redirects`,
    ])
    expect(
      await fs.readFile(`${config.folders.build}/_redirects`, 'utf8'),
    ).toBe('/old /about 301\n')
  })

  it('writes a Firebase fragment instead of _redirects', async () => {
    const config = await build({ format: 'firebase' })
    await writeRedirects(stack(config.folders.build), {
      config,
      logger: silentLogger,
    })

    // The file a Firebase site actually needs, and *not* the one it does not:
    // writing `_redirects` there was the silent no-op this format exists to end.
    expect(
      await fs.pathExists(`${config.folders.build}/redirects.firebase.json`),
    ).toBe(true)
    expect(await fs.pathExists(`${config.folders.build}/_redirects`)).toBe(
      false,
    )
  })

  it('writes an Apache fragment, never the live .htaccess', async () => {
    const config = await build({ format: 'htaccess' })
    await writeRedirects(stack(config.folders.build), {
      config,
      logger: silentLogger,
    })

    expect(
      await fs.readFile(`${config.folders.build}/redirects.htaccess`, 'utf8'),
    ).toBe('Redirect 301 /old /about\n')
    // The file Apache actually reads carries auth, rewrites and caching the
    // build knows nothing about. kiss does not write it.
    expect(await fs.pathExists(`${config.folders.build}/.htaccess`)).toBe(false)
  })

  it('writes only the IR under format:none', async () => {
    const config = await build({ format: 'none' })
    const result = await writeRedirects(stack(config.folders.build), {
      config,
      logger: silentLogger,
    })

    expect(result.files).toEqual([`${config.folders.build}/redirects.json`])
    expect(await fs.pathExists(`${config.folders.build}/_redirects`)).toBe(
      false,
    )
  })

  it('writes nothing at all when no page has an alias, whatever the format', async () => {
    // Not an empty IR either: a `_redirects` a project keeps in src/assets/
    // and copies into the build must be left exactly as it was.
    for (const format of [
      'netlify',
      'firebase',
      'vercel',
      'htaccess',
      'none',
    ]) {
      const config = await build({ format })
      const result = await writeRedirects(
        [entry(`${config.folders.build}/about.html`)],
        { config, logger: silentLogger },
      )
      expect(result.status).toBe('none')
      expect(result.files).toEqual([])
      expect(
        await fs.pathExists(`${config.folders.build}/redirects.json`),
      ).toBe(false)
      await fs.remove(temp)
      temp = null
    }
  })

  it('hands the resolved rules to a custom writer and writes what it returns', async () => {
    /** @type {any[]} */
    const seen = []
    const config = await build({
      format: (rules, context) => {
        seen.push({ rules, buildDir: context.buildDir })
        return {
          file: 'nginx.conf',
          contents: rules
            .map((r) => `rewrite ^${r.from}$ ${r.to} permanent;`)
            .join('\n'),
        }
      },
    })
    const result = await writeRedirects(stack(config.folders.build), {
      config,
      logger: silentLogger,
    })

    expect(seen[0].rules).toEqual([{ from: '/old', to: '/about' }])
    expect(seen[0].buildDir).toBe(config.folders.build)
    // `'custom'` rather than the function: a machine-readable report should
    // not carry a source-code detail.
    expect(result.format).toBe('custom')
    expect(
      await fs.readFile(`${config.folders.build}/nginx.conf`, 'utf8'),
    ).toBe('rewrite ^/old$ /about permanent;')
    // The IR is the contract, not a side effect of the Netlify format: a
    // custom writer gets it too.
    expect(await fs.pathExists(`${config.folders.build}/redirects.json`)).toBe(
      true,
    )
  })

  it('lets a writer that throws fail the build rather than fail silently', async () => {
    // The whole complaint that started this block was a redirect feature
    // reporting success while doing nothing. A writer that dies quietly would
    // be the same trap one level up, so the rejection propagates to the
    // caller, which pushes it onto `_failures`.
    const config = await build({
      format: () => {
        throw new Error('no credentials')
      },
    })
    await expect(
      writeRedirects(stack(config.folders.build), {
        config,
        logger: silentLogger,
      }),
    ).rejects.toThrow('no credentials')
  })

  it('refuses a writer path that escapes the build folder', async () => {
    // A redirect writer is site code running in a build. "Write any file on
    // this machine" is not the capability it asked for.
    for (const file of ['../escaped.conf', '/etc/nginx.conf', 'a/../../b.conf'])
      expect(() =>
        normaliseWriterOutput({ file, contents: 'x' }, '/build'),
      ).toThrow(/outside the build folder|absolute path/)
    expect(
      normaliseWriterOutput({ file: 'a/b.conf', contents: 'x' }, '/build'),
    ).toEqual([{ file: '/build/a/b.conf', contents: 'x' }])
    expect(normaliseWriterOutput(undefined, '/build')).toEqual([])
  })

  it('refuses a writer entry with no file or a non-string body', async () => {
    expect(() => normaliseWriterOutput({ contents: 'x' }, '/build')).toThrow(
      /no `file`/,
    )
    expect(() => normaliseWriterOutput({ file: 'a.conf' }, '/build')).toThrow(
      /non-string/,
    )
  })
})
