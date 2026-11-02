---
name: kiss-seo
description: Make a kiss-ssg site findable in Google and AI search — titles, descriptions, noindex, robots.txt and AI crawlers, structured data, town pages, sitemap dates, the owner's off-site work. Use for "SEO", "Google", "ranking", "meta description", "robots.txt", "sitemap", "schema", "rich results", "AI search", "ChatGPT", "llms.txt", "local SEO", or when a page is added or renamed. Not for body copy.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# SEO

Write for the reader; search follows. Facts are as of November 2026, from Google's, OpenAI's, Anthropic's and Apple's documentation.

**Build** to the checklist. **Review** against it: follow the [review protocol](../kiss-site-review/review-protocol.md) and the [browser pass](../kiss-site-review/browser-pass.md), and report every box as ticked (with evidence), a finding, not applicable, or not checked (with the reason). Never leave one out. The audit's title and description findings are `kiss-site-review`'s; say what a flagged one should say.

## Checklist

**Crawling**

- [ ] `robots.txt` allows every crawler (`.robots()` writes `User-agent: *` / `Allow: /`). Block only what the owner asks, after asking which they mean: training tokens cost nothing in search (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`); search crawlers remove the site from that engine (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Applebot`, `Bingbot`, `Googlebot`). Use `.robots({ agents: [...] })`; `report().robots.blocked` lists what is blocked.
- [ ] No CDN blocks crawlers the owner didn't choose to (Cloudflare blocks AI crawlers by default on many sites): check the live response headers.
- [ ] A page kept out of search uses `noindex` + `ignoreSitemap`, never `disallow`, which hides the `noindex`.
- [ ] `sitemap.xml` has every public page, and `<lastmod>` is the page's `updated` or `date`, never the build time; dates move only when content does.

**Pages**

- [ ] Each title says what the page is, in the searcher's words, first, then the site name. No character limit exists.
- [ ] Each description is the page's own and says what the reader gets; never a tagline or keyword list.
- [ ] One purpose per page; no two pages answer the same question.
- [ ] No page per town unless the town has its own true content (jobs, a venue, local testimonials); otherwise it is a doorway page. List areas on the service page.
- [ ] Each service or course page has its concrete facts (price, duration, what's included, who it's for, areas, how to book) and something only this business can say (`kiss-writing-for-the-web`). That is also what gets it named in AI answers: Google's AI features need no special file or schema, so add nothing "for AI". `llms.txt` and the `.md` copies are for agents; never sell them as SEO.

**Structured data**

- [ ] JSON-LD states only facts the page shows, from `config/`: one `Organization`, or a `LocalBusiness` subtype with an `address` (a business that visits customers uses `Organization`); `WebSite`; `BreadcrumbList`; `Event` for real dates; `Course` in a list only for three or more courses.
- [ ] No `FAQPage` or `HowTo` sold as a benefit (Google dropped both, 2023 and 2026), and no review stars on the business itself. The law on reviews shown on the site is [`kiss-legal-and-privacy`](../kiss-legal-and-privacy/SKILL.md)'s: open it when the site shows any.

**Hand-over**

- [ ] It names the owner's off-site work: Google Business Profile under the real name (keywords in it risk suspension) matching the site's phone, hours and areas; real reviews; local directories and "best of" lists; consistent `sameAs` profiles; Search Console and Bing Webmaster Tools with the sitemap submitted.
