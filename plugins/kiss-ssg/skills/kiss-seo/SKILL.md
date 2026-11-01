---
name: kiss-seo
description: Make a kiss-ssg site findable in search, including AI search, and clear in a search result — one purpose per page, titles and meta descriptions written for the person reading the result, when to keep a page out of search (noindex, not robots disallow), which structured data still earns anything in 2026, pages for the towns a business covers, which AI crawlers to block and which cost search visibility, and dates that move only when content does. Use when asked about "SEO", "ranking", "Google", "search results", "meta description", "page title", "noindex", "robots.txt", "sitemap", "structured data", "schema", "rich results", "FAQ schema", "AI search", "ChatGPT", "AI Overviews", "AI crawlers", "llms.txt", "local SEO", "a page for each town", "canonical", "og:image" or "link preview", or when a page is added or renamed. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for writing the page's body copy (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# SEO

Search follows the reader. Google's own guidance (Search Central) is to write for people first and use search optimisation to help them find it: the words people search with used naturally, and no preferred word count. The order is **the reader's task → clear content → a clean structure → search**, never keyword targets first and copy after.

This skill holds what a model tends to get wrong: facts that changed recently, moves that look right and are not, and tactics vendors sell that the platforms deny. The facts were checked against Google's, OpenAI's, Anthropic's and Apple's own documentation in November 2026, and each carries its date; a dated fact is the first one to re-check.

## In a kiss site

- **A page's `title` and `description`** are printed by the layout from the page option or the model (`node_modules/kiss-ssg/GUIDE.md` § .page()). The audit reports a missing or duplicate one, and `kiss-site-review` has the layout fix. What each says is this skill's.
- **`.sitemap()`, `.robots()` and `.feed()`** write the files search reads (`node_modules/kiss-ssg/GUIDE.md` § .sitemap(), § .robots(), § .feed()). The canonical link, `og:image`, the heading outline and old URLs kept with `aliases` are checked by the audit and owned by `kiss-site-review`, `kiss-accessibility` and `kiss-information-architecture`.
- **`llms.txt` and each page's `.md` copy are for agents, not search.** No search or answer engine documents reading them, and no study has found that they help a site get found or cited (2026). Never tell an owner they improve ranking or AI visibility.

## Build mode

- **One main purpose per page.** Two pages that answer the same question compete with each other; merge them, or give each its own question.
- **A title says what this page is,** in the words its reader would search with, first, then the site name: never the site name alone, and never the page's slug. Google sets no character limit and cuts a title to the screen, so put the words that matter first rather than counting characters. Every page's title is its own.
- **A description says what the reader gets from the page,** for the person deciding whether to click. Every page's description is its own; one tagline on every page is a finding. It is written like the page's copy (`kiss-writing-for-the-web`), never stuffed with keywords, and has no length rule either.
- **Keeping a page out of search is `noindex` plus `ignoreSitemap`, never `disallow`.** Blocking a crawler stops it seeing the `noindex`, and the URL can stay indexed with no description. `disallow: '/'` under `*` takes the whole site out of search; kiss logs a notice on every build that writes one.
- **AI search is ordinary search.** Google says its AI Overviews and AI Mode need no special files, markup or schema, only a page that is indexed and allowed a snippet (2025-12). What gets a small business named in an AI answer is the same as what gets it found: a page that owns each service, with the concrete facts a question needs on it (prices, durations, prerequisites, the areas served, how to book). Never add a file, a schema type or an FAQ block "for AI".
- **Every crawler is allowed by default, and stays allowed unless the owner asks otherwise.** kiss's bare `.robots()` writes `User-agent: *` / `Allow: /`, which is right for a site that wants to be found in search and in AI answers. Never add a block on your own initiative, and never to "tidy up" a robots.txt.
- **AI crawlers: when the owner asks to block them, ask which they mean first.** "Stop AI scraping us" usually means model training, and its tokens can be blocked at no cost to search: `GPTBot` (OpenAI), `ClaudeBot` (Anthropic), `Google-Extended` (Gemini training and grounding, not Search) and `Applebot-Extended`. The search crawlers are a different decision, because blocking one removes the site from that engine's answers: `OAI-SearchBot` (ChatGPT search), `Claude-SearchBot`, `PerplexityBot`, `Applebot`, `Bingbot`, `Googlebot`. Write the blocks with `.robots({ agents: [...] })`; kiss lists every agent kept out of the whole site in `report().robots.blocked`, and logs its "disallows the whole site" notice only when `*` or a search crawler is among them, so that notice after an AI block means a search crawler was blocked by mistake. A site behind Cloudflare may already be blocking AI crawlers at the edge whatever `robots.txt` says: new sites since 2025-07, and from 2026-09-15 more of them by default (press-reported). Tell the owner to check the CDN's bot settings.
- **A page per town is a doorway page unless the town has its own content.** Google's spam policy names "pages targeted at specific regions or cities that funnel users to one page". Give a place a page only when there is something true and different to say about it: jobs done there, a venue, directions, local testimonials. Otherwise list the areas served on the service page. The business's Google Business Profile name is its real name: keywords added to it can get the profile suspended.
- **Structured data (JSON-LD) states facts the page already shows,** from the same `config/` values as the markup, so the two cannot disagree. As of November 2026:
  - **Still earns something:** `Organization`, or the most specific `LocalBusiness` subtype, once, on the home or about page (logo, address, phone, `sameAs`). `LocalBusiness` requires an `address`, so a business with no address it shows (one that visits its customers) uses `Organization`, and one with no subtype that fits uses plain `LocalBusiness`; `WebSite` for the site name; `BreadcrumbList` (desktop results only since 2025-01); `Event` for real dated sessions; `Course` in a list only for **three or more** real courses (the Course list carousel, English results).
  - **Earns nothing in Google:** `FAQPage` (deprecated 2026-05, its documentation removed 2026-06), `HowTo` (2023), Course info and learning video (2025), the sitelinks search box (2024). Truthful markup of these does no harm, but it is not a reason to write an FAQ.
  - **Never** `AggregateRating` or `Review` about the business on its own `Organization` or `LocalBusiness`: Google gives no stars for reviews a business shows about itself. In the UK, fake or cherry-picked reviews are also illegal (DMCC Act, in force 2025-04-06).
  - Structured data is not a ranking factor; it decides how a result can look.
