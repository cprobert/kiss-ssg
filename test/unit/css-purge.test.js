import { describe, it, expect } from 'vitest'
import {
  attributeClasses,
  classTokens,
  purgeCss,
  purgeReads,
  resolvePurge,
} from '../../lib/css-purge.js'
import { createAssetManifest } from '../../lib/asset-manifest.js'

describe('resolvePurge', () => {
  it('is null for nothing, null and false', () => {
    expect(resolvePurge(undefined)).toBeNull()
    expect(resolvePurge(null)).toBeNull()
    expect(resolvePurge(false)).toBeNull()
  })

  it('fills in the defaults and drops a leading slash', () => {
    expect(resolvePurge({ files: ['/css/vendor.css'] })).toEqual({
      files: ['css/vendor.css'],
      safelist: [],
      scripts: true,
    })
  })

  it('keeps strings and RegExps in the safelist', () => {
    const safelist = ['show', /^modal/]
    expect(resolvePurge({ files: ['a.css'], safelist }).safelist).toEqual(
      safelist,
    )
  })

  it.each([
    [true, /must be null, false or/],
    [['a.css'], /must be null, false or/],
    [{ files: [] }, /files must be a non-empty list/],
    [{ files: 'a.css' }, /files must be a non-empty list/],
    [{ files: ['a.css'], safelist: [1] }, /safelist must be a list/],
    [{ files: ['a.css'], scripts: 'yes' }, /scripts must be true or false/],
  ])('refuses %j', (input, message) => {
    expect(() => resolvePurge(input)).toThrow(message)
  })
})

describe('purgeCss', () => {
  const css = '.a{color:red}.b{color:blue}.c{color:green}.d .e{margin:0}'

  it('keeps what the HTML uses, and drops the rest', async () => {
    const out = await purgeCss(css, {
      html: ['<p class="a">x</p>'],
      scripts: [],
      safelist: [],
    })
    expect(out).toContain('.a')
    expect(out).not.toContain('.b')
    expect(out).not.toContain('.c')
  })

  it('keeps a class a script names, and one the safelist names', async () => {
    const out = await purgeCss(css, {
      html: ['<p class="a">x</p>'],
      scripts: ['el.classList.add("b")'],
      safelist: [/^c$/],
    })
    expect(out).toContain('.b')
    expect(out).toContain('.c')
  })

  it('keeps every rule that names a safelisted class, string or RegExp', async () => {
    const out = await purgeCss(
      '.btn[data-size=xl]{padding:2rem}.nav .is-open{color:red}.gone{margin:0}',
      {
        html: ['<p class="btn">x</p>'],
        scripts: [],
        safelist: ['btn', /^is-/],
      },
    )
    expect(out).toContain('.btn[data-size=xl]')
    expect(out).toContain('.nav .is-open')
    expect(out).not.toContain('.gone')
  })
})

// Issue #78: PurgeCSS's default extractor, /[A-Za-z0-9_-]+/g, split a class
// such as `bg-ink-900/80` into `bg-ink-900` and `80`, so every Tailwind class
// holding `/ [ ] . :` (and every variant) was removed from a site that used it.
// Each row: the class as a page writes it, and its rule as Tailwind v4 emits it.
const TOKEN_CLASSES = [
  ['bg-ink-900/80', String.raw`.bg-ink-900\/80{color:red}`],
  ['min-h-[60vh]', String.raw`.min-h-\[60vh\]{min-height:60vh}`],
  ['p-1.5', String.raw`.p-1\.5{padding:.375rem}`],
  ['hover:bg-brand-700', String.raw`.hover\:bg-brand-700:hover{color:red}`],
  ['[&_p]:mb-6', String.raw`.\[\&_p\]\:mb-6 p{margin-bottom:1.5rem}`],
  [
    'max-h-[calc(100dvh-4.25rem)]',
    String.raw`.max-h-\[calc\(100dvh-4\.25rem\)\]{max-height:calc(100dvh - 4.25rem)}`,
  ],
  [
    'aria-expanded:rotate-180',
    String.raw`.aria-expanded\:rotate-180[aria-expanded=true]{rotate:180deg}`,
  ],
  [
    'group-open:rotate-180',
    String.raw`.group-open\:rotate-180:is(:where(.group):is([open]) *){rotate:180deg}`,
  ],
  [
    '[&[open]]:bg-white',
    String.raw`.\[\&\[open\]\]\:bg-white[open]{background:#fff}`,
  ],
]

