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
  headingHtml,
  renderWithTargets,
  repoTarget,
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

  // Round 15: a sub-heading's title was escaped as plain text, so GUIDE.md's
  // `#### SCORM: \`{{scormBridge}}\` and \`window.kissScorm\`` showed its
  // backticks on the docs site, in the heading and in the page's contents.
  // (The heading itself came out right: Remarkable parses the inline Markdown
  // left inside the raw HTML line. The contents entry did not.)
  it('render inline Markdown in a sub-heading and its contents entry', () => {
    const model = pages
      .map((page) => guide({ model: page }).model)
      .find((m) => m.html.includes('SCORM: '))
    const want =
      'SCORM: <code>{{scormBridge}}</code> and <code>window.kissScorm</code>'
    expect(model.html).toContain(want)
    expect(model.toc.map((entry) => entry.html)).toContain(want)
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

  // Round 9. A heading with no text has no title for a page or an anchor,
  // and the old regex skipped one in silence. It is a mistake in GUIDE.md,
  // so it fails `node docs` with its line, as a broken {{link}} fails a build.
  it.each([['## '], ['### '], ['#### ']])(
    'fails on an empty %j heading, naming its line',
    (heading) => {
      expect(() =>
        splitSections(['## One', 'a', heading, 'b'].join('\n')),
      ).toThrow('GUIDE.md line 3: a heading with no text')
    },
  )

  // A paragraph line followed by `---` renders as an <h2>, so it is a
  // section, as the renderer says. When its text matched an existing title,
  // the second section replaced the first in the page map with no error.
  // Round 18: a `#` heading is the document's title, not a section, so it
  // shares no title with one; but after the first section, a `#` heading
  // (or a paragraph over `===`) landed in that section's page as a stray
  // <h1>, with no id and no contents entry, and nothing said so.
  it("does not count the document's title as a section", () => {
    expect(
      splitSections(['# kiss-ssg', '', '## kiss-ssg', 'a'].join('\n')).map(
        (s) => s.title,
      ),
    ).toEqual(['kiss-ssg'])
  })

  it.each([
    [['## One', 'a', '# Two', 'b']],
    [['## One', 'a', '', 'Two', '===', 'b']],
  ])('fails on a level-1 heading inside a section: %j', (lines) => {
    expect(() => splitSections(lines.join('\n'))).toThrow(
      'a level-1 heading after the first section',
    )
  })

  // Round 20: two sub-headings with one title (or one with a section's)
  // share an anchor; the page map kept the last, so every link to it went to
  // one page, and both pages emitted the same id.
  it('fails on two headings that would share an anchor', () => {
    expect(() =>
      splitSections(
        ['## One', '#### Options', 'a', '## Two', '#### Options', 'b'].join(
          '\n',
        ),
      ),
    ).toThrow('GUIDE.md lines 2 and 5 would share the anchor #options')
  })

  it('fails on two sections with one title, setext included', () => {
    expect(() =>
      splitSections(['## One', 'a', '', 'One', '---', 'b'].join('\n')),
    ).toThrow('GUIDE.md has two sections titled "One" (lines 1 and 4)')
  })

  it('records a sub-heading with the lines it spans', () => {
    const [section] = splitSections(['## One', '', '#### Four', 'a'].join('\n'))
    const [sub] = [...section.subs.values()]
    expect(sub).toMatchObject({ title: 'Four', level: 4, span: 1 })
  })
})

// Round 16: round 15 rendered a heading with Remarkable's `renderInline`,
// with raw HTML on, so `<head>` in a heading became a tag, and a link in a
// heading skipped the anchor rewrite and nested an <a> in the contents' <a>.
// A heading needs inline code and nothing else.
describe('headingHtml', () => {
  it('renders inline code', () => {
    expect(headingHtml('SCORM: `{{scormBridge}}` and `a<b`')).toBe(
      'SCORM: <code>{{scormBridge}}</code> and <code>a&lt;b</code>',
    )
  })

  // Round 17: a hand-rolled single-backtick match got these wrong.
  it('reads code spans as Markdown does: double backticks and escapes', () => {
    expect(headingHtml('``a`b`` helper')).toBe('<code>a`b</code> helper')
    expect(headingHtml('Escaped \\`tick\\`')).toBe('Escaped `tick`')
  })

  it('escapes raw HTML, and renders no link', () => {
    expect(headingHtml('The <head> element & co')).toBe(
      'The &lt;head&gt; element &amp; co',
    )
    expect(headingHtml('See [x](#other)')).not.toContain('<a')
  })

  it('still shows a method name as code', () => {
    expect(headingHtml('.page()')).toBe('<code>.page()</code>')
  })
})

// Round 14: an empty target (`[TODO]()`) became the repository's front page,
// and an image went to GitHub's HTML page for the file rather than the file.
describe('repoTarget', () => {
  it('leaves an empty target empty', () => {
    expect(repoTarget('', 'link')).toBe('')
    expect(repoTarget('', 'image')).toBe('')
  })

  it("sends a link to the file's page and an image to the file itself", () => {
    expect(repoTarget('lib/kiss.js', 'link')).toBe(
      'https://github.com/cprobert/kiss-ssg/blob/main/lib/kiss.js',
    )
    expect(repoTarget('docs/pic.png', 'image')).toBe(
      'https://github.com/cprobert/kiss-ssg/blob/main/docs/pic.png?raw=true',
    )
  })

  it('leaves a URL with a scheme alone, or a protocol-relative one', () => {
    expect(repoTarget('https://example.com/x', 'link')).toBe(
      'https://example.com/x',
    )
    expect(repoTarget('//example.com/a', 'link')).toBe('//example.com/a')
    // Round 19: a scheme may hold digits, `+`, `.` and `-` (RFC 3986).
    expect(repoTarget('git+https://example.com/r.git', 'link')).toBe(
      'git+https://example.com/r.git',
    )
    expect(repoTarget('web+cal:x', 'link')).toBe('web+cal:x')
  })

  // Round 15: `?raw=true` went after the fragment, inside it, where GitHub
  // never reads it.
  it('puts ?raw=true before a fragment, and beside a query', () => {
    expect(repoTarget('img/d.svg#dark', 'image')).toBe(
      'https://github.com/cprobert/kiss-ssg/blob/main/img/d.svg?raw=true#dark',
    )
    expect(repoTarget('img/d.svg?v=2', 'image')).toBe(
      'https://github.com/cprobert/kiss-ssg/blob/main/img/d.svg?v=2&raw=true',
    )
  })
})

describe('renderWithTargets', () => {
  const rewrite = (target) => `rewritten/${target}`

  it('tells the rewrite which kind of target it is', () => {
    const kinds = []
    renderWithTargets('[a](one.md) ![i](pic.png)', (target, kind) => {
      kinds.push([target, kind])
      return target
    })
    expect(kinds).toEqual([
      ['one.md', 'link'],
      ['pic.png', 'image'],
    ])
  })

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
