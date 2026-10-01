import { describe, it, expect } from 'vitest'
import Handlebars from 'handlebars'
import layouts from 'handlebars-layouts'
import {
  attr,
  findExpressions,
  findRegions,
  findTag,
  nameRegions,
  parseHtml,
  regionKind,
  serializeNodes,
  splitDocument,
  suggestName,
} from '../../lib/html-split.js'

// Assembles a split back into one document the way kiss would: a per-instance
// Handlebars with handlebars-layouts, partials registered under the same
// `site/x` and `sections/x` names `partialNameFor` derives from the folders.
// `context` matters for the injection tests and nothing else: an escape test
// that renders against `{}` cannot fail, because there is nothing for a live
// expression to resolve to. Two of them passed that way before this argument
// existed.
const assemble = (result, context = {}) => {
  const hbs = Handlebars.create()
  hbs.registerHelper(layouts(hbs))
  hbs.registerPartial(
    result.layout.name.replace(/\.hbs$/, ''),
    result.layout.content,
  )
  for (const partial of result.partials)
    hbs.registerPartial(partial.name.replace(/\.hbs$/, ''), partial.content)
  return hbs.compile(result.page.content)(context)
}

// Comparing rendered HTML needs whitespace BETWEEN tags ignored (the split
// re-indents block structure on purpose) while whitespace INSIDE text is kept
// exactly — that is the half the conversion promises not to touch.
const normalise = (html) =>
  html
    .replace(/>\s+</g, '><')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s*\n\s*/g, '')

describe('parseHtml', () => {
  it('reads elements, text, comments and the doctype', () => {
    const nodes = parseHtml('<!doctype html><!-- hi --><p class="a">x</p>')
    expect(nodes.map((n) => n.type)).toEqual(['doctype', 'comment', 'element'])
    expect(nodes[2].tag).toBe('p')
    expect(nodes[2].children[0].text).toBe('x')
  })

  it('keeps attribute text exactly as written', () => {
    // Never re-serialised, so quoting, order and spacing survive — which is
    // what makes the assembly round trip byte-comparable.
    const nodes = parseHtml('<a  href=\'/x\'   data-n=3 class="b c">t</a>')
    expect(nodes[0].attrs).toBe('  href=\'/x\'   data-n=3 class="b c"')
    expect(attr(nodes[0], 'href')).toBe('/x')
    expect(attr(nodes[0], 'data-n')).toBe('3')
    expect(attr(nodes[0], 'class')).toBe('b c')
  })

  it('does not split a tag on a > inside an attribute value', () => {
    const nodes = parseHtml('<a title="a > b">t</a><p>after</p>')
    expect(nodes).toHaveLength(2)
    expect(nodes[1].tag).toBe('p')
  })

  it('closes a void element without swallowing what follows', () => {
    // `<img>` treated as open takes the rest of the document into it.
    const nodes = parseHtml('<div><img src="a.png"><p>after</p></div>')
    expect(nodes[0].children.map((n) => n.tag)).toEqual(['img', 'p'])
  })

  it('treats script content as raw text, not markup', () => {
    // `if (a<b)` is the canonical break: `<b` is not a tag.
    const nodes = parseHtml('<script>if (a<b) { x() }</script><p>after</p>')
    expect(nodes[0].children[0].text).toBe('if (a<b) { x() }')
    expect(nodes[1].tag).toBe('p')
  })

  it('ignores a close tag for something that is not open', () => {
    // A stray `</div>` must not close the real structure around it.
    const nodes = parseHtml('<section><p>a</p></div><p>b</p></section>')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children.filter((n) => n.type === 'element')).toHaveLength(
      2,
    )
  })

  it('handles a self-closing svg child', () => {
    const nodes = parseHtml('<svg><path d="M0 0"/><circle r="2"/></svg>')
    expect(nodes[0].children.map((n) => n.tag)).toEqual(['path', 'circle'])
  })
})

