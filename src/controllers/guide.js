// One guide page per entry in guide.json, cut out of GUIDE.md so the docs site
// can never drift from the reference the package ships. The page's markdown is
// rendered here rather than by `{{markdown}}`, because that helper trims every
// line and so flattens the indentation inside fenced code blocks.
import fs from 'node:fs'
import { Remarkable } from 'remarkable'
import { linkTokens } from '../../scripts/markdown-links.mjs'

const REPO = 'https://github.com/cprobert/kiss-ssg/blob/main/'
const GUIDE = new URL('../../GUIDE.md', import.meta.url)
const PAGES = new URL('../models/guide.json', import.meta.url)

// GUIDE.md sections the docs site leaves out on purpose. The v1 migration notes
// stay in GUIDE.md (and the kiss-site-migrate skill) for anyone upgrading; the
// site is for people starting on v2. Operator's call, 2026-10-01.
const LEFT_OUT = ['Migrating from v1']

// GitHub's heading anchor rule, so a `#fragment` written against GUIDE.md on
// GitHub is the same fragment here.
const anchorFor = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A method name reads as code; any other heading as escaped text with its
// inline code rendered. Escaped whole, `#### SCORM: \`{{scormBridge}}\``
// showed its backticks in the page's contents (round 15); rendered as full
// inline Markdown, a heading's raw HTML became a tag and its link skipped the
// anchor rewrite and nested inside the contents' own link (round 16); a
// hand-rolled backtick match misread ``a`b`` and an escaped \` (round 17). So
// Remarkable reads it, with raw HTML off and every inline rule off but text,
// escapes and code spans.
const headingMarkdown = new Remarkable({ html: false })
headingMarkdown.inline.ruler.enable(
  ['text', 'newline', 'escape', 'backticks'],
  true,
)
export const headingHtml = (text) =>
  /^\.[a-zA-Z]+\(\)$/.test(text)
    ? `<code>${escapeHtml(text)}</code>`
    : headingMarkdown.renderInline(text)

// Every absolute link left in a guide page leaves the site, because
// `rewriteLink` below turns GUIDE.md's links to itself into relative ones. The
// site's rule is that those open in a new tab, marked up exactly as the
// external-link partial does it.
const openExternalInNewTab = (html) =>
  html.replace(
    /<a href="(https?:\/\/[^"]+)"([^>]*)>([\s\S]*?)<\/a>/g,
    '<a href="$1"$2 target="_blank" rel="noopener noreferrer">$3<span class="visually-hidden"> (opens in a new tab)</span></a>',
  )

const markdown = new Remarkable({ html: true, xhtmlOut: true, breaks: false })

// Splits GUIDE.md into its `##`/`###` sections, each with its `####`–`######`
// sub-headings. `## Usage` is only a container for the `###` sections under
// it. The headings come from Remarkable's own parse, the same one that renders
// the page, so a `#` line inside a code block is never taken for one: two
// hand-written guesses at where code ends both got it wrong (2026-10-31).
// Only a top-level heading counts (`level` 0): one inside a blockquote or a
// list item belongs to that block. A heading runs from `lines[0]` up to
// `lines[1]`, two lines for a setext heading's text and underline.
// Parsed once per version of the file, not once per guide page.
// The cache is keyed on the text itself, not the file's modification time:
// an edit can keep the time (a checkout, a tool that preserves it, two saves
// in one tick), and `node docs --dev` lives across rebuilds. Reading the file
// is cheap next to parsing it.
let parsed = null
function readSections() {
  const text = fs.readFileSync(GUIDE, 'utf8')
  if (parsed?.text !== text) parsed = { text, sections: splitSections(text) }
  return parsed.sections
}

// Remarkable's own set of line breaks (`NEWLINES_RE` in remarkable 2): its
// `token.lines` count these, so the lines here are split on the same set, or
// one U+2028 in GUIDE.md would put every later heading a line off.
const LINE_BREAKS = /\r[\n\u0085]|[\u2424\u2028\u0085]/g

export function splitSections(source) {
  const text = source.replace(LINE_BREAKS, '\n')
  const lines = text.split('\n')
  const tokens = markdown.parse(text, {})
  const headings = tokens.flatMap((token, i) =>
    token.type === 'heading_open' && token.level === 0
      ? [
          {
            level: token.hLevel,
            // An empty heading has no inline token after it.
            title: tokens[i + 1].type === 'inline' ? tokens[i + 1].content : '',
            start: token.lines[0],
            end: token.lines[1],
          },
        ]
      : [],
  )
  // A heading with no text has no title for a page or an anchor, and a title
  // two sections share would let the second replace the first in the page
  // map. Both are mistakes in GUIDE.md, so `node docs` fails on them.
  const seen = new Map()
  let inSection = false
  for (const heading of headings) {
    if (!heading.title.trim())
      throw new Error(
        `GUIDE.md line ${heading.start + 1}: a heading with no text`,
      )
    // A `#` heading is the document's title, before any section, and no
    // section itself. After the first section it would land in that page as
    // a stray <h1>, with no id or contents entry (round 18).
    if (heading.level === 1) {
      if (inSection)
        throw new Error(
          `GUIDE.md line ${heading.start + 1}: a level-1 heading after the first section`,
        )
      continue
    }
    if (heading.level <= 3) inSection = true
    if (heading.level > 3 || heading.title === 'Usage') continue
    if (seen.has(heading.title))
      throw new Error(
        `GUIDE.md has two sections titled "${heading.title}" (lines ${seen.get(heading.title) + 1} and ${heading.start + 1})`,
      )
    seen.set(heading.title, heading.start)
  }
  const sections = []
  let current = null
  let from = lines.length
  const close = (to) => {
    if (current) current.lines = lines.slice(from, to)
  }
  for (const heading of headings) {
    if (heading.level === 2 || heading.level === 3) {
      close(heading.start)
      current =
        heading.title === 'Usage'
          ? null
          : { title: heading.title, lines: [], subs: new Map() }
      if (current) sections.push(current)
      from = heading.end
    } else if (current && heading.level >= 4)
      current.subs.set(heading.start - from, {
        ...heading,
        span: heading.end - heading.start,
      })
  }
  close(lines.length)
  return sections
}

