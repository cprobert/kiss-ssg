import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  classNames,
  formatNodes,
  parseStylesheet,
  sectionFor,
  segmentNodes,
  splitStylesheet,
} from '../../lib/css-split.js'
import { compileFile, clearSassCache, loadSass } from '../../lib/sass.js'

// The ORIGINAL is compiled as plain CSS, never as SCSS. It is a stylesheet a
// browser loaded, so CSS is what it means; compiling it as SCSS too would make
// both sides of the comparison read Sass syntax the same wrong way, which is
// how `content:"#{1+1}"` turning into `"2"` passed (Codex review, 2026-10-01).
const compileCss = (css) =>
  loadSass().compileString(css, { syntax: 'css', style: 'compressed' }).css

let temp
afterEach(async () => {
  if (temp) await fs.remove(temp)
  temp = null
  clearSassCache()
})

// Writes the split to disk so dart-sass resolves the `@use` graph for real.
// Compiling the entry from a string would not: `@use 'hero'` needs a file.
const compileSplit = async (result) => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-css-'))
  for (const p of [result.entry, ...result.partials])
    await fs.outputFile(path.join(temp, p.name), p.content)
  return compileFile(path.join(temp, result.entry.name), {
    style: 'compressed',
  })
}

describe('parseStylesheet', () => {
  it('reads rules, declarations, at-rules and comments', () => {
    const nodes = parseStylesheet(
      '/* top */ @import "a.css"; .x { color: red; } @media screen { .y { top: 0 } }',
    )
    expect(nodes.map((n) => n.type)).toEqual(['comment', 'at', 'rule', 'at'])
    expect(nodes[1].children).toBeNull()
    expect(nodes[2].children[0]).toEqual({
      type: 'decl',
      prop: 'color',
      value: 'red',
    })
    // The media block's contents parse as ordinary rules, one level down.
    expect(nodes[3].children[0].prelude).toBe('.y')
  })

  it('does not treat a brace inside a string or comment as structure', () => {
    // The two inputs that break every naive brace counter. The second is
    // everywhere in minified CSS.
    const nodes = parseStylesheet(
      '.a { content: "}"; color: red } /* } */ .b { top: 0 }',
    )
    expect(nodes.map((n) => n.type)).toEqual(['rule', 'comment', 'rule'])
    expect(nodes[0].children).toHaveLength(2)
    expect(nodes[2].prelude).toBe('.b')
  })

  it('keeps a semicolon inside url() out of the declaration split', () => {
    // A data URI for an inline SVG carries both `;` and `:`.
    const nodes = parseStylesheet(
      '.a { background: url(data:image/svg+xml;base64,AAA=); color: red }',
    )
    expect(nodes[0].children).toHaveLength(2)
    expect(nodes[0].children[0].value).toBe(
      'url(data:image/svg+xml;base64,AAA=)',
    )
  })

  it('splits a declaration on its first colon only', () => {
    const nodes = parseStylesheet('.a { background: url(http://e.com/i.png) }')
    expect(nodes[0].children[0]).toEqual({
      type: 'decl',
      prop: 'background',
      value: 'url(http://e.com/i.png)',
    })
  })

  it('accepts a final declaration with no semicolon', () => {
    const nodes = parseStylesheet('.a { color: red }')
    expect(nodes[0].children).toEqual([
      { type: 'decl', prop: 'color', value: 'red' },
    ])
  })
})

describe('formatNodes', () => {
  it('expands a minified rule and indents the block', () => {
    expect(formatNodes(parseStylesheet('.a{color:red;top:0}'))).toBe(
      '.a {\n  color: red;\n  top: 0;\n}\n',
    )
  })

  it('puts each selector of a list on its own line', () => {
    // Minified CSS routinely carries eight selectors on one line; a reviewer
    // reading a diff has to be able to see which one moved.
    expect(formatNodes(parseStylesheet('.a,.b,.c{top:0}'))).toBe(
      '.a,\n.b,\n.c {\n  top: 0;\n}\n',
    )
  })

  it('nests an at-rule block', () => {
    expect(
      formatNodes(parseStylesheet('@media(max-width:9px){.a{top:0}}')),
    ).toBe('@media(max-width:9px) {\n  .a {\n    top: 0;\n  }\n}\n')
  })
})

