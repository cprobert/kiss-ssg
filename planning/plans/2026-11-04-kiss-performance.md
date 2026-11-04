# kiss-performance, cache headers, and the review groups — the contract

Branch `feat/review-groups-and-performance`. Session: `planning/sessions/2026-11-04-review-groups-and-performance.md`. Evidence: `planning/research/2026-11-04-static-site-performance.md` (two verified research passes and a measurement of the fleet's live headers). Amended in place with dated sections; never forked.

**The skill carries none of this file's evidence.** `kiss-performance/SKILL.md` states rules plainly, in kiss terms, with no citation, history or research context — the operator's instruction. This file and the research file hold the why.

## The four workstreams

| Workstream           | Owns                                                     | May touch                                                                                                                                                                                                                                                                        | Seam                                                                                           |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. Review groups** | the group question in `kiss-site-review`                 | `plugins/kiss-ssg/skills/kiss-site-review/SKILL.md`, `test/unit/skill-coverage.test.js`                                                                                                                                                                                          | names the four groups; the fourth names `kiss-performance` (B)                                 |
| **B. The skill**     | `kiss-performance` and the move out of `kiss-front-end`  | `plugins/kiss-ssg/skills/kiss-performance/`, `kiss-front-end/SKILL.md`, `kiss-accessibility/SKILL.md` (one pointer), `kiss-site-new`, `kiss-page-add`, `kiss-site-review` (links and fix rows), skill-coverage, `plugins/kiss-ssg/.claude-plugin/` manifests if they list skills | cites C's check ids and C's header files by name; contains no rule C contradicts               |
| **C. Engine**        | the performance audit checks and the cache-header writer | `lib/audit.js`, a new `lib/headers.js`, `lib/build-finish.js`, `lib/config.js`, `lib/kiss.js` (re-exports, report key), `AIKB/` docs for each, `GUIDE.md`, `llms.txt`, `README.md`, `types/`, tests                                                                              | the check ids and the header file names are public vocabulary, fixed here before B writes them |
| **D. Doc gaps**      | the six carried gaps and three dead paths                | `GUIDE.md`, `AIKB/html-split.md`, `AIKB/kiss.md`, `AIKB/robots.md`, consent docs                                                                                                                                                                                                 | none                                                                                           |

Order: C's vocabulary (this file) → C and B in parallel → A once B's skill exists → D any time. The measurement (§ Measurement) runs on B + C together.

## A. The review groups

After step 1 (the audit, always run — it is one command), `kiss-site-review` asks **one** `AskUserQuestion` with `multiSelect: true`:

| Option                | Runs                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| Content & discovery   | `kiss-writing-for-the-web`, `kiss-information-architecture`, `kiss-seo` |
| Interface & usability | `kiss-accessibility`, `kiss-front-end`, `kiss-design`                   |
| Legal & compliance    | `kiss-legal-and-privacy`                                                |
| Speed & performance   | `kiss-performance`                                                      |

- A group whose skill owns an audit check that fired is labelled `(Recommended)`. The mapping is one table in the skill (check id → group), so it is read, not inferred.
- "Other" text such as "all" or "just SEO" is honoured.
- A group not chosen is reported as **not run**, per skill, never folded into the others (the existing rule).
- Without `AskUserQuestion` (Codex), the same four as a numbered list in plain text, and wait for the answer.
- Four options is the tool's limit. A fifth domain is a second question, decided when it arrives.

`test/unit/skill-coverage.test.js` gains rows: the skill names all four groups, `multiSelect`, the not-run rule, and the plain-text fallback.

## B. kiss-performance

A domain skill (`CLAUDE.md` § What this is): plain-words name, build mode and review mode, review mode reports to `review-protocol.md` and looks through `browser-pass.md`; task skills link to it with an instruction to open it.

### What moves out of kiss-front-end

- The description's triggers "performance" and "layout shift" → `kiss-performance`. `kiss-front-end` keeps markup, CSS behaviour, interactivity, embeds-as-markup and external links.
- The build-mode bullet "Every `<img>` has its `width` and `height` … `loading="lazy"` … never to the first image" → `kiss-performance`. `kiss-front-end` keeps a one-line pointer.
- The `{{embed}}` bullet stays in `kiss-front-end` (it is markup and consent). `kiss-performance` links to it for "why a facade", never restates it.
- `kiss-accessibility`'s description: "or performance (kiss-front-end)" → "(kiss-performance)".
- `CONTRADICTIONS` bans in skill-coverage for each moved sentence in its old file.

### The rules the skill states (build mode)

Each traces to a verified finding or the measurement; the skill writes it as a rule, not a finding.

1. **The image a visitor sees first is never lazy.** It gets `fetchpriority="high"`; no more than one or two images on a page carry that hint.
2. **Every `<img>` and `<video>` has `width` and `height`** from its model; every `srcset` candidate keeps the same aspect ratio, and art direction with different ratios is `<picture>` with `width` and `height` on each `<source>`.
3. **Images below the first screen are `loading="lazy"`**, and so are iframes below it. `sizes="auto, <fallback>"` only on lazy images, never bare `auto`.
4. **Images are pre-encoded in a modern format** (AVIF or WebP, with a fallback in `<picture>` where needed) and no larger than they display, through `config.assets.pipeline` — kiss does not encode images. (Which tool is the site's choice; the skill names the shape, not a dependency.)
5. **One small stylesheet in `<head>`.** No `@import` chain. Inlining critical CSS is not the default and needs a measured reason.
6. **Fonts:** at most two preloaded, one format; a metric-matched fallback (`size-adjust` and the override descriptors) for each web font so the swap does not move text. Load only the weights and styles the design uses.
7. **Scripts are `defer`** (or `type="module"`), never a bare `<script src>` in `<head>`. `async` only for a script that must run early and depends on nothing.
8. **Third parties:** every one costs a connection and main-thread time. Embeds go through `{{embed}}` (kiss-front-end). `preconnect` only to the one or two origins the page uses straight away.
9. **Caching:** hashed assets (`assets.hash: true`) and the host header file kiss writes (C). Never `immutable` on a file that is not hashed.
10. **Prerender (optional):** one document-rules speculation ruleset with `conservative` or `moderate` eagerness, never `immediate` site-wide. Chromium only; a progressive enhancement.

### Review mode

- **The audit's performance checks** (C) — read from the report.
- **In the browser** (the browser pass), on each distinct template, at 320 wide with throttling where the tool offers it: identify the LCP element (a `PerformanceObserver` for `largest-contentful-paint` in the page), and check it is not lazy, is discoverable in the HTML, and is the `fetchpriority` image; record LCP and CLS (`layout-shift` entries, session-window) with the conditions they were measured under.
- **Lab is not field.** A browser run is a cold-cache lab run. The report says so, and never states a pass or fail of Core Web Vitals from it; field verdicts come from the site's CrUX data or the owner's analytics, if any. The thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at the 75th percentile) are stated as the targets, not as what the lab measured.
- **Delivery:** the response headers of the live site, if deployed (HTML, one hashed and one unhashed asset), against § C's policy.

Budget: the skill under 12k characters (the largest domain skill is 18k; this one has no prose rules to teach about words).

## C. Engine

### C1. Audit checks (appended to `CHECKS`, never slotted in)

Decided from facts extracted at write time, like every page check. New `PageFacts` fields; facts from an engine before them read as "not extracted" and the checks skip that page.

| Id                       | Fires when                                                                  | Detail                     | Notes                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `img-dimensions-missing` | an `<img>` lacks `width` or `height`                                        | the `src`                  | An `<img>` inside `<picture>` still needs its own. Inline `style="aspect-ratio…"` counts as reserved. CSS cannot be seen: a site that sizes every image in CSS ignores the check with that reason. |
| `img-lcp-lazy`           | the first `<img>` inside `<main>` (document order) has `loading="lazy"`     | the `src`                  | An approximation of "the image seen first", stated as one in GUIDE.md. A page with no `<main>` is not judged.                                                                                      |
| `fetchpriority-excess`   | more than two elements carry `fetchpriority="high"`                         | the count                  |                                                                                                                                                                                                    |
| `font-preload-excess`    | more than two `<link rel="preload" as="font">`                              | the count                  |                                                                                                                                                                                                    |
| `script-blocking`        | a `<script src>` in `<head>` with none of `defer`, `async`, `type="module"` | the `src`                  | `type="text/plain"` (a consent-gated script) and JSON/importmap/speculationrules types are not executable and do not fire.                                                                         |
| `cache-headers-unset`    | site-wide: the build has hashed assets and no host header format was chosen | the number of hashed files | mirrors the redirects `unset` warning; silent once a format, `'none'` or `[]` is chosen                                                                                                            |

Not checks, on purpose: preconnect counts (no verified number), `@import` (not in the HTML), image formats and byte sizes (the walk could, but "too big" has no verified line), anything needing layout.

### C2. Cache headers (`lib/headers.js`)

**What it writes.** From the asset manifest (which already names every hashed output) and the page registry:

| Files                                                   | `Cache-Control`                       | Why                                                                                                              |
| ------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| every hashed output (`.css`/`.js` the manifest renamed) | `public, max-age=31536000, immutable` | its bytes are its name                                                                                           |
| HTML pages                                              | `public, max-age=0, must-revalidate`  | a deploy is visible at once; ETag makes revalidation cheap. Firebase's default (an hour) is the one this changes |
| everything else                                         | not written — the host default        | an unhashed file's right lifetime is the owner's call; the skill says how to choose, and never `immutable`       |

Listed **by exact path**, never by glob: kiss knows the files, and a glob is what the fleet's hand-written rules got wrong.

**Formats** — the same shape as redirects, so a site learns one idea:

- `headers.json` — the host-neutral list `{ version: 1, rules: [{ path, headers: { 'Cache-Control': … } }] }`, written whenever there is a rule, whatever the format says.
- `'netlify'` → `_headers` (also read by Cloudflare Pages), and `'firebase'` → `headers.firebase.json`, a fragment to merge, never `firebase.json` itself. A writer function is a custom format. `'none'`/`[]` is a decision. GitHub Pages has no header file and cannot be configured; it is named in GUIDE.md as such.
- An existing `_headers` the site keeps in `src/assets/` survives under `overwrite: false`, as `_redirects` does.

**D1 — where the host is stated (decision for the operator after the critique).** Two shapes:

- **(a) `config.headers.format`**, beside `config.redirects.format`. Additive; two keys that will almost always say the same host.
- **(b) `config.host`** — one statement of where the site is deployed (`'netlify' | 'firebase' | [...]`), read by redirects and headers both; `redirects.format` keeps only the custom-writer function form, or goes. Fewer keys, and it is the statement `links.trailingSlash` is already described as. A break for every site that set `redirects.format`, with an upgrade note.

Recommendation: **(b)**, because "a convention nobody has to repeat" is the design philosophy and the host is one fact; but it is the larger change, so the critique should try to break it first.

**Report.** `report().headers`: `{ status, rules: <count>, files, formats, unset }`, beside `redirects`.

**Unverified host behaviour — must be measured before the docs state it:**

1. Netlify: precedence when `_headers` and `netlify.toml` `[[headers]]` both set `Cache-Control` for one path (docs are silent). Pro-plumbing sets it in `netlify.toml` today.
2. Firebase: header `source` matches the **request URL**, and before rewrites (docs). With `cleanUrls`, does `/about.html` as a source match a request for `/about`? If not, the fragment lists the served path, which kiss knows (`servedPathFor` with the site's `trailingSlash`).
3. Firebase: when two rules match, which wins (docs: "applied in the order they are defined").

These need a deploy preview on one Netlify and one Firebase fleet site (the operator's accounts), or the Firebase emulator. Until then GUIDE.md says only what is measured.

### C3. Docs

GUIDE.md § Launch-readiness audit (each new id, with its approximation and its ignore reason), a new § Cache headers next to § Redirects, `llms.txt` one index line each (and the trap: `immutable` only on hashed files), README if it lists features, `AIKB/audit.md`, a new `AIKB/headers.md` and its CLAUDE.md table row, `AIKB/build-finish.md`, `AIKB/build-report.md`, `types/`.

## D. The carried doc gaps

From the 2026-11-04 consent-dialog-services and 2026-11-02 kiss-legal-and-privacy Feedback. Each snippet run against the engine.

**Amendment 2026-11-04: already done.** All seven were closed by the `{{embed}}` branch (`137e36c`): items 1–6 are `GUIDE.md` § Cookie consent, "Where each piece goes"; item 7's references now read as history with no path. Workstream D has no work.

1. The consent docs say the site's `package.json` needs `"type": "module"`.
2. The default folders `folders` derives from `src`.
3. How a page gets its `id`.
4. One page can hold both the privacy policy and the consent history.
5. The URL shape under the default `trailingSlash`.
6. Which `{{embed}}`/consent hash keys are settings.
7. Dead paths: `lib/css-split.js` in `AIKB/html-split.md` and `AIKB/kiss.md`; `examples/_shared/assets/robots.txt` in `AIKB/robots.md`.

## Measurement

Per `CLAUDE.md`, a domain skill is judged by the sites it produces, on a site with the failures.

- **The slow-site fixture:** a copy of a fleet site, or a small kiss site built for it, with: a lazy hero, images without dimensions and served at twice their display size as JPEG, a blocking `<script>` in `<head>`, a Google Fonts link for twelve styles, a bare YouTube iframe, no hashing. Committed under `test/fixtures/` (an engine fixture, not an example — `CLAUDE.md` § What ships is an example).
- **Arms:** `scripts/arms.mjs`, one brief ("make this site faster"), with and without `kiss-performance`. Answer key: the fixture's planted failures plus "no rule it states is contradicted by the research".
- **Measured outcome:** LCP and CLS in the browser before and after each arm, same machine, same throttling, three runs each, median; the audit's performance findings before and after.
- Written up in `planning/reviews/2026-11-xx-performance-arms.md`.

## Open questions for the critique

1. Is `img-lcp-lazy`'s "first `<img>` in `<main>`" a fair approximation, or will it fire on pages whose first image is small and below the hero?
2. Should `cache-headers-unset` fire on a site with no hashing at all (nothing immutable to write), and should there be a check for "hashing is off"?
3. HTML at `max-age=0, must-revalidate` on Firebase: is listing every page's served path sound on a 1,000-page site (file size, Firebase's limits on header rules)?
4. D1: does `config.host` survive the redirects custom-writer case, multi-host sites and `'none'`?
5. Does anything here contradict a rule in `kiss-front-end`, `kiss-legal-and-privacy` (fonts and third parties) or `kiss-seo`?

## Amendment 2026-11-04: after the critique

One fresh-context critique, read-only, 20 findings (6 blockers). Claude re-checked the load-bearing code claims before acting on them: `llms.txt` is 15,966 of 16,000 characters; `writeRedirects` defaults to `overwrite = true` (`lib/redirects.js:579`) and generated output beats a copied asset (`lib/output-registry.js:53`); the banner logo has no `width`/`height` (`lib/consent-ui.js:82`). **This section overrides §C2, §C1's last row, the report sentence, rules 6, 8 and 10, and § Measurement wherever they disagree.** The operator decided D1, the site-kept `_headers`, and the deploy measurement; the rest are mechanics, decided by Claude from the evidence.

### D1, decided (the operator): `config.host`, with per-concern overrides

- **`config.host`** — where the site is deployed: `'netlify' | 'cloudflare' | 'firebase' | 'vercel' | 'github-pages'`, or a list of them. Unset by default: kiss does not guess.
- **`redirects.format`** and the new **`cacheHeaders.format`** default to the encodings `host` implies, and stay as overrides per concern (`'none'`, a list, a writer function). An existing `redirects.format` still wins, so no site breaks. `htaccess` stays a redirects format, not a host.
- Named `cacheHeaders`, not `headers`, because `config.fetch.headers` already exists and means something else.
- `host` is **never** read for `links.trailingSlash`: Firebase's slash policy lives in `firebase.json`, not in the host's name.
- What each host implies:

| `host`         | Redirects                 | Cache headers                                                               |
| -------------- | ------------------------- | --------------------------------------------------------------------------- |
| `netlify`      | `_redirects`              | `_headers`                                                                  |
| `cloudflare`   | `_redirects`              | `_headers`                                                                  |
| `firebase`     | `redirects.firebase.json` | `cache-headers.firebase.json` (a fragment, patterns)                        |
| `vercel`       | `redirects.vercel.json`   | none — a `warn`: no encoding for this concern yet                           |
| `github-pages` | none                      | none — silent: the host cannot be configured, and that is a fact, not a gap |

### The site's own `_headers`, decided (the operator): append

When the asset copy put a `_headers` in the build (the output registry holds it as `kind: 'asset'`), kiss keeps it byte for byte and appends one marked block after it (`# kiss-ssg: cache headers for hashed files — generated, do not edit`). Nothing of the site's is lost. This is a deliberate exception to "kiss never merges", and the reason is in the doc: this file is build output rebuilt on every deploy, unlike `firebase.json`, which is source. An integration test builds a site with a CSP in `src/assets/_headers` and asserts both survive.

### What is written (replaces §C2's table and "by exact path")

- **The hashed files** come from the asset manifest filtered to `isHashable(key) && key !== value` (`lib/asset-manifest.js`), plus the consent client `kiss-consent.<hash>.js` when `config.consent` is set. A copy whose target is outside `folders.build` is skipped.
- **Netlify and Cloudflare:** the hashed files by exact path, `Cache-Control: public, max-age=31536000, immutable`. **No HTML rules**: hosts answer several URLs per page (`/about`, `/about.html`, `/courses/index.html`), and Netlify's default for HTML is already right. The file is rebuilt every deploy, so exact paths never go stale.
- **Firebase:** stable patterns, never paths, because the fragment is merged into `firebase.json` by hand once. One `regex` for kiss's hash shape (`\.[0-9a-f]{8}\.(css|js)$`) and one for the consent client. kiss checks that **no unhashed file in the build matches** the pattern, and **warns** if one does, naming the file (the operator, at the 2026-11-04 pulse, against Claude's "fail": "It's an optimisation rather than a critical issue. So a warning will suffice"). An HTML rule (`no-cache`) is written only once the deploy measurement shows that Firebase keeps it at the edge.
- **`cache-headers.json`** (the host-neutral list) is written only when there is a hashed file or `cacheHeaders.format` is set, not on every build.
- **When it runs:** in `complete()`'s settle path after `_writeConsentClient()`, to `kiss._writeRoot`, latched like `_redirectsRun` and reset at replay. It is **skipped in dev** and when `_failures` is non-empty, as packages are. A second instance writing the same file is an output collision, and the warning names it.
- **Report:** `cacheHeaders`, **appended after `consent`**: `{ rules: [{ path | regex, headers }], files, formats, unset }`, or `null` when nothing was written. The upgrade note says every `AIKB/last-build.json` gains the key at its next `kiss-ssg aikb`.

### Must measure before the docs say it (the operator runs the deploy previews)

1. Netlify: does `_headers` or `netlify.toml` win when both set `Cache-Control` for one path? (pro-plumbing)
2. Firebase: are `regex` header rules applied, and in what order against `**` globs?
3. Firebase: does HTML at `max-age=0, must-revalidate` (no `s-maxage`) still come from the edge?

### Audit checks (replaces §C1)

| Id                       | Fires when                                                                                                                                                                                                | Reading       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `img-dimensions-missing` | an `<img>` lacks `width` or `height` and has no inline `aspect-ratio`. `<template>` and `<svg>` contents are already stripped, so kiss's banner logo is not judged; a `<noscript>` image is, deliberately | `strip()`     |
| `img-first-lazy`         | an `<img>` carries `loading="lazy"` and `fetchpriority="high"` (certain), or the first `<img>` in `<main>` before its first `<h2>` is lazy (approximate, worded "may be the first image seen")            | `strip()`     |
| `fetchpriority-excess`   | more than two `fetchpriority="high"`                                                                                                                                                                      | `strip()`     |
| `font-preload-excess`    | more than two `<link rel="preload" as="font">`                                                                                                                                                            | `stripForIds` |
| `script-blocking`        | an executable `<script src>` (by `inert()`/`scriptKind()`) in the head with no `defer`, `async` or `type="module"`. The head ends at the first `</head>` or `<body`; a page with neither is not judged    | `stripForIds` |
| `host-unset`             | site-wide: the build has hashed files or aliases, and neither `host` nor the concern's own format is set. The redirects `warn` line stays as it is                                                        | —             |

- New `PageFacts` fields: `imgNoSize: string[]`, `imgFirstLazy: string|null`, `fetchpriorityHigh: number`, `fontPreloads: number`, `blockingScripts: string[]`.
- Facts are never older than the engine running them (they are extracted in memory, and `last-build.json` does not carry them), so a missing field happens only in hand-built tests: `?? []`, or `?? null` and skip.
- One finding per image per page, as `img-alt-missing` does, and GUIDE.md says so.
- `kiss-site-review`'s table renames `cache-headers-unset` to `host-unset` and `img-lcp-lazy` to `img-first-lazy`. `stray-file`, `console-log` and `debug-dump` are listed as "no group".

### `llms.txt` (34 characters of room)

Two lines: one naming the performance check ids with a pointer to GUIDE.md, and one for `host` / cache headers with the trap ("`immutable` only on a hashed file"). An equal number of characters is cut from an existing passage, named in the commit that adds them.

### Skill rules changed

- **6. Fonts:** self-hosted, with a link to `kiss-legal-and-privacy`, which already says to drop the font CDN; metric overrides "where the browser supports them".
- **8. Never `preconnect`** to an origin a consent service gates, or to a font CDN: the connection hands the visitor's address over before any choice.
- **10. Speculation rules default to `prefetch`.** `prerender` is allowed only on a site with no third-party script, because a prerendered page runs its scripts for a visit that may never happen.
- **2. The consent banner's logo is kiss's markup** and outside the rule. It is not the site's to fix.

### Measurement (replaces § Measurement's fixture and arms)

- **A synthetic site**, never a copy of a client's site, under `test/fixtures/slow-site/`.
- **Both arms run the same engine (with C).** The "without" arm's plugin tree is this branch's after B with `kiss-performance` removed, so the arms measure the skill, not the move out of `kiss-front-end`.
- **The answer key is the planted failures only.** Whether a rule contradicts the research judges the skill, not a site, and is left out of the score.

## Amendment 2026-11-04: Lighthouse KPIs, `kiss-ssg speed` (workstream E)

The operator asked for Lighthouse to run before and after the skill's edits, so the skill produces measurable KPIs. Lighthouse becomes an **optional peer dependency** (the operator's choice of Claude's option 2). This replaces the intent's non-goal "no Lighthouse or other new dependency", which was Claude's and never the operator's.

**Measured facts it rests on** (`npm view`, 2026-11-04): `lighthouse` 13.6.0, 19,351,495 bytes unpacked, 22 direct dependencies, `engines.node >=22.19`. kiss-ssg's floor stays at 22.12, because only a site that installs Lighthouse needs the newer Node.

### The dependency

- `package.json`: `peerDependencies: { "lighthouse": "^13" }` and `peerDependenciesMeta: { "lighthouse": { "optional": true } }`. npm installs nothing for it, and a site without it hears nothing.
- `lib/speed.js` loads it with a dynamic `import('lighthouse')` resolved **from the site's folder**, never from kiss-ssg's. When the import is missing, the command exits 2 and prints one line: `npm install -D lighthouse`. When Node is older than 22.19, it says that instead.
- Lighthouse finds Chrome through its own `chrome-launcher`. With no Chrome installed, the command names `CHROME_PATH` and exits 2. kiss installs no browser.

### The command

```
npx kiss-ssg speed <site-script | build-folder | https-url> [--page /path]… [--runs 3] [--out <file>] [--against <file>]
```

- **What it measures.** A build folder is served as the site root, over HTTP on port 0, with the dev server's static rules (`serve-static`, no livereload). A site script resolves `folders.build` from its config and serves that folder; it does **not** build, because the skill builds first and says so. A URL is measured as it is, and that is the only way delivery (CDN, compression, cache headers) shows up.
- **Pages.** `/` by default; `--page` repeats.
- **How.** Lighthouse's mobile preset with simulated throttling (its default), the performance category only, `--runs` times per page (3 by default, 1–9 allowed), each run in a fresh Chrome.
- **What it reports.** Per page, the **median** of the runs for:
  - the performance score;
  - LCP, CLS, TBT, FCP and Speed Index;
  - `total-byte-weight` and the network request count.

  It also gives the spread (min–max) for the score, so noise is visible.

- **Output.** A table on stdout. `--out <file>` writes the JSON: `{ version: 1, lighthouse, runs, pages: [{ page, median: {…}, spread: {…} }] }`.
- **Comparing.** `--against <file>` prints before → after per page and metric, and the change. A metric is marked _changed_ only when the change is larger than the spread of both runs, so noise is never reported as a gain.
- **Where files go.** Never `folders.aikb`: only `kiss-ssg aikb` writes there. The skill saves the files in the system temp folder and puts the table in its report.
- **Exit codes.** 0 measured; 1 a page failed to load or Lighthouse errored; 2 a usage error or missing prerequisite.

### Where the logic lives

- `lib/speed.js` (decisions, unit-tested with no Lighthouse):
  - parse the arguments;
  - resolve the target;
  - extract the KPIs from a Lighthouse result object (fixture: one real result, trimmed, under `test/fixtures/lighthouse/`);
  - compute medians and spreads;
  - diff two files, with the noise rule;
  - format the table.
- `bin/kiss-ssg.js`: a thin `speed` wrapper.
- An integration test with a fake `lighthouse` module on the site's resolution path covers the wrapper end to end. A real run happens only with `KISS_LIGHTHOUSE_TESTS=1`, like the network tests.
- Documentation: `AIKB/speed.md` and its CLAUDE.md table row; GUIDE.md § Measuring speed; one `llms.txt` line, paid for by the same cut as the other new lines.

### The skill

`kiss-performance` gains a first and a last step:

1. Measure **before** any edit: build, then run `npx kiss-ssg speed <site-script> --out <temp>/speed-before.json`, with one `--page` for each distinct template. If Lighthouse is missing, offer `npm install -D lighthouse` and wait for the answer. A site that declines is reviewed without the KPIs, and the report says so.
2. Measure **after** the fixes, with the same pages and `--against` the before file. The report gives the table, and calls it a lab measurement on this machine, never the site's verdict.

The arms measurement (§ Measurement) uses the same command, so the skill is judged the way a site would be.
