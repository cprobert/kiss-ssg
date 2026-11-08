import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  DUPLICATE_LIMIT,
  auditCss,
  brotliSize,
  buildFindings,
  extractStyles,
  findDuplicateRules,
  formatCssAudit,
  hashText,
  inlineStyleBlockers,
  normaliseCss,
  parseCssArgs,
  removableShare,
  resolveCssTarget,
  resolveHref,
  runCss,
  styleDirective,
} from '../../lib/css-audit.js'

describe('parseCssArgs', () => {
  it('takes a folder and --out', () => {
    expect(parseCssArgs(['public', '--out', 'css.json'])).toEqual({
      target: 'public',
      out: 'css.json',
      help: false,
      error: null,
    })
  })

  it('answers --help before anything else', () => {
    expect(parseCssArgs(['--help']).help).toBe(true)
    expect(parseCssArgs(['-h', 'x', 'y']).help).toBe(true)
  })

  it.each([
    [[], /needs a build folder/],
    [['public', '--out'], /--out needs a value/],
    [['public', '--out', '--help'], /--out needs a value/],
    [['public', '--page', '/'], /unknown option: --page/],
    [['public', 'dist'], /one build folder at a time/],
  ])('refuses %j', (argv, message) => {
    expect(parseCssArgs(argv).error).toMatch(message)
  })
})

describe('resolveCssTarget', () => {
  const where = (kind) => ({
    cwd: '/site',
    isDirectory: () => kind === 'dir',
    exists: () => kind !== 'none',
  })

  it('resolves a folder against the cwd', () => {
    expect(resolveCssTarget('public', where('dir'))).toEqual({
      folder: path.resolve('/site', 'public'),
    })
  })

  it('refuses a file, saying to build and name the folder', () => {
    expect(resolveCssTarget('router.js', where('file')).error).toMatch(
      /is not a folder.*never runs the build/,
    )
  })

  it('refuses a path that does not exist', () => {
    expect(resolveCssTarget('nope', where('none')).error).toMatch(
      /does not exist/,
    )
  })
})

describe('extractStyles', () => {
  it('reads every link whose rel tokens include stylesheet', () => {
    const html = `
      <link rel="stylesheet" href="/css/a.css">
      <link rel="alternate stylesheet" href="b.css?v=1">
      <LINK REL=STYLESHEET HREF=c.css>
      <link rel="preload" as="style" href="d.css">
      <link rel="icon" href="e.css">
      <link rel="stylesheet">
      <link rel="stylesheet" href="f.css" title="a > b">`
    expect(extractStyles(html).links).toEqual([
      '/css/a.css',
      'b.css?v=1',
      'c.css',
      'f.css',
    ])
  })

  it('decodes entities in an href', () => {
    expect(
      extractStyles('<link rel=stylesheet href="x.css?a=1&amp;b=2">').links,
    ).toEqual(['x.css?a=1&b=2'])
  })

  it('reads inline blocks, leaving out kiss own data-kiss- blocks', () => {
    const html = `<style>.a{color:red}</style>
      <style data-kiss-consent-style>.kiss{}</style>
      <style media="print" data-kiss-other>.k{}</style>
      <style media="print">.b{}</style>`
    expect(extractStyles(html).inline).toEqual(['.a{color:red}', '.b{}'])
  })

  it('reads a data- attribute that is not kiss own', () => {
    expect(extractStyles('<style data-site>.a{}</style>').inline).toEqual([
      '.a{}',
    ])
  })

  it('leaves out a style or link inside a template, a script or a comment', () => {
    const html = `
      <template><style>.t{}</style><link rel=stylesheet href=t.css></template>
      <script>const s = '<style>.s{}</style><link rel=stylesheet href=s.css>'</script>
      <!-- <style>.c{}</style> <link rel=stylesheet href=c.css> -->
      <style>.real{}</style>`
    expect(extractStyles(html)).toEqual({
      links: [],
      inline: ['.real{}'],
    })
  })

  it('reads a style block as raw text up to its own closing tag', () => {
    const html =
      '<style>.a::after{content:"<link rel=stylesheet href=x.css>"}</style>'
    expect(extractStyles(html)).toEqual({
      links: [],
      inline: ['.a::after{content:"<link rel=stylesheet href=x.css>"}'],
    })
  })
})