// Renders a page's Markdown with every link and image target passed through
// `rewrite`. It changes the tokens Remarkable parsed, not the text, so a link
// shown inside code (`- [title](url): description`) or written as raw HTML is
// left exactly as GUIDE.md has it.
export function renderWithTargets(source, rewrite) {
  const env = {}
  const tokens = markdown.parse(source, env)
  // The targets stay as the parser encoded them: they are URLs, not files.
  for (const token of linkTokens(tokens))
    if (token.type === 'image') token.src = rewrite(token.src, 'image')
    else token.href = rewrite(token.href, 'link')
  return markdown.renderer.render(tokens, markdown.options, env)
}

// Where a target that is not one of GUIDE.md's own anchors points: a URL
// with a scheme as it is, and a path in this repository on GitHub, a link
// to the file's page and an image to the file itself, which `?raw=true`
// serves. An empty target (`[TODO]()`) stays empty rather than becoming the
// repository's front page (round 14). A protocol-relative `//host/…` is a URL
// too, and `raw=true` joins a query and goes before a fragment, where GitHub
// reads it (round 15).
export function repoTarget(target, kind) {
  // A scheme as RFC 3986 spells it (`git+https:`, `web+cal:`), round 19.
  if (!target || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return target
  if (kind !== 'image') return `${REPO}${target}`
  const [, file, query = '', fragment = ''] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(
    target,
  )
  return `${REPO}${file}${query ? `${query}&` : '?'}raw=true${fragment}`
}

/** @type {import('kiss-ssg').KissController} */
export default function guide({ model }) {
  const pages = JSON.parse(fs.readFileSync(PAGES, 'utf8'))
  const sections = readSections()
  const byTitle = new Map(sections.map((section) => [section.title, section]))

  // Every GUIDE.md section lands on exactly one page, so a section added to the
  // reference fails this build until it is given a home — or is named here as
  // deliberately left off the site.
  const assigned = [...pages.flatMap((page) => page.sections), ...LEFT_OUT]
  const homeless = sections.filter((s) => !assigned.includes(s.title))
  const missing = assigned.filter((title) => !byTitle.has(title))
  if (homeless.length || missing.length)
    throw new Error(
      `guide.json and GUIDE.md disagree. Unassigned: ${homeless.map((s) => s.title).join(', ') || 'none'}. Not in GUIDE.md: ${missing.join(', ') || 'none'}`,
    )

  // Which page each anchor lives on, for rewriting GUIDE.md's own `#links`.
  const pageOfAnchor = new Map()
  for (const page of pages)
    for (const title of page.sections) {
      pageOfAnchor.set(anchorFor(title), page.slug)
      for (const sub of byTitle.get(title).subs.values())
        pageOfAnchor.set(anchorFor(sub.title), page.slug)
    }

  const here = model.slug
  const hrefTo = (slug, anchor) => {
    if (slug === here) return `#${anchor}`
    const up = here === 'index' ? '' : '../'
    const into = slug === 'index' ? '' : `${slug}/`
    return `${up}${into}#${anchor}`
  }
  const rewriteLink = (target, kind) => {
    if (target.startsWith('#')) {
      const anchor = target.slice(1)
      const slug = pageOfAnchor.get(anchor)
      if (!slug)
        throw new Error(`GUIDE.md links to #${anchor}, which no guide page has`)
      return hrefTo(slug, anchor)
    }
    return repoTarget(target, kind)
  }

  // A one-section page lets its <h1> carry the section's anchor instead of
  // repeating the title as an <h2> straight underneath it.
  const single = model.sections.length === 1
  const toc = []
  const source = model.sections
    .map((title) => {
      const anchor = anchorFor(title)
      const body = []
      const section = byTitle.get(title)
      for (let i = 0; i < section.lines.length; i++) {
        // `####` sits under the section's own heading, so it becomes an <h3>
        // (or an <h2> when the page's <h1> is the section), and deeper levels
        // follow it down. A setext heading's underline goes with it.
        const sub = section.subs.get(i)
        if (!sub) {
          body.push(section.lines[i])
          continue
        }
        const level = sub.level - (single ? 2 : 1)
        const anchor = anchorFor(sub.title)
        body.push(
          `<h${level} id="${anchor}">${headingHtml(sub.title)}</h${level}>`,
          '',
        )
        if (single && level === 2)
          toc.push({ anchor, html: headingHtml(sub.title) })
        i += sub.span - 1
      }
      const text = body.join('\n')
      if (single) return text
      toc.push({ anchor, html: headingHtml(title) })
      return [`<h2 id="${anchor}">${headingHtml(title)}</h2>`, '', text].join(
        '\n',
      )
    })
    .join('\n\n')

  const html = openExternalInNewTab(renderWithTargets(source, rewriteLink))
  const position = pages.findIndex((page) => page.slug === here)
  const neighbour = (page) => page && { slug: page.slug, title: page.title }

  return {
    slug: model.slug,
    title: model.title,
    description: model.description,
    model: {
      ...model,
      html,
      toc,
      anchor: single ? anchorFor(model.sections[0]) : null,
      prev: neighbour(pages[position - 1]),
      next: neighbour(pages[position + 1]),
      nav: pages.map((page) => ({
        slug: page.slug,
        title: page.title,
        current: page.slug === here,
      })),
    },
  }
}