describe('serializeNodes', () => {
  it('indents element-only children', () => {
    expect(serializeNodes(parseHtml('<div><p></p><p></p></div>'))).toBe(
      '<div>\n  <p></p>\n  <p></p>\n</div>',
    )
  })

  it('emits an element with significant text verbatim on one line', () => {
    // The whole reason the output is structured at block level and untouched
    // inside a paragraph: these two spans render with a space between them.
    const html = '<p><span>a</span> <span>b</span></p>'
    expect(serializeNodes(parseHtml(html))).toBe(html)
  })

  it('round-trips a void element and a raw-text element', () => {
    expect(serializeNodes(parseHtml('<img src="a.png">'))).toBe(
      '<img src="a.png">',
    )
    expect(serializeNodes(parseHtml('<script>a<b</script>'))).toBe(
      '<script>a<b</script>',
    )
  })
})

describe('regions', () => {
  const page = `<!doctype html><html><head><title>t</title></head><body>
    <header class="site-header"><nav>n</nav></header>
    <main>
      <section id="hero"><h1>H</h1></section>
      <section class="trust-strip band"><p>T</p></section>
      <section><p>anonymous</p></section>
    </main>
    <footer>f</footer>
    <script src="/a.js"></script>
  </body></html>`

  it('unwraps main so the cut is not defeated by one wrapper', () => {
    const { regions, wrappedInMain } = findRegions(parseHtml(page))
    expect(wrappedInMain).toBe(true)
    expect(regions.map((r) => r.tag)).toEqual([
      'header',
      'section',
      'section',
      'section',
      'footer',
    ])
  })

  it('separates chrome from content', () => {
    const { regions } = findRegions(parseHtml(page))
    expect(regions.map((r) => r.kind)).toEqual([
      'chrome',
      'section',
      'section',
      'section',
      'chrome',
    ])
  })

  it('reads a div as chrome when its class says so', () => {
    expect(regionKind(parseHtml('<div class="site-header">x</div>')[0])).toBe(
      'chrome',
    )
    expect(regionKind(parseHtml('<div class="topbar">x</div>')[0])).toBe(
      'chrome',
    )
    expect(regionKind(parseHtml('<div class="hero">x</div>')[0])).toBe(
      'section',
    )
  })

  it('proposes a name from id, then class, then tag', () => {
    expect(
      suggestName(parseHtml('<section id="Hero Bit">x</section>')[0]),
    ).toBe('hero-bit')
    expect(suggestName(parseHtml('<section class="a b">x</section>')[0])).toBe(
      'a',
    )
    expect(suggestName(parseHtml('<section>x</section>')[0])).toBe('section')
  })

  it('takes caller names over proposals and keeps them unique', () => {
    const { regions } = findRegions(parseHtml(page))
    const named = nameRegions(regions, [null, 'hero', 'trust', 'band'])
    expect(named.map((r) => r.name)).toEqual([
      'site-header',
      'hero',
      'trust',
      'band',
      'footer',
    ])
  })

  it('numbers a repeated name rather than overwriting the partial', () => {
    const two = parseHtml(
      '<body><section class="band">a</section><section class="band">b</section></body>',
    )
    const { regions } = findRegions(two)
    expect(nameRegions(regions).map((r) => r.name)).toEqual(['band', 'band-2'])
  })

  it("carries each region's root classes, for the stylesheet split", () => {
    // The clean-room finding: `name` is what a region MEANS and `classes` is
    // what its markup is called, and `splitStylesheet` matches the second.
    // A page whose hero is `<section class="lede">` is the normal case, and
    // passing the names to the stylesheet matched nothing.
    const doc = parseHtml(
      '<body><header class="masthead bar">h</header><section class="lede">a</section><section>b</section></body>',
    )
    const { regions } = findRegions(doc)
    expect(regions.map((r) => r.classes)).toEqual([
      ['masthead', 'bar'],
      ['lede'],
      [],
    ])
    // And the spelling the docs now prescribe produces a usable list.
    expect(regions.flatMap((r) => r.classes)).toEqual([
      'masthead',
      'bar',
      'lede',
    ])
  })

  it('keeps classes through a rename', () => {
    const doc = parseHtml('<body><section class="lede">a</section></body>')
    const named = nameRegions(findRegions(doc).regions, ['hero'])
    expect(named[0].name).toBe('hero')
    expect(named[0].classes).toEqual(['lede'])
  })

  it('finds a tag anywhere in the tree', () => {
    expect(findTag(parseHtml(page), 'title').children[0].text).toBe('t')
    expect(findTag(parseHtml(page), 'nope')).toBeNull()
  })
})