describe('resolveHref', () => {
  it.each([
    ['/css/a.css', 'index.html', 'css/a.css'],
    ['/css/a.css', 'blog/post/index.html', 'css/a.css'],
    ['css/a.css', 'blog/index.html', 'blog/css/a.css'],
    ['../css/a.css', 'blog/index.html', 'css/a.css'],
    ['../../../css/a.css', 'blog/index.html', 'css/a.css'],
    ['./a.css?v=3#x', 'about.html', 'a.css'],
    ['/css/my%20site.css', 'index.html', 'css/my site.css'],
  ])('%s on %s is %s in the build', (href, page, expected) => {
    expect(resolveHref(href, page)).toEqual({ kind: 'local', path: expected })
  })

  it.each([
    [
      'https://fonts.googleapis.com/css2?family=Inter',
      'https://fonts.googleapis.com/css2?family=Inter',
    ],
    ['//cdn.example.com/a.css', 'http://cdn.example.com/a.css'],
    ['HTTP://cdn.example.com/b.css', 'http://cdn.example.com/b.css'],
  ])('%s is a third-party stylesheet', (href, url) => {
    expect(resolveHref(href, 'index.html')).toEqual({
      kind: 'third-party',
      url,
    })
  })

  it('skips any other scheme', () => {
    expect(resolveHref('data:text/css,.a{}', 'index.html')).toEqual({
      kind: 'skip',
    })
  })
})

describe('normaliseCss and hashText', () => {
  it('collapses whitespace so differently indented blocks are one', () => {
    const a = normaliseCss('\n  .a {\n    color: red;\n  }\n')
    const b = normaliseCss('.a { color: red; }')
    expect(a).toBe('.a { color: red; }')
    expect(hashText(a)).toBe(hashText(b))
    expect(hashText(a)).toMatch(/^[0-9a-f]{16}$/)
    expect(hashText('.b{}')).not.toBe(hashText(a))
  })
})

describe('brotliSize', () => {
  it('is the Brotli size at quality 11, smaller than the text', () => {
    const css = '.a{color:red}'.repeat(200)
    expect(brotliSize(css)).toBeGreaterThan(0)
    expect(brotliSize(css)).toBeLessThan(css.length / 10)
  })

  it('is quality 11, not the quicker levels', () => {
    const css = Array.from(
      { length: 300 },
      (_, i) => `.c${i}{margin:${i}px;color:#${(i * 4099).toString(16)}}`,
    ).join('\n')
    const at = (quality) =>
      zlib.brotliCompressSync(css, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality },
      }).length
    expect(at(1)).not.toBe(at(11))
    expect(brotliSize(css)).toBe(at(11))
  })
})

describe('removableShare', () => {
  it('is the share removed, to three places', () => {
    expect(removableShare(1000, 250)).toBe(0.75)
    expect(removableShare(3, 1)).toBe(0.667)
    expect(removableShare(100, 100)).toBe(0)
    expect(removableShare(0, 0)).toBe(0)
  })
})

describe('styleDirective and inlineStyleBlockers', () => {
  it('takes style-src-elem, then style-src, then default-src', () => {
    expect(
      styleDirective(
        "default-src 'self'; style-src 'self'; style-src-elem 'self' 'unsafe-inline'",
      ),
    ).toBe("style-src-elem 'self' 'unsafe-inline'")
    expect(styleDirective("default-src 'self';  style-src   'self'")).toBe(
      "style-src 'self'",
    )
    expect(styleDirective("default-src 'none'; img-src *")).toBe(
      "default-src 'none'",
    )
    expect(styleDirective("img-src 'self'")).toBeNull()
  })

  it('takes the first of two same-named directives', () => {
    expect(styleDirective("style-src 'self'; style-src 'unsafe-inline'")).toBe(
      "style-src 'self'",
    )
  })

  it('finds every CSP line whose style directive has no unsafe-inline', () => {
    const headers = `/*
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; style-src 'self'

/admin/*
  content-security-policy: default-src 'self'
/open/*
  Content-Security-Policy: style-src 'self' 'unsafe-inline'
/img/*
  Content-Security-Policy: img-src 'self'
`
    expect(inlineStyleBlockers(headers)).toEqual([
      "default-src 'self'",
      "style-src 'self'",
    ])
  })

  it('finds nothing in a file with no CSP', () => {
    expect(inlineStyleBlockers('/*\n  X-Frame-Options: DENY\n')).toEqual([])
  })
})

