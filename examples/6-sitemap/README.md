# 6 · sitemap and llms.txt

`.sitemap()` writes `sitemap.xml` from the pages already registered, using `config.siteUrl` —
without which it logs an error and skips the file rather than guessing. Per-page
`ignoreSitemap`, `sitemapPriority` and `sitemapChangefreq` tune the entries, and this is the one
example that turns on `assets: { hash: true }` and `extensionLess: true`.

`.llms()` writes `llms.txt` beside it from the same registry — an llmstxt.org index with a
title, a `>` summary, one `##` section per top-level path and a `- [title](url): description`
line per page. `rota` is out of both files from the one `ignoreSitemap` on its page.

## Run it

```bash
npm run eg6            # from the repo root
node 6-sitemap.js      # from examples/
node 6-sitemap.js --dev  # live preview on http://127.0.0.1:3001
```

## What to copy

The config block in `6-sitemap.js`: `siteUrl`, `extensionLess` and `assets: { hash: true }` are
three decisions every published site has to make, and the layout's `{{asset 'css/site.css'}}`
is unchanged by any of them — the template asks for a file, the config decides how it is cached.
And the `.sitemap().llms()` pair at the end of the chain: two files, one registry, so a crawler
and an answer engine are told the same thing.
