// One guide page per entry in guide.json, cut out of GUIDE.md so the docs site
// can never drift from the reference the package ships. The page's markdown is
// rendered here rather than by `{{markdown}}`, because that helper trims every
// line and so flattens the indentation inside fenced code blocks.
import fs from 'node:fs'
import { Remarkable } from 'remarkable'

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

// A method name reads as code; any other heading as prose.
const headingHtml = (text) =>
  /^\.[a-zA-Z]+\(\)$/.test(text)
    ? `<code>${escapeHtml(text)}</code>`
    : escapeHtml(text)

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
let parsed = null
function readSections() {
  const { mtimeMs } = fs.statSync(GUIDE)
  if (parsed?.mtimeMs !== mtimeMs)
    parsed = {
      mtimeMs,
      sections: splitSections(fs.readFileSync(GUIDE, 'utf8')),
    }
  return parsed.sections
}

export function splitSections(text) {
  const lines = text.split(/\r?\n/)
  const tokens = markdown.parse(text, {})
  const headings = tokens.flatMap((token, i) =>
    token.type === 'heading_open' && token.level === 0
      ? [
          {
            level: token.hLevel,
            title: tokens[i + 1].content,
            start: token.lines[0],
            end: token.lines[1],
          },
        ]
      : [],
  )
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
  const walk = (list) => {
    for (const token of list) {
      if (token.type === 'link_open') token.href = rewrite(token.href)
      if (token.type === 'image') token.src = rewrite(token.src)
      if (token.children) walk(token.children)
    }
  }
  walk(tokens)
  return markdown.renderer.render(tokens, markdown.options, env)
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
  const rewriteLink = (target) => {
    if (target.startsWith('#')) {
      const anchor = target.slice(1)
      const slug = pageOfAnchor.get(anchor)
      if (!slug)
        throw new Error(`GUIDE.md links to #${anchor}, which no guide page has`)
      return hrefTo(slug, anchor)
    }
    if (/^[a-z]+:/i.test(target)) return target
    return `${REPO}${target}`
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