describe('sectionFor', () => {
  it('matches a class equal to, or prefixed by, the section name', () => {
    expect(sectionFor('.hero', ['hero'])).toBe('hero')
    expect(sectionFor('.hero-copy .btn', ['hero'])).toBe('hero')
    expect(sectionFor('.footer', ['hero'])).toBeNull()
  })

  it('prefers the longest section name when both would match', () => {
    // `trust` would otherwise swallow every `trust-strip` rule, and a real
    // section list carries both shapes.
    expect(sectionFor('.trust-strip', ['trust', 'trust-strip'])).toBe(
      'trust-strip',
    )
  })

  it('reads every class in the selector, not just the first', () => {
    expect(classNames('.a .b, .c')).toEqual(['a', 'b', 'c'])
    expect(sectionFor('.wrap .hero-photo', ['hero'])).toBe('hero')
  })
})

describe('segmentNodes', () => {
  it('cuts contiguous runs and never reorders', () => {
    const nodes = parseStylesheet(
      '.hero{a:1}.hero-copy{a:1}.footer{a:1}.hero-photo{a:1}',
    )
    const segments = segmentNodes(nodes, ['hero', 'footer'])
    // Four rules, three runs — the second `hero` run stays where it was found.
    expect(segments.map((s) => s.name)).toEqual(['hero', 'footer', 'hero'])
    expect(segments.map((s) => s.nodes.length)).toEqual([2, 1, 1])
  })

  it('keeps an unmatched rule with the run already open', () => {
    // This is what stops the output being a scatter of one-rule files.
    const nodes = parseStylesheet('.hero{a:1}h1{a:1}span{a:1}.footer{a:1}')
    const segments = segmentNodes(nodes, ['hero', 'footer'])
    expect(segments.map((s) => s.name)).toEqual(['hero', 'footer'])
    expect(segments[0].nodes).toHaveLength(3)
  })

  it('opens with base when nothing has matched yet', () => {
    const nodes = parseStylesheet(':root{--a:1}body{margin:0}.hero{a:1}')
    expect(segmentNodes(nodes, ['hero']).map((s) => s.name)).toEqual([
      'base',
      'hero',
    ])
  })

  it('sends a media block touching several sections to responsive', () => {
    const nodes = parseStylesheet(
      '.hero{a:1}@media(max-width:9px){.hero{a:1}.footer{a:1}}',
    )
    expect(segmentNodes(nodes, ['hero', 'footer']).map((s) => s.name)).toEqual([
      'hero',
      'responsive',
    ])
  })

  it('keeps a single-section media block beside its section', () => {
    const nodes = parseStylesheet('.hero{a:1}@media(max-width:9px){.hero{a:1}}')
    expect(segmentNodes(nodes, ['hero', 'footer']).map((s) => s.name)).toEqual([
      'hero',
    ])
  })

  it('attaches a banner comment to the run it introduces', () => {
    const nodes = parseStylesheet('.hero{a:1}/* Footer */.footer{a:1}')
    const segments = segmentNodes(nodes, ['hero', 'footer'])
    expect(segments).toHaveLength(2)
    expect(segments[0].nodes.at(-1).type).toBe('comment')
  })

  it('routes @font-face to its own partial', () => {
    const nodes = parseStylesheet('@font-face{src:url(a.woff2)}.hero{a:1}')
    expect(segmentNodes(nodes, ['hero']).map((s) => s.name)).toEqual([
      'fonts',
      'hero',
    ])
  })
})

describe('splitStylesheet', () => {
  // These fixtures are one rule per section, which the default `minNodes` would
  // fold into a single file — correctly, and not what is under test here. They
  // pass `minNodes: 1` so the cut itself is what is being asserted; coalescing
  // has its own block below.
  it('writes an entry of @use lines in cut order', () => {
    const result = splitStylesheet('.hero{a:1}.footer{a:1}', {
      sections: ['hero', 'footer'],
      minNodes: 1,
    })
    expect(result.entry.name).toBe('site.scss')
    expect(result.entry.content).toBe("@use 'hero';\n@use 'footer';\n")
    expect(result.partials.map((p) => p.name)).toEqual([
      '_hero.scss',
      '_footer.scss',
    ])
  })

  it('numbers only the repeat when a section recurs', () => {
    const result = splitStylesheet('.hero{a:1}.footer{a:1}.hero{b:2}', {
      sections: ['hero', 'footer'],
      minNodes: 1,
    })
    expect(result.partials.map((p) => p.name)).toEqual([
      '_hero.scss',
      '_footer.scss',
      '_hero-2.scss',
    ])
  })

  it('reports stats a caller can assert on', () => {
    const result = splitStylesheet('.hero{a:1}', { sections: ['hero'] })
    expect(result.stats.segments).toBe(1)
    expect(result.stats.nodes).toBe(1)
    expect(result.stats.bytesIn).toBe(10)
  })
})