describe('splitDocument', () => {
  const page = `<!doctype html><html lang="en"><head><title>t</title><style>.a{color:red}</style></head><body id="top">
    <header>H</header>
    <section class="hero"><h1>Hi</h1></section>
    <section class="pricing"><p>£5</p></section>
    <footer>F</footer>
    <script>console.log(1)</script>
  </body></html>`

  it('puts chrome in the layout and sections in the page view', () => {
    const result = splitDocument(page, {
      names: [null, 'hero', 'pricing', null],
    })
    expect(result.partials.map((p) => p.name)).toEqual([
      'site/header.hbs',
      'sections/hero.hbs',
      'sections/pricing.hbs',
      'site/footer.hbs',
    ])
    expect(result.layout.content).toContain('{{> "site/header"}}')
    expect(result.layout.content).toContain('{{> "site/footer"}}')
    expect(result.layout.content).toContain('{{#block "main"}}{{/block}}')
    // The page view is a list of partial calls and nothing else.
    expect(result.page.content).toContain('{{> "sections/hero"}}')
    expect(result.page.content).not.toContain('site/header')
  })

  it('keeps the html and body attributes', () => {
    const result = splitDocument(page)
    expect(result.layout.content).toContain('<html lang="en">')
    expect(result.layout.content).toContain('<body id="top">')
  })

  it('reports inline assets without removing them', () => {
    // Reported, not lifted. Lifting means choosing a filename, writing the file
    // and rewriting the tag — which the caller is doing anyway, because the CSS
    // has to go through splitStylesheet. Removing them here broke the assembly
    // round trip against a real page by losing its script tags outright.
    const result = splitDocument(page)
    expect(result.assets.styles).toEqual(['.a{color:red}'])
    expect(result.assets.scripts[0].content).toBe('console.log(1)')
    expect(result.layout.content).toContain('color:red')
  })

  it('keeps body-level script tags in the layout, before the scripts block', () => {
    // The data loss the live round trip found: `<script src>` is filtered out
    // of the regions, and nothing used to put it back.
    const withSrc = page.replace(
      '<script>console.log(1)</script>',
      '<script src="/a.js" defer></script><script>console.log(1)</script>',
    )
    const result = splitDocument(withSrc)
    expect(result.layout.content).toContain(
      '<script src="/a.js" defer></script>',
    )
    expect(result.layout.content).toContain('console.log(1)')
    expect(result.layout.content.indexOf('/a.js')).toBeLessThan(
      result.layout.content.indexOf('{{#block "scripts"}}'),
    )
  })

  it('reports what it cut', () => {
    const result = splitDocument(page)
    expect(result.stats).toEqual({ regions: 4, chrome: 2, sections: 2 })
  })
})

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------
//
// Everything above tests a part. This tests the promise: the layout, the
// partials and the page view, put back together through the same Handlebars
// setup kiss uses, reproduce the document that was split.

describe('assembly round trip', () => {
  const cases = {
    'a page with chrome, sections and inline text': `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>K9</title></head><body>
<header class="site-header"><nav class="nav"><a href="/">Home</a><a href="/about">About</a></nav></header>
<main>
<section class="hero"><span class="kicker">Merthyr Tydfil</span><h1>Dog training</h1><p>One-to-one <strong>behaviour</strong> support.</p><img src="/d.webp" alt="A dog"></section>
<section class="reviews"><blockquote>Brilliant</blockquote><footer>— Sam</footer></section>
</main>
<footer class="footer"><p>&copy; 2026</p></footer>
</body></html>`,
    'a page with no main wrapper': `<!doctype html><html><head><title>t</title></head><body>
<header>H</header><section class="a"><p>one</p></section><section class="b"><p>two</p></section><footer>F</footer>
</body></html>`,
    'inline elements separated by meaningful spaces': `<!doctype html><html><head><title>t</title></head><body>
<section class="s"><p><em>a</em> <em>b</em> <em>c</em></p></section>
</body></html>`,
    // Both of these were lost by an earlier shape of the module, and the live
    // round trip against k9solutions.uk is what found the scripts going missing.
    'a page with an inline stylesheet and body scripts': `<!doctype html><html><head><title>t</title><style>.a{color:red}</style></head><body>
<header>H</header><section class="s"><p>x</p></section>
<script src="/js/nav.js" defer="defer"></script><script>console.log(1)</script>
</body></html>`,
  }

  for (const [label, html] of Object.entries(cases))
    it(`reproduces ${label}`, () => {
      const result = splitDocument(html)
      expect(normalise(assemble(result))).toBe(normalise(html))
    })

  it('preserves the space between inline elements exactly', () => {
    // `normalise` collapses whitespace between tags, so it would NOT catch the
    // space between `<em>a</em>` and `<em>b</em>` going missing. Asserted
    // directly, because losing it is the most likely way this module silently
    // changes a page.
    const html = `<!doctype html><html><head><title>t</title></head><body><section class="s"><p><em>a</em> <em>b</em></p></section></body></html>`
    expect(assemble(splitDocument(html))).toContain('<em>a</em> <em>b</em>')
  })

  it('reproduces a region containing a self-closing svg icon', () => {
    const html = `<!doctype html><html><head><title>t</title></head><body><footer><svg viewBox="0 0 24 24"><path d="M0 0"/></svg></footer><section class="s"><p>x</p></section></body></html>`
    expect(normalise(assemble(splitDocument(html)))).toBe(normalise(html))
  })
})

