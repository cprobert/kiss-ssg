// In a project that depends on the package this is `import { utils } from 'kiss-ssg'`.
import { utils } from '../../../lib/kiss.js'

// A tag is not a record anyone writes down: it exists only because some posts
// mention it. This is the slug the fan-out writes the page at — and the only
// derivation left in this file, because nothing here builds a URL any more: a
// template asks for a tag page by identity, `{{link 'blog/tags' slug=name}}`,
// and the `slug=` sugar runs the same `toSlug` over the tag's own name. One
// function on both sides, so the link and the page cannot drift apart.
export const tagSlug = (tag) => utils.toSlug(String(tag))

/**
 * Every tag the posts mention, each with the posts that mention it — the array
 * the second `.pages()` fan-out is registered over. Sorted by tag, and the
 * posts inside each one left in the order they were handed over (newest
 * first), so two builds of the same folder register the same pages in the same
 * order and the sitemap, the feed and `llms.txt` do not churn.
 *
 * @param {{ title: string, id: string, date: string, dateLabel: string, summary: string, tags: string[] }[]} cards
 * @returns {{ tag: string, slug: string, count: number, posts: any[] }[]}
 */
export function tagRecords(cards) {
  /** @type {Map<string, any[]>} */
  const byTag = new Map()
  for (const card of cards) {
    for (const tag of card.tags) {
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(card)
    }
  }
  return [...byTag.entries()]
    .map(([tag, posts]) => ({
      tag,
      slug: tagSlug(tag),
      count: posts.length,
      posts,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

// One tag record in, one page out. The same job `post.js` does for a post, and
// the reason it is a file rather than an inline function: a controller file is
// a *subject* of the site's knowledge base, so `AIKB/notes/controllers/tag.md`
// can say why tags are computed rather than stored.
export default function tag({ model }) {
  if (!model || typeof model.tag !== 'string' || model.tag.trim() === '') {
    throw new Error(
      'A tag record needs a `tag` — nothing else can name a page.',
    )
  }
  return {
    slug: model.slug,
    title: `Tagged “${model.tag}”`,
    description: `Every Aster & Oak journal post tagged “${model.tag}” — ${model.count} so far.`,
    model,
  }
}
