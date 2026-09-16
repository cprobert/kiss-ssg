# robots.js

## Responsibility

`robots.txt`: the crawl policy a site states once, and the `Sitemap:` line that points a crawler at the sitemap this build actually wrote. Pure functions plus one writer (`fs.outputFile`) — no state, no knowledge of `Kiss`, no decision about when it runs.

**The `Sitemap:` line is the reason the module exists.** The crawler blocks above it are boilerplate a site can hand-write and usually does — `examples/_shared/assets/robots.txt` is `User-agent: *` / `Allow: /` and was copied into every example that uses it. What a hand-written file cannot do is stay in step with the build: those same examples call `.sitemap()` and their `robots.txt` never mentioned it, so kiss shipped examples that generate a sitemap and never advertise it. That is the gap `.llms()` and `.feed()` were built for, one file further out.

Unlike `_redirects` there **is** a method to call. A crawl policy is a statement about the whole site, not a property of a page, so nothing in the stack could imply it — and that is also what keeps a `robots.txt` a site copies from `src/assets/` safe: the file is only written when `.robots()` asks for it.

## Public interface

- `normaliseRobotsPath(value)` → the path with a leading `/`, or `null` for an empty one or one containing whitespace. A leading `*` is left alone (a wildcard pattern, not a path).
- `collectRobotsAgents(options)` → `[{ userAgent, allow, disallow, crawlDelay }]`, always at least one block. `options.agents` wins; failing that the `userAgent`/`allow`/`disallow` shorthand builds a single block; failing that the default is one `*` block allowing `/`. Paths go through `normaliseRobotsPath`, a non-finite `crawlDelay` becomes `null`.
- `disallowsEverything(agents)` → whether any block carries `Disallow: /`.
- `collectSitemapUrls(sitemap, { siteUrl, hasSitemap, trailingSlash })` → the absolute sitemap URLs to advertise. `false` or no `siteUrl` gives none; a string or array is taken at its word (a value carrying a scheme is passed through, anything else is joined to `siteUrl`); `true`/absent gives this build's own `sitemap.xml` **only when `hasSitemap`**.
- `renderRobotsTxt(agents, sitemaps)` → the file's text: one block per agent separated by a blank line, `Sitemap:` lines last, newline-terminated.
- `writeRobots({ config, logger, options, hasSitemap, overwrite })` → `{ status: 'written' | 'skipped', text, agents, disallowAll, sitemaps }`.
- The `RobotsAgent`, `RobotsOptions` and `RobotsWriteResult` typedefs.

## Depends on

`fs-extra` (`outputFile`/`existsSync`, in `writeRobots` alone) and `./utils.js` (`toAbsoluteUrl`). No logger beyond the one it is handed, no config beyond `folders.build`, `siteUrl` and `links.trailingSlash`.

## Depended on by

`lib/kiss.js` only: `writeRobots` from `Kiss.robots()`, queued on `_generating` behind `Promise.all(this._promises)` like `.llms()` and `.feed()`. The result is latched on `_robotsResult` and handed to `buildReport` as the report's `robots` key (`AIKB/build-report.md`). `_robotsRequest` is the standing request `_replay()` re-issues, the same shape as `_sitemapRequest`, `_llmsRequest` and `_feedRequest`.

## Non-obvious behavior

- **`ignoreSitemap` deliberately does NOT imply `Disallow`, and must never be wired to it.** It is the obvious-looking connection and it is actively harmful: blocking a crawler stops it fetching the page, which stops it seeing a `noindex` meta tag, so the URL can stay indexed with no snippet — worse than leaving it crawlable. Excluded-from-the-sitemap and blocked-from-crawling are different intents, and this module takes the second only from an explicit `disallow`.

- **`Disallow: /` is the sharpest edge in the package, so it is reported rather than merely written.** It removes a site from search, it is one character from the bare `Disallow:` that means the opposite, and nothing about the build looks wrong afterwards. `disallowsEverything` is what lets `Kiss.robots()` log a `notice` on **every** build that emits it and put `disallowAll` on `report().robots`, so a staging policy promoted to production shows up in a `kiss-ssg check` diff rather than in Search Console a month later. That is also why the report's `robots` key is an object where `sitemap`, `llms` and `feed` are bare path strings: a path cannot carry the fact.

- **`Sitemap:` is gated on `.sitemap()` having been called, not on the option alone.** `sitemap: true` is the default, but `hasSitemap` is what decides: advertising a `sitemap.xml` that was never written is a fetch error in every crawler that reads the line, and a site that removed `.sitemap()` should stop claiming one. `Kiss.robots()` reads `_sitemapRequest !== null` **inside** the queued `.then()` rather than at call time, so `.robots().sitemap()` and `.sitemap().robots()` give the same file — both requests are recorded synchronously on the chain, and the check runs after the queue drains.

- **The URL goes through `toAbsoluteUrl`, never a string join.** It is the one join every emitted URL in the package makes, so the sitemap a crawler is pointed at is character-for-character the one `<loc>` lives in, and it follows `config.links.trailingSlash` with the rest of them (`AIKB/utils.md`). A fifth copy of this arithmetic is the thing to not write.

- **A path with whitespace in it is dropped, not escaped.** `robots.txt` is one directive per line and there is no escape for a newline, so a `disallow` carrying one would write more rules than the one it stands for — the same injection `normaliseAlias` drops an alias for (`AIKB/redirects.md`), and the same reasoning: a `disallow` may have been built from a model rather than typed by a person. Writing a _different_ rule than the one asked for is worse than writing none.

- **A block with no rules still writes a bare `Disallow:`.** That is the format's way of saying "nothing is disallowed"; a `User-agent:` line with no directive under it is undefined in the original spec and is read inconsistently. `Disallow:` and `Disallow: /` differ by one character and mean opposite things, which is the whole reason the empty case is written explicitly rather than left out.

- **A write failure is logged, not fatal** — the opposite of `_redirects`, and deliberately. This is discovery, like `sitemap.xml` and `llms.txt`: a site published without its `robots.txt` is crawled with default assumptions. A site published without its redirects has old URLs 404ing for readers who already hold the links, which is why that one fails the build (`AIKB/kiss.md`).
