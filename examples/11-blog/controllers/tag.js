// In a project that depends on the package this is `import { utils } from 'kiss-ssg'`.
import { utils } from '../../../lib/kiss.js'

// A tag is not a record anyone writes down: it exists only because some posts
// mention it. Deriving its slug in one place is what keeps the link a post
// renders and the page the fan-out writes at the same address.
export const tagSlug = (tag) => utils.toSlug(String(tag))

export const tagUrl = (tag) => `/blog/tags/${tagSlug(tag)}/`

/**
 * Every tag the posts mention, each with the posts that mention it — the array
 * the second `.pages()` fan-out is registered over. Sorted by tag, and the
 * posts inside each one left in the order they were handed over (newest
 * first), so two builds of the same folder register the same pages in the same
 * order and the sitemap, the feed and `llms.txt` do not churn.
 *
 * @param {{ title: string, url: string, date: string, dateLabel: string, summary: string, tags: { name: string, url: string }[] }[]} cards
 * @returns {{ tag: string, slug: string, count: number, posts: any[] }[]}
 */
export function tagRecords(cards) {
  /** @type {Map<string, any[]>} */
  const byTag = new Map()
  for (const card of cards) {
    for (const tag of card.tags) {
      if (!byTag.has(tag.name)) byTag.set(tag.name, [])
      byTag.get(tag.name).push(card)
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