describe('findDuplicateRules', () => {
  it('finds a rule written out in two stylesheets, whitespace aside', () => {
    const result = findDuplicateRules([
      { path: 'a.css', css: '.card , .tile { color: red; margin:0 }' },
      { path: 'b.css', css: '.card,.tile{color:red;margin:0}' },
    ])
    expect(result.total).toBe(1)
    expect(result.listed).toEqual([
      { selector: '.card,.tile', context: null, files: ['a.css', 'b.css'] },
    ])
  })

  it('keeps the enclosing @media in the key, minified or formatted', () => {
    const result = findDuplicateRules([
      { path: 'a.css', css: '@media (min-width:600px){.a{color:rgb(0,0,0)}}' },
      { path: 'b.css', css: '.a{color:rgb(0,0,0)}' },
      {
        path: 'c.css',
        css: '@media (min-width: 600px) { .a { color: rgb(0, 0, 0) } }',
      },
      { path: 'd.css', css: '@media (min-width:900px){.a{color:rgb(0,0,0)}}' },
    ])
    expect(result.listed).toEqual([
      {
        selector: '.a',
        context: '@media (min-width:600px)',
        files: ['a.css', 'c.css'],
      },
    ])
  })

  it('does not take a descendant :hover for the same selector', () => {
    expect(
      findDuplicateRules([
        { path: 'a.css', css: '.a :hover{color:red}' },
        { path: 'b.css', css: '.a:hover{color:red}' },
      ]).total,
    ).toBe(0)
  })

  it('does not count different declarations or one stylesheet twice', () => {
    const result = findDuplicateRules([
      { path: 'a.css', css: '.a{color:red}.a{color:red}.b{color:red}' },
      { path: 'b.css', css: '.b{color:blue}.c{color:red !important}' },
      { path: 'c.css', css: '.c{color:red}' },
    ])
    expect(result.total).toBe(0)
  })

  it('ignores an empty rule', () => {
    expect(
      findDuplicateRules([
        { path: 'a.css', css: '.a{}' },
        { path: 'b.css', css: '.a{}' },
      ]).total,
    ).toBe(0)
  })

  it('caps the list and gives the total', () => {
    const css = Array.from({ length: 60 }, (_, i) => `.r${i}{color:red}`).join(
      '',
    )
    const result = findDuplicateRules([
      { path: 'a.css', css },
      { path: 'b.css', css },
    ])
    expect(result.total).toBe(60)
    expect(result.listed).toHaveLength(DUPLICATE_LIMIT)
  })

  it('reports a stylesheet it cannot parse and reads the rest', () => {
    const result = findDuplicateRules([
      { path: 'bad.css', css: '.a{color:red' },
      { path: 'b.css', css: '.b{color:red}' },
      { path: 'c.css', css: '.b{color:red}' },
    ])
    expect(result.errors.map((e) => e.path)).toEqual(['bad.css'])
    expect(result.total).toBe(1)
  })
})

