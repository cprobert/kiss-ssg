---
name: kiss-seo
description: Make a kiss-ssg site findable in search, including AI search, and clear in a search result — one purpose per page, titles and meta descriptions written for the person reading the result, when to keep a page out of search (noindex, not robots disallow), which structured data still earns anything in 2026, pages for the towns a business covers, which AI crawlers to block and which cost search visibility, and dates that move only when content does. Use when asked about "SEO", "ranking", "Google", "search results", "meta description", "page title", "noindex", "robots.txt", "sitemap", "structured data", "schema", "rich results", "FAQ schema", "AI search", "ChatGPT", "AI Overviews", "AI crawlers", "llms.txt", "local SEO", "a page for each town", "canonical", "og:image" or "link preview", or when a page is added or renamed. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for writing the page's body copy (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# SEO

Search follows the reader. Google's own guidance (Search Central) is to write for people first and use search optimisation to help them find it: the words people search with used naturally, and no preferred word count. The order is **the reader's task → clear content → a clean structure → search**, never keyword targets first and copy after.

This skill holds what a model tends to get wrong: facts that changed recently, moves that look right and are not, and tactics vendors sell that the platforms deny. The facts were checked against Google's, OpenAI's, Anthropic's and Apple's own documentation in November 2026, and each carries its date; a dated fact is the first one to re-check. Build mode says each rule once, with its reason; the review checklist below it is the list of checks, and points back here.

## In a kiss site

- **A page's `title` and `description`** are printed by the layout from the page option or the model (`node_modules/kiss-ssg/GUIDE.md` § .page()). The audit reports a missing or duplicate one, and `kiss-site-review` has the layout fix. What each says is this skill's.
- **`.sitemap()`, `.robots()` and `.feed()`** write the files search reads (`node_modules/kiss-ssg/GUIDE.md` § .sitemap(), § .robots(), § .feed()). The canonical link, `og:image`, the heading outline and old URLs kept with `aliases` are checked by the audit and owned by `kiss-site-review`, `kiss-accessibility` and `kiss-information-architecture`.
- **`llms.txt` and each page's `.md` copy are for agents, not search.** No search or answer engine documents reading them, and no study has found that they help a site get found or cited (2026). Never tell an owner they improve ranking or AI visibility.

## Build mode

- **One main purpose per page.** Two pages that answer the same question compete with each other; merge them, or give each its own question.
- **A title says what this page is,** in the words its reader would search with, first, then the site name: never the site name alone, and never the page's slug. Google sets no character limit and cuts a title to the screen, so put the words that matter first rather than counting characters.
- **A description says what the reader gets from the page,** for the person deciding whether to click: the page's own, written like its copy (`kiss-writing-for-the-web`), never a keyword list, and with no length rule either.
- **Keeping a page out of search is `noindex` plus `ignoreSitemap`, never `disallow`.** Blocking a crawler stops it seeing the `noindex`, and the URL can stay indexed with no description.
- **AI search is ordinary search.** Google says AI Overviews and AI Mode need no special files, markup or schema, only a page that is indexed and allowed a snippet (2025-12). What gets a small business named in an AI answer is what gets it found: a page that owns each service, with the concrete facts a question needs (price, duration, what is included, who it is for, the areas served, how to book) and something only this business could say (`kiss-writing-for-the-web`). Never add a file, a schema type or an FAQ block "for AI".
- **Every crawler is allowed by default, and stays allowed unless the owner asks otherwise.** kiss's bare `.robots()` writes `User-agent: *` / `Allow: /`. Never add a block on your own initiative, and never to "tidy up" a robots.txt.
- **When the owner asks to block AI crawlers, ask which they mean first.** "Stop AI scraping us" usually means model training, and its tokens cost nothing in search: `GPTBot` (OpenAI), `ClaudeBot` (Anthropic), `Google-Extended` (Gemini training and grounding, not Search) and `Applebot-Extended`. Blocking a search crawler removes the site from that engine's answers: `OAI-SearchBot` (ChatGPT search), `Claude-SearchBot`, `PerplexityBot`, `Applebot`, `Bingbot`, `Googlebot`. Write the blocks with `.robots({ agents: [...] })`. kiss lists every agent kept out of the whole site in `report().robots.blocked` and logs its "disallows the whole site" notice only when `*` or a search crawler is among them, so that notice after an AI block means a search crawler was blocked by mistake. A CDN can block crawlers before they reach the site, whatever `robots.txt` says: Cloudflare has blocked AI crawlers by default for new sites since 2025-07, and more of them since 2026-09-15 (press-reported).
- **A page per town is a doorway page unless the town has its own content.** Google's spam policy names "pages targeted at specific regions or cities that funnel users to one page". Give a place a page only when there is something true and different to say about it: jobs done there, a venue, directions, local testimonials. Otherwise list the areas served on the service page.
- **Structured data (JSON-LD) states facts the page already shows,** from the same `config/` values as the markup. It is not a ranking factor; it decides how a result can look. As of November 2026:
  - **Still earns something:** `Organization` or the most specific `LocalBusiness` subtype, once, on the home or about page (logo, address, phone, `sameAs`). `LocalBusiness` requires an `address`, so a business that shows none (one that visits its customers) uses `Organization`. `WebSite` for the site name; `BreadcrumbList` (desktop results only since 2025-01); `Event` for real dated sessions; `Course` in a list only for **three or more** real courses (the Course list carousel, English results).
  - **Earns nothing in Google:** `FAQPage` (deprecated 2026-05, documentation removed 2026-06), `HowTo` (2023), Course info and learning video (2025), the sitelinks search box (2024). Truthful markup of these does no harm, but it is not a reason to write an FAQ.
  - **Never** `AggregateRating` or `Review` about the business on its own `Organization` or `LocalBusiness`: Google gives no stars for reviews a business shows about itself. In the UK, fake or cherry-picked reviews are also illegal (DMCC Act, in force 2025-04-06).
