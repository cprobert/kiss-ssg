// The fidelity corpus for `lib/html-split.js`.
//
// Five review rounds each found the next place the split changed a page — a
// space between two inline-blocks, an indent inside a `<pre>`, a gap at a
// region boundary — one adjacency at a time. This file stops waiting to be
// told. It builds every pair of a set of awkward atoms, touching, separated by
// a space and separated by a line break, in each place a region can sit, and
// checks that the split, assembled the way kiss assembles it, gives the page
// back. A new finding becomes an atom here, not a one-off test.
//
// What "gives the page back" means is the module's stated invariant:
//
//   - anything whose whitespace renders (`<pre>`, `<textarea>`, `<script>`,
//     `<style>`, an element styled `white-space: pre`) comes back byte for byte;
//   - everywhere else a run of whitespace containing a line break may become
//     another run containing a line break — the printer's re-indent, which
//     renders the same — and NOTHING else may change: whitespace appearing
//     where there was none, or a space vanishing, is a failure;
//   - the layout's own line breaks around `<html>`, `<head>` and `<body>`
//     tags are ignored, because whitespace there never renders.
import { describe, it, expect } from 'vitest'
import Handlebars from 'handlebars'
import layouts from 'handlebars-layouts'
import { splitDocument } from '../../lib/html-split.js'

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