describe('buildFindings', () => {
  const none = { total: 0, listed: [] }

  it('names a stylesheet one page links, only on a site of two or more pages', () => {
    const stylesheets = [
      { path: 'css/one.css', pages: ['about.html'] },
      { path: 'css/site.css', pages: ['about.html', 'index.html'] },
    ]
    expect(
      buildFindings({
        pages: 2,
        stylesheets,
        inline: [],
        duplicates: none,
        blockers: [],
      }),
    ).toEqual([
      {
        check: 'stylesheet-one-page',
        detail: 'css/one.css',
        pages: ['about.html'],
      },
    ])
    expect(
      buildFindings({
        pages: 1,
        stylesheets: [{ path: 'css/one.css', pages: ['index.html'] }],
        inline: [],
        duplicates: none,
        blockers: [],
      }),
    ).toEqual([])
  })

  it('names an inline block on two or more pages, quoting 60 characters', () => {
    const text = `.hero{${'x'.repeat(80)}}`
    const findings = buildFindings({
      pages: 4,
      stylesheets: [],
      inline: [
        { text, pages: ['d.html', 'c.html', 'b.html', 'a.html'] },
        { text: '.once{}', pages: ['a.html'] },
      ],
      duplicates: none,
      blockers: [],
    })
    expect(findings).toEqual([
      {
        check: 'inline-style-repeated',
        detail: `${text.slice(0, 60)}… (4 pages)`,
        pages: ['a.html', 'b.html', 'c.html'],
      },
    ])
  })

  it('names each duplicated rule with its files, and the total past the cap', () => {
    const findings = buildFindings({
      pages: 1,
      stylesheets: [],
      inline: [],
      duplicates: {
        total: 51,
        listed: [
          {
            selector: '.a',
            context: '@media print',
            files: ['a.css', 'b.css'],
          },
        ],
      },
      blockers: [],
    })
    expect(findings).toEqual([
      {
        check: 'rule-duplicated',
        detail: '51 duplicated rules in all; the first 1 are listed',
      },
      {
        check: 'rule-duplicated',
        detail: '@media print .a',
        files: ['a.css', 'b.css'],
      },
    ])
  })

  it('names a blocking CSP only when a page has an inline block', () => {
    const input = {
      pages: 2,
      stylesheets: [],
      duplicates: none,
      blockers: ["style-src 'self'"],
    }
    expect(buildFindings({ ...input, inline: [] })).toEqual([])
    expect(
      buildFindings({
        ...input,
        inline: [{ text: '.a{}', pages: ['b.html'] }],
      }),
    ).toEqual([
      {
        check: 'inline-style-blocked-by-csp',
        detail: "style-src 'self'",
        pages: ['b.html'],
      },
    ])
  })

  it('sorts by check, then detail', () => {
    const findings = buildFindings({
      pages: 3,
      stylesheets: [
        { path: 'z.css', pages: ['a.html'] },
        { path: 'b.css', pages: ['a.html'] },
      ],
      inline: [{ text: '.a{}', pages: ['a.html', 'b.html'] }],
      duplicates: {
        total: 1,
        listed: [{ selector: '.x', context: null, files: ['b.css', 'z.css'] }],
      },
      blockers: ["default-src 'self'"],
    })
    expect(findings.map((f) => `${f.check} ${f.detail}`)).toEqual([
      "inline-style-blocked-by-csp default-src 'self'",
      'inline-style-repeated .a{} (2 pages)',
      'rule-duplicated .x',
      'stylesheet-one-page b.css',
      'stylesheet-one-page z.css',
    ])
  })
})

describe('formatCssAudit', () => {
  it('prints the stylesheets table, the inline count and the findings', () => {
    const text = formatCssAudit({
      version: 1,
      pages: 3,
      stylesheets: [
        {
          path: 'css/site.css',
          pages: 3,
          missing: false,
          bytes: 4000,
          brotli: 2048,
          purged: { bytes: 1000, brotli: 512 },
          removable: 0.75,
          error: null,
        },
        {
          path: 'css/gone.css',
          pages: 1,
          missing: true,
          bytes: null,
          brotli: null,
          purged: null,
          removable: null,
          error: null,
        },
      ],
      thirdParty: [{ url: 'https://cdn.example.com/a.css', pages: 2 }],
      inline: [
        { hash: 'a', bytes: 4, pages: 2, paths: [], text: '.a{}' },
        { hash: 'b', bytes: 4, pages: 1, paths: [], text: '.b{}' },
      ],
      findings: [
        {
          check: 'stylesheet-one-page',
          detail: 'css/gone.css',
          pages: ['a.html'],
        },
      ],
    })
    expect(text).toBe(
      [
        'kiss-ssg css: 3 pages, 2 stylesheets, 1 third-party',
        '',
        'Stylesheet      KB br  Pages  Removable',
        'css/site.css      2.0      3        75%',
        'css/gone.css  missing      1          -',
        '',
        'Third-party: https://cdn.example.com/a.css (2 pages)',
        '',
        'Inline <style> blocks: 2 distinct, 1 on two or more pages',
        '',
        'Findings (1):',
        '  stylesheet-one-page  css/gone.css  [a.html]',
      ].join('\n'),
    )
  })

  it('says when there is nothing to find', () => {
    const text = formatCssAudit({
      version: 1,
      pages: 1,
      stylesheets: [],
      thirdParty: [],
      inline: [],
      findings: [],
    })
    expect(text).toContain('No same-origin stylesheets.')
    expect(text).toContain('Findings: none')
  })
})

