// One guide page per entry in guide.json, cut out of GUIDE.md so the docs site
// can never drift from the reference the package ships. The page's markdown is
// rendered here rather than by `{{markdown}}`, because that helper trims every
// line and so flattens the indentation inside fenced code blocks.
import fs from 'node:fs'
import { Remarkable } from 'remarkable'

const REPO = 'https://github.com/cprobert/kiss-ssg/blob/main/'
const GUIDE = new URL('../../GUIDE.md', import.meta.url)
const PAGES = new URL('../models/guide.json', import.meta.url)

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

// Splits GUIDE.md into its `##`/`###` sections, ignoring anything inside a code
// fence. `## Usage` is only a container for the `###` sections under it.
function readSections() {
  const sections = []
  let fenced = false
  let current = null
  for (const line of fs.readFileSync(GUIDE, 'utf8').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const heading = !fenced && /^(#{2,4}) (.+)$/.exec(line)
    if (heading && heading[1].length <= 3) {
      current = heading[2] === 'Usage' ? null : { title: heading[2], lines: [] }
      if (current) sections.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }
  return sections
}

/** @type {import('kiss-ssg').KissController} */
export default function guide({ model }) {
  const pages = JSON.parse(fs.readFileSync(PAGES, 'utf8'))
  const sections = readSections()
  const byTitle = new Map(sections.map((section) => [section.title, section]))

  // Every GUIDE.md section lands on exactly one page, so a section added to the
  // reference fails this build until it is given a home.
  const assigned = pages.flatMap((page) => page.sections)
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
      for (const line of byTitle.get(title).lines) {
        const sub = /^#{4,6} (.+)$/.exec(line)
        if (sub) pageOfAnchor.set(anchorFor(sub[1]), page.slug)
      }
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
  const markdown = model.sections
    .map((title) => {
      const anchor = anchorFor(title)
      const body = []
      let fenced = false
      for (const line of byTitle.get(title).lines) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
        // `####` sits under the section's own heading, so it becomes an <h3>
        // (or an <h2> when the page's <h1> is the section), and deeper levels
        // follow it down.
        const sub = !fenced && /^(#{4,6}) (.+)$/.exec(line)
        if (sub) {
          const level = sub[1].length - (single ? 2 : 1)
          const anchor = anchorFor(sub[2])
          body.push(
            `<h${level} id="${anchor}">${headingHtml(sub[2])}</h${level}>`,
            '',
          )
          if (single && level === 2)
            toc.push({ anchor, html: headingHtml(sub[2]) })
          continue
        }
        body.push(
          fenced
            ? line
            : line.replace(
                /\]\(([^)\s]+)\)/g,
                (_, t) => `](${rewriteLink(t)})`,
              ),
        )
      }
      if (single) return body.join('\n')
      toc.push({ anchor, html: headingHtml(title) })
      return [
        `<h2 id="${anchor}">${headingHtml(title)}</h2>`,
        '',
        ...body,
      ].join('\n')
    })
    .join('\n\n')

  const html = new Remarkable({
    html: true,
    xhtmlOut: true,
    breaks: false,
  }).render(markdown)
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
