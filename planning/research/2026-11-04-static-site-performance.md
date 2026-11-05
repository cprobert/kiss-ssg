# Static-site performance — research pass 1 (2026-11-04)

Source material for `planning/plans/2026-11-04-kiss-performance.md`. **Not** for the skill: `kiss-performance/SKILL.md` states rules plainly, with no citations, history or lineage from this file.

Produced by the `deep-research` workflow (run `wf_b18d1b01-c36`): 5 search angles, 23 sources fetched, 113 claims extracted, **25 verified** by three adversarial votes (23 confirmed, 2 refuted). The other 88 extracted claims were not verified — the workflow's budget — so the gaps below are gaps in _verified_ evidence, not in what was found.

## Verified findings

### Measurement: what "good" is, and what Lighthouse scores

- **Field thresholds** (Core Web Vitals, judged at the 75th percentile of page loads, mobile and desktop separately): LCP ≤ 2.5 s good, > 4 s poor; INP ≤ 200 ms good, > 500 ms poor; CLS ≤ 0.1 good, > 0.25 poor. INP replaced FID in March 2024; none has changed since. — web.dev/articles/defining-core-web-vitals-thresholds, web.dev/articles/vitals (3-0)
- **Lighthouse 10 score weights:** TBT 30%, LCP 25%, CLS 25%, FCP 10%, Speed Index 10%. INP is not measured in the lab; TBT is the lab proxy for responsiveness (inferred from other Chrome docs, not the scoring page). Each metric maps to 0–100 on a log-normal curve from HTTP Archive data: the 25th-percentile site scores 50, the 8th-percentile site 90. Weights documented for v10 only; that 11–13 kept them is inferred. — developer.chrome.com/docs/lighthouse/performance/performance-scoring (3-0)
- **Lab ≠ field.** CrUX is real Chrome users over a rolling 28 days. Lab CLS counts only above-the-fold shifts during load; field CLS is the worst session window over the page's whole life (shifts < 1 s apart, window ≤ 5 s), so late shifts — injected content, lazy images or iframes with no dimensions — fail in the field and pass in Lighthouse. Lab runs are cold-cache and never restore from bfcache, so caching and bfcache eligibility improve field LCP and show only as Lighthouse diagnostics. — web.dev/articles/lab-and-field-data-differences (3-0)

### LCP

- **LCP breaks into four parts**, recommended shares (guidelines, not rules): TTFB ~40%, resource load delay < 10%, resource load duration ~40%, element render delay < 10%. Static-host mapping (synthesis): TTFB = CDN edge + redirects; load delay = how early the LCP resource is discoverable; load duration = image bytes; render delay = blocking CSS and fonts. Chrome field data shows TTFB and load delay usually dominate. — web.dev/articles/optimize-lcp, updated 2025-03 (3-0)
- **Never lazy-load the LCP image**: `loading="lazy"` always adds load delay, because the fetch waits for layout. **`fetchpriority="high"` on the likely LCP `<img>`, on one or two images at most**, or it stops helping. Images start below High (Low; Medium for the first five large images since Chrome 117) and are raised only at layout. Google Flights: LCP 2.6 s → 1.9 s (one case study). The hint matters less when the image is already discovered early and most when many resources compete. — web.dev/articles/optimize-lcp, web.dev/articles/fetch-priority (3-0, default-priority claim 2-1)

### CSS and FCP

- **Stylesheets whose media matches are render-blocking**; a large or chained stylesheet delays FCP. `media="print"` or a non-matching query does not block. Inlining critical CSS moved FCP 1 s → 0.8 s in a toy demo, but Google calls deferring CSS an **advanced technique that can cause bugs** and says most sites meet the targets without it. Default: a small stylesheet. — web.dev/articles/defer-non-critical-css (3-0)

### Fonts and CLS

