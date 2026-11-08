import { describe, it, expect } from 'vitest'
import {
  classTokens,
  pageClasses,
  purgeCss,
  purgeLosses,
  resolvePurge,
  selectorClasses,
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

describe('pageClasses', () => {
  it('reads quoted, unquoted and entity-encoded class attributes, first page wins', () => {
    const used = pageClasses([
      { page: 'index.html', html: `<p class="a  b"><i class='c'><b class=d>` },
      { page: 'about/index.html', html: '<p class="a [&amp;_p]:mb-6">' },
    ])
    expect([...used]).toEqual([
      ['a', 'index.html'],
      ['b', 'index.html'],
      ['c', 'index.html'],
      ['d', 'index.html'],
      ['[&_p]:mb-6', 'about/index.html'],
    ])
  })

  it('does not take data-class or a class word in text', () => {
    const used = pageClasses([
      { page: 'i.html', html: '<p data-class="x">the class = y</p>' },
    ])
    expect([...used.keys()]).toEqual([])
  })
})

describe('selectorClasses', () => {
  it.each([
    ['.a .b:hover', ['a', 'b']],
    [String.raw`.bg-ink-900\/80`, ['bg-ink-900/80']],
    [String.raw`.min-h-\[60vh\]`, ['min-h-[60vh]']],
    [String.raw`.p-1\.5`, ['p-1.5']],
    [String.raw`.hover\:bg-brand-700:hover`, ['hover:bg-brand-700']],
    [String.raw`.\31 0`, ['10']],
    ['a[href$=".pdf"].doc', ['doc']],
    ['[data-x="a.b"] .c', ['c']],
    ['::backdrop', []],
    [':root', []],
  ])('%s → %j', (selector, classes) => {
    expect(selectorClasses(selector)).toEqual(classes)
  })
})

describe('purgeLosses (the guard)', () => {
  const run = async (css, html, scripts = []) => {
    const after = await purgeCss(css, { html: [html], scripts, safelist: [] })
    return purgeLosses({
      before: css,
      after,
      used: pageClasses([{ page: 'index.html', html }]),
      tokens: new Set([html, ...scripts].flatMap(classTokens)),
    })
  }

  it('names a class the page carries whose only rule was removed', async () => {
    // The page has `btn` but never `data-size="xl"`, so PurgeCSS removes it.
    const losses = await run(
      '.btn[data-size=xl]{padding:2rem}',
      '<p class="btn" data-size="l">x</p>',
    )
    expect(losses).toEqual([{ class: 'btn', page: 'index.html' }])
  })

  it('names the Tailwind classes the old extractor lost, if it ever returns', async () => {
    const css = String.raw`.bg-ink-900\/80{color:red}.p-1\.5{padding:1px}`
    const html = '<p class="bg-ink-900/80 p-1.5">x</p>'
    // `after` as PurgeCSS 8's default extractor left it: empty.
    const losses = await purgeLosses({
      before: css,
      after: '',
      used: pageClasses([{ page: 'index.html', html }]),
      tokens: new Set(classTokens(html)),
    })
    expect(losses.map((l) => l.class)).toEqual(['bg-ink-900/80', 'p-1.5'])
  })

  it('is silent for a selector rightly removed because another class is on no page', async () => {
    expect(
      await run('.card .title{color:red}', '<h2 class="title">x</h2>'),
    ).toEqual([])
  })

  it('is silent for a component that keeps any rule', async () => {
    expect(
      await run(
        '.btn{color:red}.btn[data-size=xl]{padding:2rem}',
        '<p class="btn">x</p>',
      ),
    ).toEqual([])
  })

  it('is silent for @property, @layer, @keyframes and pseudo-element-only rules', async () => {
    const css = [
      '@property --tw-rotate{syntax:"*";inherits:false}',
      '@layer theme{:root{--c:red}}',
      '@layer utilities{.p-4{padding:1rem}}',
      '@keyframes spin{from{rotate:0}to{rotate:1turn}}',
      '::backdrop{--tw-x:0}',
      '::file-selector-button{border:0}',
    ].join('\n')
    expect(await run(css, '<p class="p-4 spin">x</p>')).toEqual([])
  })

  it('is silent when the class is used and kept', async () => {
    expect(
      await run(
        String.raw`.aria-expanded\:rotate-180[aria-expanded=true]{rotate:180deg}`,
        '<button aria-expanded="false" class="aria-expanded:rotate-180">x</button>',
      ),
    ).toEqual([])
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
