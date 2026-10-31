// The docs site's guide pages are cut from GUIDE.md by src/controllers/guide.js.
// It used to find links and headings with its own guesses at where Markdown
// code ends, and the published .llms() page showed GUIDE.md's inline example
// `- [title](url): description` with a GitHub URL rewritten into it
// (2026-10-31). It now reads GUIDE.md through Remarkable and rewrites the
// links of the rendered page, so code stays as it is written.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import guide from '../../src/controllers/guide.js'

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