const SENSITIVE =
  /<(pre|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>|<div style="white-space:pre">[\s\S]*?<\/div>/gi
// HTML's whitespace — space, tab, LF, FF, CR — and nothing else. JavaScript's
// `\s` also matches U+00A0, which is CONTENT in HTML: a normaliser using it
// would hide exactly the non-breaking space Codex caught the module losing.
const WS = '[ \\t\\n\\f\\r]'
const STRUCTURE = new RegExp(
  `${WS}*(<\\/?(?:html|head|body)\\b[^>]*>|<!doctype[^>]*>)${WS}*`,
  'gi',
)
const LINE_RUN = new RegExp(`[ \\t\\f\\r]*\\n${WS}*`, 'g')

/**
 * Why `out` is not the page `src` describes, or `null` when it is.
 *
 * @param {string} src
 * @param {string} out
 * @returns {string|null}
 */
const difference = (src, out) => {
  const exact = src.match(SENSITIVE) ?? []
  for (const piece of exact)
    if (!out.includes(piece))
      return `whitespace-sensitive element changed: ${JSON.stringify(piece)}`
  const normalise = (html) => {
    let text = html
    exact.forEach((piece, i) => {
      text = text.split(piece).join(`\u0000${i}\u0000`)
    })
    return (
      text
        // A brace touching a region is written as its character reference,
        // which renders the same — the one place the bytes may differ.
        .replace(/&#123;/g, '{')
        .replace(/&#125;/g, '}')
        .replace(STRUCTURE, '$1')
        .replace(LINE_RUN, '\n')
        .trim()
    )
  }
  const a = normalise(src)
  const b = normalise(out)
  if (a === b) return null
  let at = 0
  while (at < a.length && a[at] === b[at]) at += 1
  return `differs at ${at}: source ${JSON.stringify(a.slice(Math.max(0, at - 20), at + 40))} vs output ${JSON.stringify(b.slice(Math.max(0, at - 20), at + 40))}`
}

// Each atom is something a review found, or a shape of the same family.
const ATOMS = [
  '<span>A</span>',
  '<em>b</em>',
  'text',
  'x &amp; y',
  'a < b',
  '<input>',
  '<input/>',
  '<img src="i.png" />',
  '<br>',
  '<button>B</button>',
  '<select><option>o</option></select>',
  '<svg viewBox="0 0 1 1"><path d="M0"/></svg>',
  '<svg><text><tspan>T</tspan><tspan>U</tspan></text></svg>',
  '<!-- c -->',
  '<script>var a = 1 < 2</script>',
  '<pre>  p\n   q  </pre>',
  '<textarea>\n t </textarea>',
  '<div style="white-space:pre"> w  </div>',
  '<div style="display:inline-block">D</div>',
  '<div class="card">C</div>',
  '<section id="s1">S</section>',
  '<header>H</header>',
  // A chrome partial whose content spans lines: a call Handlebars treats as
  // standalone would indent every one of them.
  '<footer><pre>f\n  g</pre></footer>',
  '<ul><li>1<li>2</ul>',
  '<a href="/x" title="a > b">L</a>',
  '<B>Up</B>',
  '</span>',
  '<x-widget>W</x-widget>',
  '<span>{{x}}</span>',
  `<div data-x="set class='site-header' here" class="hero">H</div>`,
  // Characters that turn into template syntax when they touch the `{{` of a
  // partial call or the content block: `{{{`, `\{{` and `}}}` (Codex round 6).
  '{',
  '}',
  '{{',
  '}}',
  '\\',
  '\\\\',
]
const SEPARATORS = {
  touching: '',
  space: ' ',
  newline: '\n    ',
  // A non-breaking space is content, not a gap — even beside a line break
  // (Codex round 8).
  'a non-breaking space and a newline': ' \n    ',
}
const PLACES = {
  'the body': (x) => x,
  '<main>': (x) => `<main>${x}</main>`,
  'a section': (x) => `<section id="host">${x}</section>`,
}
const page = (body) =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

describe('html-split fidelity corpus', () => {
  for (const [place, wrap] of Object.entries(PLACES))
    for (const [label, sep] of Object.entries(SEPARATORS))
      it(`every pair of atoms, ${label}, in ${place}`, () => {
        const failures = []
        for (const a of ATOMS)
          for (const b of ATOMS) {
            const src = page(wrap(`${a}${sep}${b}`))
            let problem
            try {
              const result = splitDocument(src)
              // The one warning a pair may earn: a backslash written before
              // `{{` — the module's stated exception, whose braces go out as
              // `&#123;&#123;`. The render is still compared.
              const expected = /\\\{\{/.test(src)
                ? result.warnings.filter(
                    (w) => !/preceded by a backslash/.test(w),
                  )
                : result.warnings
              // The other: a separator that is CONTENT (a non-breaking space)
              // between two sections is the stated "between two sections"
              // exception — moved, and warned. Nothing to compare.
              const moved =
                /[^ \t\n\f\r]/.test(sep) &&
                expected.length === 1 &&
                /between two sections/.test(expected[0])
              problem = moved
                ? null
                : expected.length > 0
                  ? `warned: ${expected.join(' | ')}`
                  : difference(src, assemble(result))
            } catch (error) {
              problem = `threw: ${error.message}`
            }
            if (problem)
              failures.push(`${JSON.stringify(a + sep + b)} → ${problem}`)
          }
        expect(failures.slice(0, 15)).toEqual([])
      })
})

// Document SHAPES. The pairs above all sit in one shape — doctype, <html>,
// <head>, <body> — so they could not see the layout changing the document's
// own structure. Codex (2026-10-02) found two: whitespace before <head> in a
// document with no <body> put the whole body BEFORE the head, and a document
// with no doctype got one, switching the browser out of quirks mode. Every
// shape HTML allows, with each atom in it, must come back as it was.
const SHAPES = {
  'the full shape': (x) =>
    `<!doctype html><html><head><title>t</title></head><body>${x}</body></html>`,
  'no doctype': (x) =>
    `<html><head><title>t</title></head><body>${x}</body></html>`,
  'no <body>': (x) =>
    `<!doctype html><html><head><title>t</title></head>${x}</html>`,
  'no <body>, whitespace before <head>': (x) =>
    `<!doctype html><html>\n  <head><script>var s = 1</script></head>\n  ${x}\n</html>`,
  'a comment before <head>': (x) =>
    `<!doctype html><html><!-- build 7 --><head><title>t</title></head><body>${x}</body></html>`,
  'no <html>': (x) =>
    `<!doctype html><head><title>t</title></head><body>${x}</body>`,
  'no <head>': (x) => `<!doctype html><html><body>${x}</body></html>`,
}

describe('html-split fidelity corpus — document shapes', () => {
  for (const [shape, wrap] of Object.entries(SHAPES))
    it(`every atom beside a section, in ${shape}`, () => {
      const failures = []
      for (const atom of ATOMS) {
        const src = wrap(`<section id="s">S</section>${atom}`)
        let problem
        try {
          const result = splitDocument(src)
          problem =
            result.warnings.length > 0
              ? `warned: ${result.warnings.join(' | ')}`
              : difference(src, assemble(result))
        } catch (error) {
          problem = `threw: ${error.message}`
        }
        if (problem) failures.push(`${JSON.stringify(atom)} → ${problem}`)
      }
      expect(failures.slice(0, 15)).toEqual([])
    })
})
