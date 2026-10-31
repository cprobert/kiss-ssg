// The docs site's guide pages are cut from GUIDE.md by src/controllers/guide.js.
// It used to find links and headings with its own guesses at where Markdown
// code ends, and the published .llms() page showed GUIDE.md's inline example
// `- [title](url): description` with a GitHub URL rewritten into it
// (2026-10-31). It now reads GUIDE.md through Remarkable and rewrites the
// links of the rendered page, so code stays as it is written.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import guide, {
  renderWithTargets,
  splitSections,
} from '../../src/controllers/guide.js'

const root = path.resolve(import.meta.dirname, '../..')
const pages = JSON.parse(
  fs.readFileSync(path.join(root, 'src/models/guide.json'), 'utf8'),
)
const render = (slug) =>
  guide({ model: pages.find((page) => page.slug === slug) }).model.html

describe('the guide pages', () => {
  it('leave a link shown inside inline code as written', () => {
    expect(render('discovery')).toContain(
      '<code>- [title](url): description</code>',
    )
  })

  it('rewrite a real link to a GUIDE.md anchor into a link to its page', () => {
    // GUIDE.md § .robots() links [`links.trailingSlash`](#host-url-policy),
    // which lives on the urls page.
    expect(render('discovery')).toContain('href="../urls/#host-url-policy"')
  })

  it('make every #### heading outside code a heading with an anchor', () => {
    const html = render('index')
    const subs = [...html.matchAll(/<h3 id="([^"]+)">/g)].map((m) => m[1])
    expect(subs).toContain('the-tiers-in-full')
    expect(subs).toContain('building-a-site-well')
  })
})

// The constructs GUIDE.md does not use today, so a change to it cannot break
// the docs site quietly (2026-10-31, /code-review round 3).
describe('splitSections', () => {
  it('cuts a section at a top-level heading, setext included, underline and all', () => {
    const sections = splitSections(
      ['## One', 'a', '', 'Two', '---', 'b'].join('\n'),
    )
    expect(sections.map((s) => s.title)).toEqual(['One', 'Two'])
    expect(sections[1].lines).toEqual(['b'])
  })

  it('leaves a heading inside a blockquote or a list item in its block', () => {
    const sections = splitSections(
      ['## One', '> ## Quoted', '', '- item', '', '  #### Listed', 'x'].join(
        '\n',
      ),
    )
    expect(sections.map((s) => s.title)).toEqual(['One'])
    expect([...sections[0].subs.values()]).toEqual([])
  })

  // Remarkable counts U+2028, U+2424 and U+0085 as line breaks; a split on
  // \n alone put every later heading one line off (2026-10-31, round 4).
  it.each([
    ['U+2028', '\u2028'],
    ['U+0085', '\u0085'],
    ['U+2424', '\u2424'],
  ])('keeps heading lines aligned past a %s line break', (_, br) => {
    const [section] = splitSections(`## One\na${br}b\n\n#### Four\nx`)
    const [[at, sub]] = [...section.subs.entries()]
    expect(sub.title).toBe('Four')
    expect(section.lines[at]).toBe('#### Four')
  })

  it('records a sub-heading with the lines it spans', () => {
    const [section] = splitSections(['## One', '', '#### Four', 'a'].join('\n'))
    const [sub] = [...section.subs.values()]
    expect(sub).toMatchObject({ title: 'Four', level: 4, span: 1 })
  })
})

describe('renderWithTargets', () => {
  const rewrite = (target) => `rewritten/${target}`

  it('rewrites a Markdown link and image, and nothing in code or raw HTML', () => {
    const html = renderWithTargets(
      'See [a](one.md), `[b](two.md)`, <a href="#raw">raw</a> and ![i](pic.png).',
      rewrite,
    )
    expect(html).toContain('<a href="rewritten/one.md">a</a>')
    expect(html).toContain('<code>[b](two.md)</code>')
    expect(html).toContain('<a href="#raw">raw</a>')
    expect(html).toContain('src="rewritten/pic.png"')
  })

  it('escapes what the rewrite returns', () => {
    const html = renderWithTargets('[a](x)', () => 'a"b&c')
    expect(html).toContain('href="a&quot;b&amp;c"')
  })
})