describe('coalescing short runs', () => {
  // Found by running the splitter on the real precedent rather than on
  // fixtures: a section list pitched at element granularity cut 14KB into 51
  // partials, several of them one rule. Folding a short run into its neighbour
  // is the only reshaping available that cannot move the cascade, because the
  // two are already adjacent.
  const css =
    '.hero{a:1}.hero{b:1}.hero{c:1}.x{a:1}.footer{a:1}.footer{b:1}.footer{c:1}'

  it('folds a run shorter than minNodes into the one before it', () => {
    const result = splitStylesheet(css, {
      sections: ['hero', 'footer', 'x'],
      minNodes: 3,
    })
    // `.x` is a single rule between two three-rule runs: it joins `hero`.
    expect(result.partials.map((p) => p.name)).toEqual([
      '_hero.scss',
      '_footer.scss',
    ])
    expect(result.partials[0].content).toContain('.x')
  })

  it('gives a short leading run the name of what follows it', () => {
    // Nothing precedes it, so folding backwards is not available — and leaving
    // a one-rule `_base.scss` at the top is the fragmentation this prevents.
    const result = splitStylesheet('.x{a:1}.hero{a:1}.hero{b:1}.hero{c:1}', {
      sections: ['hero', 'x'],
      minNodes: 3,
    })
    expect(result.partials.map((p) => p.name)).toEqual(['_hero.scss'])
    expect(result.partials[0].content).toContain('.x')
  })

  it('still compiles to the same CSS after coalescing', async () => {
    // Coalescing merges ADJACENT segments only, so it must be order-neutral.
    const result = splitStylesheet(css, {
      sections: ['hero', 'footer', 'x'],
      minNodes: 3,
    })
    expect(await compileSplit(result)).toBe(compileCss(css))
  })
})

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------
//
// Everything above tests a part. This tests the promise: the split stylesheet
// compiles to the same CSS as the original. Compiled through the repo's own
// sass binding and compared compressed, so formatting differences cancel and
// only a real change in rule content or ORDER can fail it.

describe('losslessness', () => {
  it('compiles to the same CSS as the original', async () => {
    const css = [
      ':root{--ink:#111;--pad:8px}',
      '*{box-sizing:border-box}body{margin:0;color:var(--ink)}',
      '.hero{min-height:730px;color:#fff}.hero-copy{max-width:660px}',
      '.hero-photo:after{content:"}";position:absolute}',
      '.trust-strip{display:grid}.trust-item{padding:22px}',
      '.footer{background:#0e100d}.footer a{color:gold}',
      '@media(max-width:960px){.hero{min-height:auto}.footer{padding:0}}',
      '@media(prefers-reduced-motion:reduce){*{transition:none!important}}',
    ].join('')

    const result = splitStylesheet(css, {
      sections: ['hero', 'trust', 'footer'],
    })
    expect(result.partials.length).toBeGreaterThan(1)

    const fromSplit = await compileSplit(result)
    const fromOriginal = compileCss(css)
    expect(fromSplit).toBe(fromOriginal)
  })

  it('preserves cascade order when a section recurs after another', async () => {
    // The failure the contiguity rule exists to prevent, and it only bites when
    // the recurring run is a NAMED section — an unmatched selector just stays
    // with the run already open, so `sections` has to carry `btn` for this to
    // exercise anything. Merging the two `btn` runs into one file (the tempting
    // "nicer" output) moves `.hero` after both of them, which this catches.
    const css = '.btn{color:red}.hero{padding:0}.btn{color:blue}'
    const result = splitStylesheet(css, {
      sections: ['hero', 'btn'],
      minNodes: 1,
    })
    expect(result.partials.map((p) => p.name)).toEqual([
      '_btn.scss',
      '_hero.scss',
      '_btn-2.scss',
    ])
    expect(await compileSplit(result)).toBe(compileCss(css))
  })

  it('breaks the long lines that made the original unreviewable', () => {
    // The measured shape of the precedent: one 1,803-character line.
    const long =
      '.hero{' +
      Array.from({ length: 60 }, (_, i) => `prop-${i}:value-${i}`).join(';') +
      '}'
    expect(long.length).toBeGreaterThan(1000)
    const result = splitStylesheet(long, { sections: ['hero'] })
    expect(result.stats.longestLine).toBeLessThan(40)
  })
})

