import Kiss from '../lib/kiss.js'
import {
  sharedFolders,
  site,
  script,
  reportBuildFailure,
} from './_shared/site.js'
import { loadPosts, summaryCard } from './11-blog/controllers/post.js'
import { tagRecords } from './11-blog/controllers/tag.js'

const dev = process.argv.includes('--dev')

// The default run is clean: every link on every page resolves, and
// `npx kiss-ssg check 11-blog.js --summary` reports no findings at all. Pass
// --broken and one post renders one link to a page this site does not build —
// the way example 8's --atomic shows the atomic build. It is a *link*, not a
// failure: the build still exits 0, because a broken link is a finding rather
// than an error. Only `check` says so.
const broken = process.argv.includes('--broken')

// Three to a page, which is what makes the second page exist at all.
const PER_PAGE = 3

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'The journal' },
    { href: 'blog/index.html', label: 'All posts', folderMatch: true },
    { href: 'blog/tags/index.html', label: 'Tags' },
  ],
  folders: {
    src: './11-blog',
    build: '../public/11-blog',
    layouts: sharedFolders.layouts,
    assets: sharedFolders.assets,
    // Source, not output: it sits outside the build folder, survives
    // cleanBuild, and is committed. Nothing here writes it —
    // `npx kiss-ssg aikb 11-blog.js` does, from a build that passed.
    aikb: './11-blog/AIKB',
  },
  // Every URL derived from the registry — the sitemap's <loc>, the feed's
  // <link> and <guid>, each page's {{canonical}}, and the target of every
  // redirect — is joined onto this. Without it the feed and the sitemap log an
  // error and skip their files rather than guessing an origin.
  siteUrl: 'https://asterandoak.example',
  // Posts build to blog/<slug>/index.html, so every URL in this site is a
  // folder and a post can be renamed without its extension going with it.
  extensionLess: true,
  verbose: true,
  dev,
  port: 3011,
  livereloadPort: 35741,
})

// The posts, newest first. The fan-out below reads the same folder for itself
// through `model: 'posts'`; the listing, the tag pages and the home page need
// the records *before* any page is registered, so the script reads them too —
// through the same module that validates them, which is what keeps the two
// readings from drifting.
const posts = loadPosts('./11-blog/models/posts')
const cards = posts.map(summaryCard)
const tags = tagRecords(cards)

// Pagination is arithmetic over the whole collection, so it lives here rather
// than in a controller: a controller only ever sees one record and can never
// know how many pages there are. Page 1 is /blog/, page N is /blog/page/N/ —
// the shape every reader already recognises, and the one that leaves the
// first page's URL alone when a seventh post is written.
const pageCount = Math.max(1, Math.ceil(cards.length / PER_PAGE))
// The listing's *identity*, not its URL. One view rendered more than once is
// the case where neither page gets a default id — the engine withdraws it and
// says so — so these two are the pages that have to name themselves. The same
// function names the page and names it again as a prev/next target, which is
// what stops the two from drifting; `{{link}}` turns either into an address.
const listingId = (n) => (n === 1 ? 'blog' : `blog/page/${n}`)

kiss.page({
  view: 'index.hbs',
  title: 'The Aster & Oak journal',
  description:
    'Brewing notes, sourcing news and bench lots from a small-batch roastery in Bristol.',
  model: { latest: cards.slice(0, 3) },
})

for (let number = 1; number <= pageCount; number++) {
  kiss.page({
    view: 'blog/listing.hbs',
    // Explicit, because one view rendered twice claims no default id at all.
    id: listingId(number),
    // Page 1 is the section index; the rest are numbered folders under it.
    path: number === 1 ? 'blog' : 'blog/page',
    slug: number === 1 ? 'index' : String(number),
    // One view rendered at two depths, so the climb back to the build root is
    // a page option rather than a line in the template.
    root: number === 1 ? '../' : '../../../',
    title:
      number === 1
        ? 'The journal'
        : `The journal — page ${number} of ${pageCount}`,
    description: `Every post from the Aster & Oak roastery, three to a page. Page ${number} of ${pageCount}.`,
    // No `date`, so the listing pages are not items in the feed — they are the
    // feed's table of contents, not entries in it.
    model: {
      posts: cards.slice((number - 1) * PER_PAGE, number * PER_PAGE),
      number,
      of: pageCount,
      // Ids, not URLs: the view renders `{{link model.prev}}`.
      prev: number > 1 ? listingId(number - 1) : null,
      next: number < pageCount ? listingId(number + 1) : null,
      tags,
    },
  })
}

kiss
  // The fan-out: one JSON file per post in models/posts, one page each from a
  // single view. Writing the seventh post means writing the seventh file.
  .pages({
    view: 'blog/post.hbs',
    model: 'posts',
    // .pages() takes the output folder from `path`; it does not infer one.
    path: 'blog',
    // A controller file, resolved by name from folders.controllers. It
    // validates the record and derives the slug, and it is a *subject* of the
    // site's knowledge base — see 11-blog/AIKB/notes/controllers/post.md.
    controller: 'post.js',
    // An ordinary page option, so it reaches every post's template. Only the
    // one post that carries a `staleLink` renders anything with it.
    broken,
  })
  // The second fan-out, over an array this script computed rather than a
  // folder it read. `.pages()` does not care which: the requirement is that
  // the model resolves to an array.
  .pages({
    view: 'blog/tag.hbs',
    model: tags,
    path: 'blog/tags',
    controller: 'tag.js',
    // A registration's `id` is the *prefix* its items' default ids are built
    // from, in place of the view's route — so these pages are
    // `blog/tags/<slug>` rather than `blog/tag/<slug>`, and every id in this
    // site reads like the path it is served at. It is never broadcast to the
    // items as an id of their own; a record's own `id` still wins outright.
    id: 'blog/tags',
  })
  .page({
    view: 'blog/tags.hbs',
    path: 'blog/tags',
    slug: 'index',
    title: 'Every tag',
    description:
      'The four tags the Aster & Oak journal uses, and the posts filed under each.',
    model: { tags },
  })
  .generate(function () {
    this.viewStats()
  })
  .sitemap()
  // The third file derived from the same registry, and the reason the posts
  // carry a date at all. `section: 'blog'` keeps the home page out; the
  // listing and tag pages have no date, so they fall out on their own.
  .feed({
    title: 'Aster & Oak — the journal',
    description:
      'Brewing notes, sourcing news and bench lots from a small-batch roastery in Bristol.',
    section: 'blog',
  })
  // The registry's third reader: a crawler gets sitemap.xml, a feed client gets
  // feed.xml, an answer engine gets this.
  .llms({
    title: 'Aster & Oak — the journal',
    summary:
      'A small-batch coffee roastery in Bristol. Brewing notes, sourcing news and bench lots.',
    sections: { root: 'The site', blog: 'The journal' },
  })

if (!dev) {
  // Without this await a broken build exits 0 and ships a site with a hole in
  // it. reportBuildFailure prints each failure and sets the exit code.
  await kiss.complete().catch(reportBuildFailure)
}
