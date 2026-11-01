# 6 · sitemap and llms.txt

`.sitemap()` writes `sitemap.xml` from the pages already registered, using `config.siteUrl` —
without which it logs an error and skips the file rather than guessing. `ignoreSitemap` keeps a
page out, and a page's `updated` (or `date`) becomes its `<lastmod>`; a page with no date states
none. This is the one example that turns on `assets: { hash: true }` and `extensionLess: true`.

`.llms()` writes `llms.txt` beside it from the same registry — an llmstxt.org index with a
title, a `>` summary, one `##` section per top-level path and a `- [title](url): description`
line per page, for an agent or a tool pointed at the site; no search engine documents reading
it. `rota` is out of both files from the one `ignoreSitemap` on its page.

## Run it

```bash
npm run eg6            # from the repo root
node router.js      # from examples/6-sitemap/
node router.js --dev  # live preview on http://127.0.0.1:3001
```

## What to copy

The config block in `router.js`: `siteUrl`, `extensionLess` and `assets: { hash: true }` are
three decisions every published site has to make, and the layout's `{{asset 'css/site.css'}}`
is unchanged by any of them — the template asks for a file, the config decides how it is cached.
And the `.sitemap().llms()` pair at the end of the chain: two files, one registry, so a crawler
and an agent are told the same thing. And the stockists model's `updated`: date a page only when
it changes, and only with the day it changed.
