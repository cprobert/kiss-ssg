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
const assemble = (result) => {
  const hbs = Handlebars.create()
  hbs.registerHelper(layouts(hbs))
  hbs.registerPartial(
    result.layout.name.replace(/\.hbs$/, ''),
    result.layout.content,
  )
  for (const partial of result.partials)
    hbs.registerPartial(partial.name.replace(/\.hbs$/, ''), partial.content)
  return hbs.compile(result.page.content)({})
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