- **Dates move only when content does.** A page's visible date, its `dateModified` and its sitemap `<lastmod>` (the page's `updated` or `date`, `node_modules/kiss-ssg/GUIDE.md` § .sitemap()) change when its content changes, never on a rebuild or a restyle. Google lists "changing page dates without substantive updates" as a warning sign.
- **The hand-over names what only the owner can do off the site,** because for a small business it often counts for more than the build: a Google Business Profile under the real trading name (keywords added to the name can get it suspended) with the site's phone, hours and service areas; reviews from real customers, asked for and never bought or filtered; listings in local directories and the trade's "best of" pages; the same details on every profile in `sameAs`; and the site verified in Google Search Console and Bing Webmaster Tools, with its sitemap submitted. AI answers name businesses other sites mention, and Google's local ranking counts links and reviews. Say it once, briefly, and never claim the site does it.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

The audit's search checks are `kiss-site-review` step 1's, with their fixes; quote what a fired title or description check found, and say what it should say. Then work through the checklist, whatever state the site seems to be in.

## Review checklist

Each box is one of build mode's rules, checked on the built site. The report lists every box: ticked with its evidence, a finding, not applicable with the reason, or **not checked** with the reason (no browser, no network). A box is never left out.

**Can search and AI find the site**

- [ ] `robots.txt` allows every crawler, and every agent in `report().robots.blocked` is one the owner asked to block; none is a search crawler.
- [ ] No CDN blocks crawlers the owner did not choose to: fetch the live `robots.txt` and read the response headers (a Cloudflare `server` or `cf-ray` header means checking its bot settings).
- [ ] Every page kept out of search uses `noindex` and `ignoreSitemap`, not `disallow`.
- [ ] `sitemap.xml` lists every public page at its production address, and no `<lastmod>` is the build time: two builds of the unchanged site write the same file.

**Each page**

- [ ] Every title and every description is the page's own, in the reader's words, the words that matter first; none is judged by its character count. Quote the weak ones.
- [ ] One purpose per page: no two pages answer the same question.
- [ ] No town or area pages whose text differs only by the place name.
- [ ] Every service or course page has its concrete facts and something a competitor could not publish unchanged; a gap is questions for the owner, not new copy.
- [ ] Dates moved only when the content did.

**Structured data**

- [ ] Every JSON-LD fact is shown on the page; `Organization` or a `LocalBusiness` (with an address) appears once.
- [ ] No `FAQPage` or `HowTo` presented as a search benefit, no review stars on the business itself, and a course list only with three or more courses.

**AI search**

- [ ] Nothing was added "for AI", and nothing tells the owner that `llms.txt` or the `.md` copies help ranking or AI answers.

**What only the owner can do**

- [ ] The hand-over names the off-site work in build mode's last rule, briefly.