- **The hand-over names what only the owner can do off the site,** because for a small business it often counts for more than anything in the build: a Google Business Profile under the real trading name, with the same phone, hours and service areas as the site; reviews there from real customers (asked for, never bought or filtered); listings in the local directories and "best of" pages for the trade; and the same name and details on every profile the site's `sameAs` names. AI answers name businesses that other sites mention, and Google's local ranking counts links and reviews. Say it once, briefly, and never claim the site does it.
- **Dates move only when content does.** A page's visible date, its `dateModified` and its sitemap `<lastmod>` (the page's `updated` or `date`, `node_modules/kiss-ssg/GUIDE.md` § .sitemap()) change when its content changes, never on a rebuild or a restyle. Google lists "changing page dates without substantive updates" as a warning sign.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

The audit's search checks are `kiss-site-review` step 1's, with their fixes; quote what a fired title or description check found, and say what it should say. Then work through the checklist below, whatever state the site seems to be in.

## Review checklist

The key findings of the November 2026 research, so a review of any kiss site covers them. The report lists every box: ticked with its evidence, a finding, not applicable with the reason, or **not checked** with the reason (no browser, no network). A box is never left out.

**Can search and AI find the site**

- [ ] `robots.txt` allows every crawler, and any block is one the owner asked for. No search crawler is blocked (Googlebot, Bingbot, Applebot, `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`); `report().robots.blocked` lists every agent kept out.
- [ ] Nothing in front of the host blocks crawlers the owner did not choose to block: fetch the live `robots.txt` and read the response headers (a Cloudflare `server` or `cf-ray` means checking its bot settings).
- [ ] A page kept out of search uses `noindex` and `ignoreSitemap`, never `disallow`.
- [ ] `sitemap.xml` lists every public page at its production address, and no `<lastmod>` is the time of the build: two builds of the unchanged site write the same file.

**Each page**

- [ ] Every title is the page's own: what it is, in the words its reader searches with, first, then the site name. No title is judged by its character count.
- [ ] Every description is the page's own and says what the reader gets; none is a site-wide tagline or a keyword list.
- [ ] One purpose per page: no two pages answer the same question.
- [ ] No town or area pages whose text differs only by the place name.
- [ ] Each service or course page carries its concrete facts (price, duration, what is included, who it is for, the areas served, how to book) and something only this business could say. A page a competitor could publish unchanged is a finding whose fix is questions for the owner (`kiss-writing-for-the-web`).
- [ ] Dates on the page and in `dateModified` moved only when the content did.

**Structured data**

- [ ] Every fact in the JSON-LD is shown on the page, from the same `config/` value.
- [ ] `Organization` or the right `LocalBusiness` subtype appears once; a `LocalBusiness` has an address.
- [ ] No `FAQPage` or `HowTo` presented to the owner as a search benefit, no `AggregateRating` or `Review` on the business itself, and a course list only with three or more real courses.

**AI search**

- [ ] Nothing was added "for AI" (a file, a schema type, an FAQ block), and nothing tells the owner that `llms.txt` or the `.md` copies help ranking or AI answers.

**What only the owner can do (the hand-over)**

- [ ] The hand-over names the off-site work: a Google Business Profile under the real trading name with the site's phone, hours and areas; real reviews, never bought or filtered; local directories and "best of" pages; the same details on every profile in `sameAs`; and the site verified in Google Search Console and Bing Webmaster Tools with its sitemap submitted.
