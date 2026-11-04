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
