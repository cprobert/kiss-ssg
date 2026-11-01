---
name: kiss-seo
description: Make a kiss-ssg site findable in Google and in AI search — titles and descriptions, noindex not disallow, robots.txt and AI crawlers, structured data, town pages, sitemap dates, and the owner's off-site work. Use for "SEO", "Google", "ranking", "search results", "page title", "meta description", "noindex", "robots.txt", "sitemap", "structured data", "schema", "rich results", "FAQ schema", "AI search", "AI Overviews", "ChatGPT", "AI crawlers", "llms.txt", "local SEO", or when a page is added or renamed. Not for body copy (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# SEO

Write for the reader first; search follows. Facts below were checked against Google's, OpenAI's, Anthropic's and Apple's documentation in November 2026 — re-check a dated one first.

`.sitemap()`, `.robots()` and `.feed()` write the files search reads; a page's `title` and `description` come from its options or model (`node_modules/kiss-ssg/GUIDE.md`). `llms.txt` and the `.md` copies are for agents: nothing shows they help search or AI citations, so never sell them as SEO.

## Build mode

- **One purpose per page.** Two pages answering one question compete; merge them.
- **Titles:** what the page is, in the searcher's words, first; then the site name. No character limit exists, so don't count.
- **Descriptions:** what the reader gets, the page's own, never a keyword list or a site-wide tagline.
- **Out of search = `noindex` + `ignoreSitemap`, never `disallow`**, which hides the `noindex` from the crawler.
- **AI search is ordinary search.** Google's AI features need no special file, markup or schema. What gets a business named is a page per service with its concrete facts (price, duration, what's included, who it's for, areas served, how to book) and something only this business can say (`kiss-writing-for-the-web`). Add nothing "for AI".
- **Allow every crawler** (`.robots()` writes `User-agent: *` / `Allow: /`). Block only when the owner asks, and then ask which they mean: training tokens cost nothing in search (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`); search crawlers remove the site from that engine (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Applebot`, `Bingbot`, `Googlebot`). Use `.robots({ agents: [...] })`. kiss lists blocked agents in `report().robots.blocked` and logs "disallows the whole site" only for `*` or a search crawler. A CDN can block crawlers regardless of `robots.txt` (Cloudflare blocks AI crawlers by default for many sites since 2025).
- **No page per town** unless the town has its own true content (jobs there, a venue, local testimonials): otherwise it is a doorway page under Google's spam policy. List the areas on the service page.
- **Structured data** states only facts the page shows, from the same `config/` values. It shapes how a result looks; it does not rank.
  - Earns something: `Organization`, or a `LocalBusiness` subtype (needs an `address`; a business that visits customers uses `Organization`), once; `WebSite`; `BreadcrumbList` (desktop only, 2025); `Event` for real dates; `Course` in a list of **three or more** courses.
  - Earns nothing: `FAQPage` (2026), `HowTo` (2023), Course info (2025), sitelinks search box (2024).
  - Never review stars on the business itself; fake or filtered reviews are also illegal in the UK (DMCC Act, 2025).
- **Dates move only with content:** a visible date, `dateModified` and the sitemap `<lastmod>` (the page's `updated` or `date`) change when the content does, never on a rebuild.
- **The hand-over lists the owner's off-site work:** a Google Business Profile under the real trading name (keywords in it risk suspension) matching the site's phone, hours and areas; real reviews, never bought or filtered; local directories and "best of" lists; the same details on every `sameAs` profile; Google Search Console and Bing Webmaster Tools, sitemap submitted.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**. Look at the site as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, say the browser checks did not run.

The audit's title and description checks are `kiss-site-review` step 1's; say what a flagged one should say. Then report every box below as ticked (with evidence), a finding, not applicable, or not checked (with the reason). Never leave one out.

## Review checklist

- [ ] `robots.txt` allows every crawler; every agent in `report().robots.blocked` is one the owner asked to block, and none is a search crawler.
- [ ] No CDN blocks crawlers the owner didn't choose to: fetch the live `robots.txt` and check its headers (`cf-ray` means Cloudflare's bot settings).
- [ ] Pages kept out of search use `noindex`, not `disallow`.
- [ ] `sitemap.xml` lists every public page at its production address, and no `<lastmod>` is the build time (two builds give the same file).
- [ ] Every title and description is the page's own and in the reader's words. Quote the weak ones.
- [ ] No two pages answer the same question.
- [ ] No town or area pages that differ only by the place name.
- [ ] Every service or course page has its concrete facts and something a competitor couldn't publish unchanged.
- [ ] Dates moved only with content.
- [ ] Every JSON-LD fact is on the page; one `Organization` or `LocalBusiness` (with an address).
- [ ] No `FAQPage` or `HowTo` sold as a benefit, no self-review stars, a course list only with three or more courses.
- [ ] Nothing was added "for AI", and nothing claims `llms.txt` or the `.md` copies help search.
- [ ] The hand-over names the off-site work.