describe('purgeCss keeps whole class tokens (#78)', () => {
  const css = TOKEN_CLASSES.map(([, rule]) => rule).join('\n')
  // The escaped selector, as it appears in the purged CSS.
  const selectorOf = (rule) => rule.slice(0, rule.indexOf('{'))

  it.each(TOKEN_CLASSES)('keeps %s when a page uses it', async (cls, rule) => {
    const out = await purgeCss(css, {
      html: [`<div class="group"><p class="${cls}">x</p></div>`],
      scripts: [],
      safelist: [],
    })
    expect(out).toContain(selectorOf(rule))
  })

  it('removes every one of them when no page or script uses it', async () => {
    const out = await purgeCss(css, {
      // The pieces the old extractor produced, without the whole classes.
      html: ['<p class="bg-ink-900 min-h- p-1 hover group">x</p>'],
      scripts: [],
      safelist: [],
    })
    for (const [, rule] of TOKEN_CLASSES)
      expect(out).not.toContain(selectorOf(rule))
  })

  it('keeps an ARIA state rule the markup does not yet hold (aria-expanded="false")', async () => {
    const out = await purgeCss(css, {
      html: [
        '<button aria-expanded="false" class="aria-expanded:rotate-180">x</button>',
      ],
      scripts: [],
      safelist: [],
    })
    expect(out).toContain(
      String.raw`.aria-expanded\:rotate-180[aria-expanded=true]`,
    )
  })

  it('keeps a class written in an unquoted attribute', async () => {
    const out = await purgeCss(css, {
      html: ['<p class=bg-ink-900/80>x</p>'],
      scripts: [],
      safelist: [],
    })
    expect(out).toContain(String.raw`.bg-ink-900\/80`)
  })

  it('reads the same tokens in a script string, inline script and noscript', async () => {
    const out = await purgeCss(css, {
      html: [
        `<script>el.className = 'min-h-[60vh]'</script>` +
          `<noscript><p class="p-1.5">x</p></noscript>`,
      ],
      scripts: [`btn.classList.toggle("aria-expanded:rotate-180")`],
      safelist: [],
    })
    expect(out).toContain(String.raw`.min-h-\[60vh\]`)
    expect(out).toContain(String.raw`.p-1\.5`)
    expect(out).toContain(String.raw`.aria-expanded\:rotate-180`)
    expect(out).not.toContain(String.raw`.bg-ink-900\/80`)
  })
})

describe('classTokens', () => {
  it('reads an entity-encoded class as the browser does', () => {
    expect(classTokens('<p class="[&amp;_p]:mb-6">')).toContain('[&_p]:mb-6')
  })
})

describe('attributeClasses', () => {
  it('reads quoted, unquoted and entity-encoded class attributes, once each', () => {
    expect(
      attributeClasses([
        `<p class="a  b"><i class='c'><b class=d>`,
        '<p class="a [&amp;_p]:mb-6 [&>svg]:size-4">',
      ]),
    ).toEqual(['a', 'b', 'c', 'd', '[&_p]:mb-6', '[&>svg]:size-4'])
  })

  it('does not take data-class or a class word in text', () => {
    expect(attributeClasses(['<p data-class="x">the class = y</p>'])).toEqual(
      [],
    )
  })
})