describe('selector lists', () => {
  it('splits a selector list only at its top-level commas', () => {
    // A comma inside a string or a function is not a list separator. Splitting
    // there put a newline inside `[title="x, y"]` — a bad-string token.
    const out = formatNodes(
      parseStylesheet('a[title="x, y"], .b:is(.c, .d) { color: red }'),
    )
    expect(out).toContain('a[title="x, y"],\n.b:is(.c, .d) {')
  })

  it('compiles a selector with a comma in a string to the same CSS', async () => {
    const css = `a[title="x, y"],.b{color:red}.hero{color:blue}`
    const result = splitStylesheet(css, { sections: ['hero'], minNodes: 1 })
    expect(await compileSplit(result)).toBe(compileCss(css))
  })
})

describe('partial names', () => {
  // Codex review: a repeat's suffix could equal another section's own name.
  // `hero`, `other`, `hero`, `hero-2` gave `_hero-2.scss` twice — one run
  // overwritten on disk, and a duplicate `@use`.
  const css = '.hero{a:1}.other{a:2}.hero{a:3}.hero-2{a:4}'
  const sections = ['hero', 'other', 'hero-2']

  it('never gives two partials the same file', () => {
    const names = splitStylesheet(css, { sections, minNodes: 1 }).partials.map(
      (p) => p.name,
    )
    expect(new Set(names).size).toBe(names.length)
  })

  it('compiles to the same CSS when a suffix would have collided', async () => {
    const result = splitStylesheet(css, { sections, minNodes: 1 })
    expect(await compileSplit(result)).toBe(compileCss(css))
  })

  it('never names a partial after the entry', async () => {
    // Codex review: `site.scss` beside `_site.scss` makes `@use 'site'`
    // ambiguous, and Sass refuses it.
    const input = '.site{color:red}.other{color:blue}'
    const result = splitStylesheet(input, {
      sections: ['site', 'other'],
      minNodes: 1,
    })
    expect(result.partials.map((p) => p.name)).not.toContain('_site.scss')
    expect(await compileSplit(result)).toBe(compileCss(input))
  })
})

describe('escapes outside strings', () => {
  // Codex review: `\{` is an escaped character, not a block. Reading it as
  // one turned the class `foo{bar` into a different selector.
  it('does not read an escaped brace as structure', () => {
    const nodes = parseStylesheet('.foo\\{bar{color:red}.b{color:blue}')
    expect(nodes.map((n) => n.prelude)).toEqual(['.foo\\{bar', '.b'])
  })

  it('compiles an escaped selector to the same CSS', async () => {
    const input = '.foo\\{bar{color:red}.a\\}b{color:blue}.hero{color:green}'
    const result = splitStylesheet(input, { sections: ['hero'], minNodes: 1 })
    expect(await compileSplit(result)).toBe(compileCss(input))
  })
})

describe('Sass syntax inside a CSS literal', () => {
  // Codex review: the partials are SCSS, and SCSS interpolates `#{…}` even
  // inside a quoted string, a custom property and a comment. Written out
  // unchanged, `content:"#{1+1}"` compiled to `content:"2"`. Plain CSS cannot
  // be the reference here — dart-sass refuses `#{` in CSS syntax too — so the
  // expected output is stated.
  const css = [
    'a{content:"#{1+1}"}',
    ':root{--x:#{1+1}}',
    'b[title="#{x}"]{c:d}',
    '/*! #{1+1} */',
    '.hero{background:url(/x#{y}.png)}',
  ].join('')

  it('compiles every literal back to exactly what it said', async () => {
    const out = await compileSplit(
      splitStylesheet(css, { sections: ['hero'], minNodes: 1 }),
    )
    expect(out).toContain('content:"#{1+1}"')
    expect(out).toContain('--x:#{1+1}')
    expect(out).toContain('b[title="#{x}"]')
    expect(out).toContain('/*! #{1+1} */')
    expect(out).toContain('url(/x#{y}.png)')
  })
})