- **Metric-matched fallback fonts** — an `@font-face` for a local font with `size-adjust` plus `ascent-override`, `descent-override`, `line-gap-override` — can effectively eliminate font-swap layout shift. Safari supports `size-adjust` but (verifiers' recall) not the overrides. Line wrapping can still differ. — developer.chrome.com/blog/font-fallbacks (3-0)
- **Preload only the one or two most important fonts, in one format**: preload takes bandwidth from other resources and ignores `unicode-range`. — web.dev/articles/font-best-practices (3-0)

### Delivery

- **The HTTP/1.1 workarounds mostly no longer apply; domain sharding now does harm.** ~85% of requests are HTTP/2+; requests via a CDN almost never use HTTP/1.1 (< 4%); ~85% of HTTP/3 responses come from a CDN. Sharding is the main cause of redundant connections in Chromium (36–72% of HTTP Archive sites, 2021). Separate credentialed/anonymous connection pools are another cause. — almanac.httparchive.org/en/2024/http, arxiv.org/abs/2110.14239 (medium: the "no longer apply" is inference; 2021 figures)

## Refuted — must not go into the skill as stated

- The `font-display` timings ("block up to 3 s", "`optional` delays ≤ 100 ms and guarantees no shift") — 0-3.
- "Self-hosting fonts is not faster than Google Fonts" — 1-2.

## Not covered by any verified claim

Responsive `srcset`/`sizes`; AVIF/WebP; `width`/`height` (only implied via CLS); `decoding`; unused CSS; `@import` chains; `defer`/`async`/`type="module"`; tag managers; consent managers; YouTube/map facades; `preconnect`, `dns-prefetch`, `modulepreload`, speculation rules; `Cache-Control: immutable`; Brotli; HTML revalidation; bfcache blockers; page-weight and request budgets from field data.

Open questions the workflow left:

1. Which image formats and responsive markup does field data link to passing LCP/CLS, and when does AVIF backfire (decode cost, encoder quality)?
2. What do Netlify, Firebase Hosting, GitHub Pages and Cloudflare Pages send by default for HTML and hashed assets, what can each be configured to send, and do any block bfcache?
3. How much do third-party scripts, consent managers and embeds cost INP/TBT/LCP on otherwise static pages, and do facades recover it in field data?
4. Are speculation rules worth adding on a multi-page static site, and at what cost?

## Pass 2 — the gaps (run `wf_770f2f36-7c7`)

23 sources fetched, 108 claims extracted, 25 verified (23 confirmed, 2 refuted).

### Images

- **`width` and `height` on every `<img>` and `<video>`, eager or lazy**, or the space reserved with CSS `aspect-ratio`. Browsers derive the aspect ratio from the attributes before the image loads. Without them a late lazy image shifts the layout, and images default to 0×0, so a gallery can load every image at once. — web.dev/articles/lazy-loading-images, web.dev/articles/optimize-cls (3-0)
- **One `width`/`height` pair is right only if every `srcset` candidate has the same aspect ratio.** For art direction with different ratios, `<picture>` with `width` and `height` on each `<source>` (all three engines). — web.dev/articles/optimize-cls (3-0)
- **Chrome's lazy-load distance is fixed**: 1250 px on 4G, 2500 px on 3G or slower; authors cannot change it; applies to horizontal scrollers since Chrome 121. — web.dev/articles/lazy-loading-images (3-0)
- **`sizes="auto"`** picks the candidate from layout width, only on `loading="lazy"` images with a `w`-descriptor `srcset` and explicit dimensions; ignored on eager images. Chrome/Edge 126, Firefox 150, **not Safari** — write `sizes="auto, <fallback>"`. — web-features explorer, Blink intent to ship, WHATWG HTML (3-0)
- **Modern codecs (AVIF) are a key way to reduce LCP**, if the byte saving outweighs AVIF's higher decode cost and lack of progressive rendering — favourable for pre-encoded images on a static site; AVIF's slow encoder matters only for on-the-fly encoding. No measured LCP delta given (medium). — web.dev/articles/avif-updates-2023
- _Refuted 0-3_: Imgix's "AVIF 60% smaller than JPEG, 35% smaller than WebP".

### Third parties, scripts and embeds

- **Embeds are heavy; a facade or click-to-load fixes it.** Many embeds ship > 100 KB of JS, some 2 MB. YouTube: facade ~3 KB against ~540 KB for the player; `loading="lazy"` on a below-the-fold YouTube iframe saves ~500 KB. Figures are 2020–21 snapshots (medium). — developer.chrome.com/docs/lighthouse/performance/third-party-facades, web.dev/articles/embed-best-practices
- **A facade's cost**: not the full embed; autoplay after lazy load is unreliable; Lighthouse 13 removed the facades audit. (medium)
- **Embeds shift the layout unless their space is reserved**: `width`/`height` on the iframe, `min-height` per breakpoint on the container, or `aspect-ratio`. A `min-height` still shifts a little if the content renders taller. — web.dev/articles/embed-best-practices, optimize-cls (3-0)
- **A consent manager's INP cost is mostly the third-party scripts it releases on the click**, plus its own synchronous DOM teardown. Fixes: yield in the click handler (`scheduler.yield`, falling back to `scheduler.postTask` user-blocking), and on close hide with `display:none` at once and remove the nodes in `requestIdleCallback`. PubConsent: CMP INP up to −64%, page INP 470 → 230 ms (vendor co-authored, best case, medium). — web.dev/case-studies/pubconsent-inp
- **`defer` for non-critical scripts** (document order, after parsing, never blocks the parser); **`async`** only when a script must run early (any order, can block parsing mid-parse). No measured metric effect verified. — web.dev/articles/efficiently-load-third-party-javascript, HTML spec (3-0)
- **`preconnect` saves ~100–500 ms for an origin used early; only the few certain ones.** Chrome closes an unused preconnect after ~10 s; extra ones compete for bandwidth and CPU. — same (3-0)

### Speculation Rules

- **Prerender makes navigation near-instant** (Chromium only): near-zero LCP (measured from activation), lower CLS, better INP. One document-rules ruleset covers a multi-page site, filtered with `href_matches`/`selector_matches`; document rules default to `conservative`. The browser may ignore hints under Save-Data, energy saver or low memory. — developer.chrome.com/blog/prerender-pages, speculation-rules-improvements (3-0)
- **Over-speculation backfires** (bandwidth, memory, CPU on pages never opened). Chrome caps: immediate 50 prefetch / 10 prerender; eager and moderate on mobile 6/2, desktop 2/2; conservative 2/2. Prefer `conservative` or `moderate`. — same (3-0)
- _Refuted 0-3_: the eagerness trigger timings (200 ms hover, 50 ms viewport).

### Still not covered after two passes

Cache headers and compression per host; `immutable` / `no-cache`; redirect chains; the 800 ms TTFB guideline; bfcache eligibility and its field effect; Web Almanac page-weight medians; `@import`, unused CSS, `content-visibility`; the 14 KB initial window; minification after compression; `decoding="async"`; `preload`/`modulepreload` backfires; `dns-prefetch`; view transitions; analytics double-counting under prerender; tag managers; self-hosting third-party scripts.

## Measured — what the fleet's hosts actually send (2026-11-04)

Measured, not researched: Node `fetch` with `accept-encoding: br, gzip`, the home page plus the first same-origin stylesheet, script and image on it (scratch script `headers.mjs`). One request each, so `age` and cache hits mean nothing here; the headers are the finding.

| Site (host)                      | HTML                                      | Hashed CSS/JS                                               | Unhashed CSS/JS/image                                                                      | Encoding           |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| a1k9training (Netlify)           | `public,max-age=0,must-revalidate` + ETag | `max-age=31536000,immutable` (site-configured)              | image `max-age=31536000`, **no `immutable`, not hashed**                                   | br                 |
| pro-plumbing (Netlify)           | `public,max-age=0,must-revalidate` + ETag | `max-age=31536000,immutable` (configured in `netlify.toml`) | image `max-age=86400, stale-while-revalidate=604800`                                       | br                 |
| k9-solutions (Netlify)           | `public,max-age=0,must-revalidate` + ETag | — (no hashing)                                              | CSS, JS, image all `max-age=0,must-revalidate` — **Netlify's default, nothing configured** | br (not on JS)     |
| diploma-msc (Firebase)           | `max-age=3600` — Firebase's default       | —                                                           | image `max-age=31536000` (site-configured), **not hashed**                                 | br, HTTP/3 offered |
| swan-love (GitHub Pages)         | `max-age=600`                             | —                                                           | everything `max-age=600`                                                                   | **gzip only**      |
| medicalinterviewsuk (Cloudflare) | 403 to the probe                          | —                                                           | —                                                                                          | br                 |

What follows from it:

1. **Netlify's default for every file is `max-age=0, must-revalidate`.** Right for HTML; for assets it means a repeat visit revalidates every stylesheet, script and image — one round trip each — unless the site configures headers. k9-solutions configures none.
2. **The site-written rules go wrong in both directions.** Two sites give unhashed images a one-year lifetime (a1k9training, diploma-msc): a replaced photograph stays stale in returning visitors' caches for up to a year. One gives nothing (k9-solutions). Only pro-plumbing's `netlify.toml` gets both kinds right, and its comments spell out why.
3. **kiss already knows which files are safe to cache forever**: only `.css` and `.js` are hashed (`AIKB/asset-manifest.md`), and the manifest names every one. The host rules are hand-written globs (`/css/*`) that cannot know that.
4. **Firebase's HTML default (`max-age=3600`)** means a deploy can take up to an hour to reach a returning visitor's browser.
5. **GitHub Pages** sends `max-age=600` on everything, gzip only, and cannot be configured: hashing gains nothing there beyond ten minutes.
6. `diploma-msc` loads Google Fonts (12 Roboto styles in one request: six weights, upright and italic) and Cookiebot from third-party origins.

## Pass 3 — bundling, minification, unused code (run `wf_c778cb09-ae6`)

The operator's subject from the start, which the first two briefs left out because kiss has no bundler. That was Claude's scoping error: the skills state what is best for the site, not what kiss supports (the operator, 2026-11-04). Verified:

- **Bundling for request count no longer pays on a CDN.** Under 4% of CDN requests are HTTP/1.1, and 85% of all requests are HTTP/2 or later (Almanac 2024, high). In a lab test, 5–15 initial requests made no measurable difference to load, start-render or FCP. Overhead appeared only at hundreds of requests, and 20–25 balanced speed against caching (web.dev, Next.js, 2020; one lab test, medium).
- **Bundling still matters for nested ES modules.** Each import is found only after its parent loads, so a deep graph is a chain of round trips that multiplexing cannot collapse; `modulepreload` is the partial fix. One or two standalone scripts are barely affected (Vite docs, a vendor, no measurement; medium).
- **Split any single JS bundle over about 50–100 kB** so V8 can stream-parse it off the main thread. The cost of JS is download plus execution, not parsing (V8, 2019; medium).
- **TBT:** a long task is one over 50 ms; good is under 200 ms on mobile (web.dev 2025, high).
- **The median mobile page ships 558 KB of JS over 22–23 requests, and 44% (206 KB) is unused on load** (Almanac 2024, high). "Unused on load" includes code that runs later.
- **Most of the web already minifies**: the median page has about 12 KB of minifiable JS, measured before compression, and 82.7% of the unminified bytes are first-party (Almanac 2024, high).
- **Lighthouse's minify and unused-code audits are advice, never in the score.** "Reduce unused JavaScript" flags each file with more than 20 KiB unused (Chrome docs, high). The unused-CSS threshold is unconfirmed (a 2 KiB claim was refuted 1-2).
- **Unused CSS slows the first render**: every external stylesheet is downloaded and parsed before paint (Chrome docs, high).
- **Purging CSS removes classes that appear only at runtime** unless they are safelisted (`safelist`, or `/* purgecss ignore */`, written `/*! … */` if cssnano runs first). `@keyframes`, `@font-face` and variables are kept by default (PurgeCSS docs, high).
- _Refuted:_ "a bundler need not limit its chunk count under HTTP/2" (0-3); the 2 KiB unused-CSS threshold (1-2).
- _Not verified, so measured below:_ savings from minifying after compression; the cost of whole libraries; purge and tree-shaking gains.

## Measured — CSS and JS on the three live fleet sites (2026-11-04)

Chromium coverage on two pages per site: one load, a scroll to the bottom, a 412 px viewport (scratch `payload-probe.mjs`). Code that runs only on a click counts as unused, so "used" is a lower bound and the possible savings are upper bounds. Sizes are decoded bodies. "br" is Brotli quality 11 computed here; "min" is terser for JS and lightningcss for CSS.

| Site         | Own CSS+JS (br) | …minified, then br | Own code used                  | Third-party CSS+JS (raw) |
| ------------ | --------------- | ------------------ | ------------------------------ | ------------------------ |
| k9-solutions | 6.9 KB          | 5.7 KB (−17%)      | 62%                            | 0                        |
| diploma-msc  | 134.1 KB        | 132.8 KB (−1%)     | CSS 16–20%, JS 34–52% per file | 2,772 KB                 |
| swan-love    | 51.6 KB         | 50.7 KB (−2%)      | 21%                            | 3,091 KB                 |

- **Minifying an already-minified file saves about 1–2% after Brotli. An unminified one saves 17% here**, but on k9-solutions that is 1.2 KB.
- **Whole libraries:** Bootstrap's CSS on swan-love is 100 KB raw (13.4 KB br), 6% used on the two pages. Bootstrap's JS is 22% used and jQuery 1.10 is 36% used. diploma-msc's stylesheet is 16% used **after** it was purged, and its `pretty-checkbox.min.css` is not used on either page.
- **Third parties outweigh everything else**: SoundCloud's widget at 2.4 MB, and on swan-love a Facebook SDK (263 KB) that a script injects, so the build's `thirdParty` list never saw it. On diploma-msc, a Vimeo player loaded with the page (about 1.8 MB) and Cookiebot (about 590 KB).

So the order of payoff here is: click-to-load third parties first, then remove unused CSS and JS, then minify whatever ships unminified. Bundling for request count comes last, and only for a chain of ES module imports.

## Caveats

Mostly Google-authored sources — right for metric definitions, single-vendor framing elsewhere. Case-study numbers (Flights 0.7 s, critical CSS 0.2 s) are single tests, not typical effects. Lighthouse weights are v10's; connection figures 2021; Almanac 2024; fetchpriority defaults Chrome-specific.