// The code review of the first slice (2026-11-08): classes the first
// tokeniser still cut, and rules the purge rightly removes.
describe('purgeCss after the review', () => {
  const purge = (css, html, scripts = []) =>
    purgeCss(css, { html: [html], scripts, safelist: [] })

  it("keeps a class with a quote or > inside its brackets: before:content-[''], [&>svg]:size-4", async () => {
    const css = String.raw`.before\:content-\[\'\'\]::before{content:''}.\[\&\>svg\]\:size-4>svg{width:1rem}`
    const out = await purge(
      css,
      `<div class="before:content-[''] [&>svg]:size-4"><svg></svg></div>`,
    )
    expect(out).toContain(String.raw`.before\:content-\[\'\'\]`)
    expect(out).toContain(String.raw`.\[\&\>svg\]\:size-4`)
  })

  it('reads the same bracketed classes in a script string', async () => {
    const out = await purge(
      String.raw`.\[\&\>svg\]\:size-4>svg{width:1rem}`,
      '<svg></svg>',
      ['el.classList.add("[&>svg]:size-4")'],
    )
    expect(out).toContain(String.raw`.\[\&\>svg\]\:size-4`)
  })

  it('keeps a class inside entity-encoded JSON in an attribute', async () => {
    const out = await purge(
      String.raw`.bg-ink-900\/80{color:red}`,
      '<div data-classes="{&quot;open&quot;:&quot;bg-ink-900/80&quot;}"></div>',
    )
    expect(out).toContain(String.raw`.bg-ink-900\/80`)
  })

  // The markup's classes reach PurgeCSS exactly, so how classTokens cuts the
  // text cannot lose one. A `>` outside brackets ends a token, and is inside
  // this class: legal in HTML and CSS, whatever framework wrote it.
  it('keeps any class written in a class attribute, however classTokens cuts it', async () => {
    const out = await purge(
      String.raw`.a\>b{color:red}`,
      '<p class="a>b">x</p>',
    )
    expect(out).toContain(String.raw`.a\>b`)
  })

  it.each([
    [
      '#sidebar .card, with no #sidebar',
      '#sidebar .card{color:red}',
      '<p class="card">x</p>',
    ],
    [
      'ul.menu, with no <ul>',
      'ul.menu{color:red}',
      '<div class="menu">x</div>',
    ],
    [
      '.card .title, with no .card',
      '.card .title{color:red}',
      '<h2 class="title">x</h2>',
    ],
  ])('still removes a rule no page matches: %s', async (_label, css, html) => {
    expect(await purge(css, html)).toBe('')
  })
})

describe('purgeReads', () => {
  it('reads each page once across the purges of one run, whatever list it arrives in', async () => {
    const reads = purgeReads()
    const a = '<p class="a">x</p>'
    const b = '<p class="b">y</p>'
    await purgeCss('.a{color:red}', {
      html: [a, b],
      scripts: [],
      safelist: [],
      reads,
    })
    const tokensAfterFirst = reads.tokens.get(a)
    await purgeCss('.b{color:red}', {
      html: [b, a],
      scripts: [],
      safelist: [],
      reads,
    })
    expect(reads.classes.size).toBe(2)
    expect(reads.tokens.get(a)).toBe(tokensAfterFirst)
  })
})

describe('classTokens, safely', () => {
  it('reads a token that looks like a prototype property as text', () => {
    expect(classTokens('&constructor;').join(' ')).not.toMatch(/native code/)
  })

  // The second review (2026-11-08): 20,000 `:` or `[` in a row took half a
  // second, and a run ten times longer about fifty. Linear now: 200,000
  // characters of each well inside the budget a page of text gets.
  it.each([
    ['colons', ':'.repeat(200_000)],
    ['open brackets', '['.repeat(200_000)],
    ['a[ repeated', 'a['.repeat(100_000)],
    ['colons then a letter', `${':'.repeat(200_000)}a`],
  ])('reads a long run of %s in linear time', (_label, text) => {
    const start = performance.now()
    classTokens(text)
    expect(performance.now() - start).toBeLessThan(250)
  })

  it('still trims a trailing : and keeps one nested bracket group', () => {
    const tokens = classTokens('hover: [&[open]]:bg-white')
    expect(tokens).toContain('hover')
    expect(tokens).not.toContain('hover:')
    expect(tokens).toContain('[&[open]]:bg-white')
  })

  it('splits only at the first = of an unquoted attribute, so a long bundle stays linear', () => {
    const tokens = classTokens('class=a=b=c x=1,y=2,z=3')
    expect(tokens).toContain('a=b=c')
    expect(tokens).not.toContain('b=c')
  })
})

describe('the asset manifest follows a purged stylesheet (retarget)', () => {
  it('moves the name and every copy that mapped it, and counts a URL change', () => {
    const manifest = createAssetManifest()
    manifest.reconcile('copy', new Map([['css/v.css', 'css/v.aaaaaaaa.css']]))
    const before = manifest.urlRevision
    manifest.retarget('css/v.css', 'css/v.bbbbbbbb.css')
    expect(manifest.lookup('css/v.css')).toBe('css/v.bbbbbbbb.css')
    expect(manifest.previous('copy', 'css/v.css')).toBe('css/v.bbbbbbbb.css')
    expect(manifest.urlRevision).toBe(before + 1)
  })

  it('does nothing for a name it does not hold', () => {
    const manifest = createAssetManifest()
    manifest.retarget('css/none.css', 'css/x.css')
    expect(manifest.lookup('css/none.css')).toBeNull()
  })
})