describe('auditCss and runCss over a folder', () => {
  let temp = null
  afterEach(() => {
    if (temp) fs.rmSync(temp, { recursive: true, force: true })
    temp = null
  })
  const write = (rel, text) => {
    const file = path.join(temp, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }

  it('purges each stylesheet against the pages that link it and every script', async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-css-unit-'))
    write('index.html', '<link rel=stylesheet href=/a.css><p class=used>')
    write('other.html', '<p class=other>')
    write('js/app.mjs', "el.classList.add('fromscript')")
    write('node_modules/x/index.html', '<link rel=stylesheet href=/nm.css>')
    write('a.css', '.used{}.other{}.fromscript{}.never{}')
    const calls = []
    const audit = await auditCss(temp, {
      purge: async (css, content) => {
        calls.push(content)
        return css
      },
    })
    expect(audit.pages).toBe(2)
    expect(calls).toEqual([
      {
        html: ['<link rel=stylesheet href=/a.css><p class=used>'],
        scripts: ["el.classList.add('fromscript')"],
        safelist: [],
        reads: {
          tokens: expect.any(Map),
          classes: expect.any(Map),
          exact: expect.any(WeakMap),
        },
      },
    ])
    expect(audit.stylesheets.map((s) => s.path)).toEqual(['a.css'])
  })

  // Issue #78: the audit purges with the same `purgeCss`, so PurgeCSS's
  // default extractor counted every Tailwind class holding `/ [ ] . :` as
  // removable, and "Removable" read 29% on a site whose real saving was 11%.
  it('counts nothing removable when the page uses every class, / [ ] . : included', async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-css-unit-'))
    write(
      'index.html',
      '<link rel=stylesheet href=/site.css>' +
        '<button aria-expanded="false" class="bg-ink-900/80 min-h-[60vh] p-1.5 hover:bg-brand-700 aria-expanded:rotate-180">x</button>',
    )
    write(
      'site.css',
      String.raw`.bg-ink-900\/80{color:red}.min-h-\[60vh\]{min-height:60vh}.p-1\.5{padding:.375rem}.hover\:bg-brand-700:hover{color:blue}.aria-expanded\:rotate-180[aria-expanded=true]{rotate:180deg}`,
    )
    const audit = await auditCss(temp)
    const [sheet] = audit.stylesheets
    expect(sheet.error).toBeNull()
    expect(sheet.purged.bytes).toBe(sheet.bytes)
    expect(sheet.removable).toBe(0)
  })

  it('reports a link to a missing file without failing', async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-css-unit-'))
    write('index.html', '<link rel=stylesheet href=/gone.css>')
    const audit = await auditCss(temp)
    expect(audit.stylesheets).toEqual([
      {
        path: 'gone.css',
        pages: 1,
        missing: true,
        bytes: null,
        brotli: null,
        purged: null,
        removable: null,
        error: null,
      },
    ])
  })

  it('exits 2 on a usage error and on a target that is not a folder', async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-css-unit-'))
    write('router.js', '')
    expect((await runCss([], { cwd: temp })).code).toBe(2)
    const file = await runCss(['router.js'], { cwd: temp })
    expect(file.code).toBe(2)
    expect(file.err).toMatch(/is not a folder/)
    expect((await runCss(['nope'], { cwd: temp })).code).toBe(2)
    expect((await runCss(['--help'], { cwd: temp })).code).toBe(0)
  })
})