// ---------------------------------------------------------------------------
// What a security review of the branch found
// ---------------------------------------------------------------------------
//
// Seven findings, every one re-derived here before it was fixed and every test
// below seen red against the unfixed module. Five were the invariant being
// false — the module said assembling gives back the document, and for these
// shapes it did not, silently. Two were the other half of the same fact: what
// this module emits is `.hbs`, so anything in a foreign document that looks
// like Handlebars BECOMES Handlebars.

describe('losslessness on shapes the first cut got wrong', () => {
  it('does not treat an apostrophe as an opening quote unless it follows =', () => {
    // `alt=don't` is one unquoted attribute value. Skipping to the "matching"
    // quote ran to the end of the document, so the whole page became one
    // opening tag and every element after it disappeared.
    const nodes = parseHtml("<img src=/a.png alt=don't><p>after</p>")
    expect(nodes).toHaveLength(2)
    expect(nodes[1].children[0].text).toBe('after')
  })

  it('ends a script only at a real close tag, not at a JS string', () => {
    // `"</scriptfoo"` is not a close tag — the spec needs whitespace, `/` or
    // `>` after the name. Ending there resumed scanning from inside the
    // script, and everything after it was lost with a green build.
    const html = `<!doctype html><html><head><title>t</title></head><body>
<section class="hero">hi</section>
<script>var s = "</scriptfoo";</script>
<footer class="site-footer">keepme</footer>
</body></html>`
    const result = splitDocument(html)
    expect(result.partials.map((p) => p.name)).toContain('site/site-footer.hbs')
    expect(assemble(result)).toContain('keepme')
  })

  it('keeps a script that sits inside main', () => {
    // Collected by nothing: filtered out of the regions as "an asset", and
    // invisible to the body-level script sweep because its parent was `main`.
    // The tag was deleted outright — subresource integrity and all.
    const html = `<!doctype html><html><head><title>t</title></head><body>
<main>
  <section class="hero">hi</section>
  <script src="https://cdn.example/lib.js" integrity="sha384-AAA"></script>
</main>
</body></html>`
    const result = splitDocument(html)
    expect(result.layout.content).toContain('cdn.example/lib.js')
    expect(result.layout.content).toContain('sha384-AAA')
    expect(normalise(assemble(result))).toBe(normalise(html))
  })

  it('leaves a leading body script where it was written', () => {
    // A bootstrap script written as the body's first child was re-emitted
    // last, so it ran after the page it was there to set up.
    const html = `<!doctype html><html><head><title>t</title></head><body>
<script nonce="abc">window.__BOOTSTRAP__ = 1</script>
<section class="hero">hi</section>
</body></html>`
    const layout = splitDocument(html).layout.content
    expect(layout.indexOf('__BOOTSTRAP__')).toBeLessThan(
      layout.indexOf('{{#block "main"}}'),
    )
  })

  it('keeps the head attributes and top-level body nodes', () => {
    const html = `<!doctype html><html><head prefix="og: http://ogp.me/ns#"><title>t</title></head><body><!-- build marker --><section class="hero">hi</section>trailing text</body></html>`
    const layout = splitDocument(html).layout.content
    expect(layout).toContain('<head prefix="og: http://ogp.me/ns#">')
    expect(layout).toContain('build marker')
    expect(layout).toContain('trailing text')
  })

  it('gives two regions proposing the same suffixed name different files', () => {
    // `hero`, `hero`, `hero-2`: the second is renamed `hero-2`, and the third
    // — whose own base is already `hero-2` — took it again. Two partials, one
    // filename, one region's markup gone.
    const html = `<!doctype html><html><head><title>t</title></head><body>
<section class="hero">ONE</section><section class="hero">TWO</section><section class="hero-2">THREE</section>
</body></html>`
    const names = splitDocument(html).partials.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('template syntax in a foreign document', () => {
  const hostile = `<!doctype html><html><head><title>t</title>
<meta name="x" content="{{config.secrets.apiKey}}"></head><body>
<section class="hero"><p>Hello {{ name }}</p></section>
</body></html>`

  it('reports every expression it found', () => {
    // An Alpine page and an injected one are identical at this layer, so the
    // module says what is there rather than deciding what it meant.
    const found = splitDocument(hostile).expressions
    expect(found).toContain('{{config.secrets.apiKey}}')
    expect(found).toContain('{{ name }}')
    expect(findExpressions(parseHtml('<p>none</p>'))).toEqual([])
  })

  it('escapes expressions by default, in text and in attributes', () => {
    const result = splitDocument(hostile)
    expect(result.layout.content).toContain('\\{{config.secrets.apiKey}}')
    expect(result.partials[0].content).toContain('\\{{ name }}')
    // The point of the escape: the rendered page says what the source said,
    // rather than whatever the build's config happens to hold.
    expect(assemble(result)).toContain('Hello {{ name }}')
    expect(assemble(result)).not.toContain('\\{{')
  })

  it('leaves them alone when the caller opts out', () => {
    const result = splitDocument(hostile, { escapeExpressions: false })
    expect(result.partials[0].content).toContain('<p>Hello {{ name }}</p>')
    expect(result.layout.content).not.toContain('\\{{')
  })

  it('round-trips a document carrying expressions', () => {
    expect(normalise(assemble(splitDocument(hostile)))).toBe(normalise(hostile))
  })
})

// ---------------------------------------------------------------------------
// What a SECOND security review found, after the first round of fixes
// ---------------------------------------------------------------------------
//
// Nine more, all re-derived locally before anything was changed and all nine
// reproduced. The lesson is in the shape of them rather than in any one: four
// were ways past the escape that the first round's own commit message claimed
// was complete, and two were the first round's own fix — "walk the stream so
// nothing is dropped" — not applied one level up, inside `<html>`. A fix
// verified only on the inputs that prompted it is a fix with a boundary
// nobody has looked over.

describe('ways past the expression escape', () => {
  const page = (inner) =>
    `<!doctype html><html><head><title>t</title></head><body>${inner}</body></html>`
  const ctx = { config: { secrets: { apiKey: 'LEAKED' } } }

  it('escapes the html, head, body and main attribute strings too', () => {
    // These four are the only attributes not emitted by `openingTag`, and
    // they were interpolated raw into the layout — so they bypassed the one
    // guard the module has, on the surface its own comment calls the one
    // that matters most.
    const html = `<!doctype html><html data-a="{{config.secrets.apiKey}}"><head data-b="{{config.secrets.apiKey}}"></head><body data-c="{{config.secrets.apiKey}}"><main data-d="{{config.secrets.apiKey}}"><section id="a">x</section></main></body></html>`
    expect(assemble(splitDocument(html), ctx)).not.toContain('LEAKED')
  })

  it('neutralises an expression a backslash in the source would un-escape', () => {
    // Handlebars has exactly ONE escape: `\{{`. A backslash already in the
    // document eats it, and no number of backslashes puts it back —
    // measured across runs of 0 to 5, two or more emit N-1 and evaluate. So
    // the braces go out as a character reference instead.
    const html = page(
      `<section id="a"><img src="/p?k=\\{{config.secrets.apiKey}}"></section>`,
    )
    const result = splitDocument(html)
    expect(assemble(result, ctx)).not.toContain('LEAKED')
    expect(result.warnings.join(' ')).toMatch(/preceded by a backslash/)
  })

  it('does not let two text nodes join into an expression', () => {
    // A stray close tag is dropped, which left the text either side of it as
    // two siblings that the printer joined with nothing — assembling a live
    // `{{…}}` out of two harmless halves. The source contains no `{{`, so
    // there was nothing for the escape to escape and `expressions` reported
    // an empty list beside an executable partial.
    const html = page(
      `<section id="a">Pricing{</span>{config.secrets.apiKey}}</section>`,
    )
    const result = splitDocument(html)
    expect(assemble(result, ctx)).not.toContain('LEAKED')
    expect(result.expressions.join(' ')).toContain('config.secrets.apiKey')
  })

  it('escapes the doctype on the fragment branch', () => {
    const html = `<!DOCTYPE html SYSTEM "{{config.secrets.apiKey}}"><body><section id="a">x</section></body>`
    expect(assemble(splitDocument(html), ctx)).not.toContain('LEAKED')
  })
})

describe('losslessness one level up the tree', () => {
  it('keeps a child of <html> that is neither head nor body', () => {
    // The same deletion the first round fixed inside the body, missed
    // outside it: the layout reached for `head` and `body` by name and
    // emitted a fixed skeleton, so everything else `<html>` held vanished.
    const html = `<!doctype html><html><head><title>t</title></head><!-- build:2026 --><body><section id="a">hi</section></body><script src="/boot.js" integrity="sha384-AAA"></script></html>`
    const layout = splitDocument(html).layout.content
    expect(layout).toContain('sha384-AAA')
    expect(layout).toContain('build:2026')
  })

  it('handles a document with no <body> without duplicating it', () => {
    // `<body>` is optional and `parseHtml` does not imply one, so the root's
    // only element was `<html>` itself — which became a single region
    // holding the whole document, wrapped in a synthesised body with a
    // second doctype inside it.
    const html = `<!doctype html><html><head><title>t</title></head><section id="hero">hi</section><footer>f</footer></html>`
    const result = splitDocument(html)
    expect(result.partials.map((p) => p.name)).toEqual([
      'sections/hero.hbs',
      'site/footer.hbs',
    ])
    expect(assemble(result).match(/<html/g) ?? []).toHaveLength(1)
  })

  it('does not nest a second <main> inside the first', () => {
    // Only one was unwrapped; the other became a region, which renders at
    // the content block — i.e. inside the `<main>` the layout rebuilt.
    const html = `<!doctype html><html><head><title>t</title></head><body><main><section id="a">A</section></main><main><section id="b">B</section></main></body></html>`
    expect(normalise(assemble(splitDocument(html)))).toBe(normalise(html))
  })

  it('keeps the case of a camelCase SVG tag', () => {
    // Inside `<svg>` the document is foreign content and case is
    // significant. A browser corrects it back, so nothing renders wrong —
    // but the bytes differ, and the bytes are what this module promises.
    const html = `<!doctype html><html><head><title>t</title></head><body><section id="a"><svg><linearGradient id="g"></linearGradient><clipPath id="c"></clipPath></svg></section></body></html>`
    const out = assemble(splitDocument(html))
    expect(out).toContain('<linearGradient id="g">')
    expect(out).toContain('<clipPath id="c">')
  })
})

describe('warnings — what the conversion could not do losslessly', () => {
  it('names a node that had to move out from between two sections', () => {
    // The second stated exception, and deliberately not fixed: chrome lives
    // in the layout and sections render at one content block, so a node
    // written between two sections has nowhere to go but after them. It has
    // done this since the module was written. What changed is only that it
    // is no longer silent.
    const html = `<!doctype html><html><head><title>t</title></head><body><section id="a">A</section><nav>N</nav><section id="b">B</section></body></html>`
    const { warnings } = splitDocument(html)
    expect(warnings.join(' ')).toMatch(/between two sections/)
    expect(warnings.join(' ')).toContain('<nav>')
  })

  it('says nothing about an ordinary page', () => {
    // A warning that fires on the normal shape is noise, and noise is how a
    // real one gets skipped.
    const html = `<!doctype html><html><head><title>t</title></head><body><header>H</header><section id="a">A</section><section id="b">B</section><footer>F</footer></body></html>`
    expect(splitDocument(html).warnings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The third review
// ---------------------------------------------------------------------------
//
// Ten findings from a review run after the two security rounds, eight of them
// probed against the branch. The first is the same class as the four the
// second round found: a surface the escape was never applied to.

describe('the third review — the escape and the tag name', () => {
  const page = (inner) =>
    `<!doctype html><html><head><title>t</title></head><body>${inner}</body></html>`
  const ctx = { config: { secrets: { apiKey: 'LEAKED' } } }

  it('escapes an expression written into a tag name', () => {
    // The tag name was the one piece of an element nothing escaped:
    // `openingTag` escaped the attributes and wrote the name raw, and every
    // closing tag was written raw too.
    const html = page(
      `<section class="a"><x{{config.secrets.apiKey}}>hi</x{{config.secrets.apiKey}}></section>`,
    )
    const result = splitDocument(html)
    expect(assemble(result, ctx)).not.toContain('LEAKED')
    expect(result.expressions.join(' ')).toContain('config.secrets.apiKey')
  })

  it('escapes an expression split between the tag name and its attributes', () => {
    // The name ends at the first space, so `<x{{lookup config 'k'}}>` put
    // `x{{lookup` in the name and the rest in the attributes — neither half
    // holding a `{{` that the attribute escape could see.
    const html = page(
      `<section class="a"><x{{lookup config.secrets 'apiKey'}}>hi</section>`,
    )
    expect(assemble(splitDocument(html), ctx)).not.toContain('LEAKED')
  })
})

describe('the third review — legal HTML the split broke', () => {
  const page = (inner, head = '') =>
    `<!doctype html><html><head><title>t</title>${head}</head><body>${inner}</body></html>`

  it('treats a slash on a non-void HTML element the way a browser does — as nothing', () => {
    // `<script src="a.js" />` is NOT self-closing in HTML. Treating it as
    // closed dropped the real `</script>` as a stray, and a browser then read
    // the rest of the page as script.
    const html = page(
      '<section id="a">A</section>',
      '<script src="a.js" /></script>',
    )
    const result = splitDocument(html)
    expect(result.layout.content).toContain('<script src="a.js" /></script>')
    expect(normalise(assemble(result))).toBe(normalise(html))
  })

  it('keeps self-closing inside svg, where it is honoured', () => {
    const html = page(
      '<section id="a"><svg><path d="M0 0"/><circle r="1" /></svg></section>',
    )
    const out = assemble(splitDocument(html))
    expect(out).toContain('<path d="M0 0"/>')
    expect(out).toContain('<circle r="1" />')
    expect(normalise(out)).toBe(normalise(html))
  })

  it('reads a < that does not start a tag as text', () => {
    // `Price < 10` is text in HTML. It was parsed as an element with an empty
    // name, pushed open, and closed with an invented `</>`.
    const html = page(
      '<section id="a"><p>Price < 10 today</p><p>b</p></section>',
    )
    const result = splitDocument(html)
    expect(result.partials[0].content).not.toContain('</>')
    expect(normalise(assemble(result))).toBe(normalise(html))
  })

  it('keeps every root node of a document with head and body but no <html>', () => {
    // `<html>` is optional. The no-`<html>` branch emitted only the doctype and
    // a rebuilt skeleton, so a script after `</body>` was deleted — the same
    // silent deletion the `<html>` branch had been fixed for.
    const html = `<!doctype html><head><title>t</title></head><body><section id="a">A</section></body><script src="late.js"></script>`
    const result = splitDocument(html)
    expect(result.layout.content).toContain('late.js')
    expect(result.layout.content).not.toContain('<html')
  })

  it('keeps the slash on a void element written self-closing', () => {
    // The commonest void spelling in agent-written HTML.
    const html = page(
      '<section id="a"><img src="a.png"/><br /></section>',
      '<meta charset="utf-8" />',
    )
    const out = assemble(splitDocument(html))
    expect(out).toContain('<meta charset="utf-8" />')
    expect(out).toContain('<img src="a.png"/>')
    expect(out).toContain('<br />')
  })

  it('does not invent a closing tag the document never wrote', () => {
    // An element closed by its parent rather than by its own close tag is
    // written back the same way, so the bytes still match.
    const html = page('<section id="a"><ul><li>one<li>two</ul></section>')
    expect(normalise(assemble(splitDocument(html)))).toBe(normalise(html))
  })
})

describe('the third review — what goes where', () => {
  const page = (inner) =>
    `<!doctype html><html><head><title>t</title></head><body>${inner}</body></html>`

  it('does not read a content class that merely contains a chrome word as chrome', () => {
    // `\b` matches at a hyphen, so `hero-banner` and `card-header` were
    // furniture and moved into every page's layout.
    for (const cls of [
      'hero-banner',
      'cta-banner',
      'page-header',
      'card-header',
      'nav-tabs',
    ])
      expect(regionKind(parseHtml(`<div class="${cls}"></div>`)[0])).toBe(
        'section',
      )
    for (const cls of [
      'site-header',
      'header',
      'navbar',
      'topbar',
      'site-footer',
    ])
      expect(regionKind(parseHtml(`<div class="x ${cls}"></div>`)[0])).toBe(
        'chrome',
      )
    expect(regionKind(parseHtml('<div role="banner"></div>')[0])).toBe('chrome')
  })

  it('reports inline assets in a document with no <body>', () => {
    // `collect()` walked `<body>` and nothing else, so with none, nothing was
    // reported — and a top-level `<style>` became a section.
    const html = `<html><head></head><section class="a">A</section><style>.a{color:red}</style><script>go()</script></html>`
    const result = splitDocument(html)
    expect(result.assets.styles).toEqual(['.a{color:red}'])
    expect(result.assets.scripts.map((s) => s.content)).toEqual(['go()'])
    expect(result.partials.map((p) => p.name)).toEqual(['sections/a.hbs'])
  })

  it('does not make a body-level style, template or noscript a region', () => {
    const html = page(
      '<style>.a{}</style><section id="a">A</section><noscript>n</noscript><template><p>t</p></template>',
    )
    expect(splitDocument(html).partials.map((p) => p.name)).toEqual([
      'sections/a.hbs',
    ])
  })

  it('warns about a script moved out from between two sections', () => {
    // Moved like every other interleaved node, and the one whose position
    // changes behaviour: it now runs after the second section exists.
    const html = page(
      '<section id="a">A</section><script>x()</script><section id="b">B</section>',
    )
    const { warnings } = splitDocument(html)
    expect(warnings.join(' ')).toMatch(/between two sections/)
    expect(warnings.join(' ')).toContain('<script>')
  })

  it("reports each inline script's attributes, so a module is not lifted as a classic script", () => {
    const html = page(
      '<section id="a">A</section><script type="module">import x from "./x.js"</script><script type="application/ld+json">{"a":1}</script>',
    )
    const { scripts } = splitDocument(html).assets
    expect(scripts.map((s) => s.type)).toEqual([
      'module',
      'application/ld+json',
    ])
    expect(scripts[0].attrs).toBe(' type="module"')
    expect(scripts[0]).not.toHaveProperty('src')
  })
})

describe('sections on both sides of <main>', () => {
  // Codex review: unwrapping `<main>` while sections also sit outside it put
  // every section at one content block, so they crossed the boundary — an
  // outside section was pulled into `<main>`, or an inside one pushed out of
  // it. That changes the landmark and every `main > section` selector.
  const page = (inner) =>
    `<!doctype html><html><head><title>t</title></head><body>${inner}</body></html>`

  it('keeps a section before <main> outside it', () => {
    const html = page(
      '<section id="before">Before</section><main><section id="inside">Inside</section></main>',
    )
    expect(normalise(assemble(splitDocument(html)))).toBe(normalise(html))
  })

  it('keeps a section after <main> outside it', () => {
    const html = page(
      '<main><section id="inside">Inside</section></main><section id="after">After</section>',
    )
    expect(normalise(assemble(splitDocument(html)))).toBe(normalise(html))
  })

  it('still unwraps <main> when every section is inside it', () => {
    const html = page(
      '<header>H</header><main><section id="a">A</section><section id="b">B</section></main><footer>F</footer>',
    )
    const result = splitDocument(html)
    expect(result.partials.map((p) => p.name)).toContain('sections/a.hbs')
    expect(normalise(assemble(result))).toBe(normalise(html))
  })
})
