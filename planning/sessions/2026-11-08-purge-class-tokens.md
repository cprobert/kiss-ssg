---
branch: fix/purge-class-tokens
base: main
status: open
opened: 2026-11-08
---

# Session — 2026-11-08: Purge keeps whole class tokens, and a reported bug has a path

## Intent (captured at /branch-open)

**Objective:** Fix the first reported bug, [#78](https://github.com/cprobert/kiss-ssg/issues/78). `assets.purge` and `kiss-ssg css` split class names on `/ [ ] . :`, so they remove Tailwind classes a page uses (and the audit overstates "Removable"), and nothing reports it. Make the build fail when a purge removes a class a page uses, and give reported bugs a path from issue to release.

**Success criteria:**

- [ ] `purgeCss()` passes PurgeCSS an extractor that keeps whole class tokens. Classes holding `/`, `[ ]`, `.`, `:` and variants (`bg-ink-900/80`, `min-h-[60vh]`, `p-1.5`, `hover:bg-brand-700`, `[&_p]:mb-6`, `max-h-[calc(100dvh-4.25rem)]`) survive the purge when a page uses them, and are removed when no page or script does.
- [ ] `kiss-ssg css`'s Removable figure comes from the same extractor. A test shows that figure for those class names, with no safelist.
- [ ] **The guard:** a build whose purge removes every rule for a class used on a built page fails (rejects, so `kiss-ssg check` exits 1). The failure names the class, a page that uses it and the stylesheet, and says how to resolve it (safelist, or a narrower purge). It does not fire on a selector correctly removed because another of its parts appears on no page (`.card .title` when no page has `.card`). It is seen to fail against the unfixed extractor before the extractor fix lands.
- [ ] Regression tests for the purge and the audit, each seen red against the current code first.
- [ ] Docs: GUIDE.md § Purged CSS, `kiss-performance`'s purge line and GUIDE's "Tailwind needs none of this" agree with the new behaviour. The script-built-class hole is stated as the guard's limit. `llms.txt` gets an index line for the guard if it is a trap worth one. AIKB `css-purge.md` and `css-audit.md` are updated. Every snippet changed is run against the engine.
- [ ] **Fleet criterion:** `node scripts/fleet-check.mjs` on `C:\Code\kiss\a1k9training` and `C:\Code\kiss\diploma-msc` (both purge) with `--base main`, and every difference explained. Also a1k9training **with its workaround safelist removed** (in the temp clone, never the site's folder): the guard passes, and the purged build matches the full build at 375 and 1440 wide for the hero and the nav, the regions the report names.
- [ ] **Clean-room criterion:** a fresh sub-agent with only the packed tarball and the shipped docs builds a small Tailwind v4 site with `assets.purge` and no safelist. Its build passes `kiss-ssg check`, the purged CSS keeps the `/ [ ] . :` classes the pages use, and it reports every place it had to guess.
- [ ] **Issue process:** `.github/ISSUE_TEMPLATE/` holds a bug-report form asking for the kiss-ssg version, Node and OS, the config excerpt, what happened against what was expected, and a reproduction, plus a `config.yml`. A reported issue has a recorded path into a branch: `/branch-open` accepts an issue URL and the session file records `issue:`; `/branch-close` puts `Fixes #N` in the PR body; the CHANGELOG entry links the issue. Skill code blocks stay within `test/unit/skill-code-blocks.test.js`'s allow-list.
- [ ] The #78 PR closes the issue (`Fixes #78`), and the CHANGELOG entry carries an `### Upgrading` note: a site that set the workaround safelist can drop it.

**Non-goals / out of scope:** replacing PurgeCSS. Detecting classes a script assembles from pieces: the guard cannot see them, and the docs say so. GitHub Projects, Discussions, bots or auto-triage. Creating GitHub labels or replying on #78 without the operator's go-ahead, since both are outward-facing. Any change to the a1k9training site itself: the operator decides whether it drops its safelist after release.

**Impact surface:** public API. A build that passed can now fail on the new guard, purged output changes for every site whose class names hold those characters, and GUIDE, llms.txt and the skills change. Proposed bump: patch 2.13.4 with an `### Upgrading` note (a bug fix). The operator decides at the close.

**Expected shape:** between. The extractor fix and its tests are planned. The guard's precise rule (what counts as a selector "for" a used class) and the issue-process wiring will be settled as they are built.

**Delegation convention:** none: one session. The operator reviews the diff at each pulse. Sub-agents only for the clean-room run and an independent review, and they never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-11-08 — the reporter's reply (session `a1k9training-8b`).** The reporter confirmed the plan covers #78 and asked for three additions to the existing criteria (not new scope):

- **Variant fixtures.** The purge and audit tests include an attribute/data variant (`aria-expanded:rotate-180`), a group variant (`group-open:…`) and an arbitrary-selector variant (`[&[open]]:…`).
- **One token rule for every content source.** Classes in `<noscript>`, in inline `<script>` strings and in the site's `.js` string literals are read by the same whole-token rule as the HTML, and a test shows it.
- **Guard noise cases.** The guard does not fire on Tailwind's `@property`/`@layer` blocks or on pseudo-element-only selectors (`::backdrop`, `::file-selector-button`). This is the reporter's expectation, untested, so a test settles it.

**Fleet criterion's comparison.** The fleet criterion reuses the reporter's computed-style harness, not only screenshots. It is an uncommitted scratch script at `C:\Users\court\AppData\Local\Temp\claude\c8935314931056d0\218640d2-9923-4d85-b13d-0815f3aaaca7\scratchpad\purge-compare2.mjs` (`CHROME_PATH=… node purge-compare2.mjs <full> <purged>`). Its a1k9training paths (`createRequire` on the site's `package.json`, `qa/serve.mjs`, `qa/pages.mjs`) are pointed at the temp clone. It has 2 expected skips (formFocus on `/courses/`), and the home hero video is not covered.

- **Baselines:** no safelist gave 25,360 differences; the workaround safelist gave 0 across 206 states and 58,442 elements. The target with the safelist removed on the branch is 0.
- **Known gap:** the aria-expanded chevron is a state the harness does not exercise, which the variant fixture above covers.

**Safelist after release.** The reporter recommends the operator drop it only after the harness shows 0 differences without it and `kiss-ssg check` exits 0 with the guard: a catch-all safelist hides what the guard exists to catch. The operator's decision; no change to the site on this branch.

**Out of scope, noted.** The reporter has a second, unfiled bug: `kiss-ssg aikb` names its staging folder wrongly. It stays off this branch unless the operator says otherwise.

**2026-11-08 — absorbed: the staging folder's name in the report (operator: "verify the second bug … what needs to change to ensure kiss is robust and works for this client").** This supersedes the line above.

- **Verified, measured.** a1k9training's committed `AIKB/last-build.json` (kiss-ssg 2.13.3) lists `cacheHeaders.files` as `docs.kiss-staging-20908-5k2eal\cache-headers.json` and `…\_headers`. Every `aikb` run writes a fresh random suffix, so the committed record churns on every run. Four of that site's session logs asked for it to be filed (2026-11-05 ×2, 11-07 ×2), and it never was.
- **Cause, reproduced against the engine** (scratch script calling `reportedPath` from `lib/build-report.js`):
  - The 2026-11-05 fix compares strings. With `folders.build: './docs'` the staging folder is `./docs.kiss-staging-…`, but `writeCacheHeaders` builds paths with `path.join`, which drops the `./`. The prefix test misses, and the staging path is reported unchanged.
  - An absolute path under staging is missed too.
  - This is not Windows-only: on POSIX, `path.join` also drops `./`.
- **The class:** a path is compared by its string, not by where it points. The fix compares resolved paths and reports them build-relative with `/`.
- **Siblings to sweep before the commit:** every other `reportedPath` and `stagingDir` comparison (`lib/staging.js` `reportedPath`/`stagedPath`, `lib/aikb.js`), and every writer that hands back `path.join`ed paths.
- **Criteria added:**
  - [ ] A red-first test: `folders.build: './site'` under `cleanBuild: 'atomic'` (and `KISS_AIKB`). No report field and no `last-build.json` value contains `.kiss-staging-` or `.kiss-old-`, on either platform.
  - [ ] Running `aikb` twice in a row on the fleet clone of a1k9training leaves `AIKB/last-build.json` byte-identical between the runs.
- **The reporter's specifics:**
  - `redirects.files` in the same record is already right, as `./docs/_redirects`. Expected for cache headers: `./docs/cache-headers.json` and `./docs/_headers`, in the same form.
  - The build log's lines also print the staging name (`./docs.kiss-staging-…/_redirects`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`). Same class, so the sweep covers the log lines too.
  - It reproduces under the default `cleanBuild: true` as well, because `aikb` stages regardless.
  - Once released, a1k9training retires its `AIKB/site.md` gotcha ("discard it when it's the only diff").
- **Also checked, nothing to do:** the earlier a1k9training upstream notes. `consent-missing` on `/maps/embed` was fixed by `fix/consent-missing-path-hosts`, and the embed poster by `{{embed poster=…}}`. Script-injected iframes are beyond a static audit, by design. The site's `qa:dev-watch` (`node generate dev`, `pgrep`) is the site's own script, not kiss.

**2026-11-08 — absorbed: three improvements a1k9training raised (operator chose all three).** The reporter says the site carries no other workaround, pinned setting or hand-edit because of kiss. These three are deliberate settings in its `router.js` today, raised as worth considering:

- [ ] **768 in the default image widths.** The defaults are 480/960/1440/1920. Lighthouse's mobile device (412px at 1.75x) wants about 721px, so full-width images get the 960; a 720 missed by one pixel on a1k9training. Measure before changing: one example's Lighthouse image KPI and its cache growth, with and without 768. Every site's encoded variants change, so the `### Upgrading` note says so (cache growth, `kiss-ssg images` to prune).
- [ ] **image-oversized and a `<picture>`'s fallback.** Today a fallback JPEG/WebP is judged by the same 200 KB limit as the format browsers load first, and that pushed a1k9training to cap widths at 1440. Settle the rule with the operator before building it: what a browser actually downloads, so judge the first `<source>` it would pick, with a test of the 1600-wide hero case.
- [ ] **The poster's button words, exposed.** `{{embed … poster=…}}`'s words reach a site's CSS through a data attribute or a custom property, so a restyle does not hard-code `'Play video'` and a `load=` change needs no CSS edit. Public API: GUIDE, `llms.txt` line, `README.md`, `types/`, and the skill that restyles embeds.

**Version.** With a default changed for every site and a new API, this is no longer a plain bug-fix patch. Revisit the proposed 2.13.4 at the close; the operator decides.

**2026-11-08 — operator decisions, and the feedback loop absorbed.** Items 4 (768 default width) and 6 (poster words) are approved. Item 5's rule goes to the operator before it is built ("Ok").

The operator wants client sites to report issues and feature requests to GitHub, so that a session improving kiss and the sessions using it keep a two-way loop. **Why:** the cross-session exchange on #78 proved useful. Four a1k9training reflections had said "file it against kiss-ssg" and none did: there was no step at the decision point and no tool. Absorbed onto this branch, extending the issue-process criterion. Decisions:

- **Site named by default:** the draft includes the site's name and public URL. Copy and file contents stay out, and a token-shaped value is refused (the repo is public).
- **Draft and printed command:** `kiss-ssg issue` never posts. It writes the body to a file and prints the `gh issue create` command for the operator to read and run.

Criteria added:

- [ ] **Mechanism.** A `kiss-ssg issue` command, whose decisions live in a tested `lib/` module with an AIKB doc and a `bin/` integration test. It drafts a body with kiss version, Node, OS, site name and URL, the relevant config keys and the last build report's summary. It searches for duplicates (`gh issue list --search`) and reports any. It writes the body to a file and prints the command. It refuses a token-shaped value, a test shows the refusal, and it never runs `gh issue create` itself.
- [ ] **Capture, on the site side.** The site's `kiss-branch-close` (kiss-memory) turns every reflection item about kiss into an issue draft at the close and puts it to the operator: file, or skip with a reason recorded. The site instructions `kiss-ssg init` writes, and `llms.txt`, say that working around kiss means drafting an issue. Feature requests are welcome.
- [ ] **Templates.** `.github/ISSUE_TEMPLATE/` has a bug form and a feature-request form, matched to what `kiss-ssg issue` drafts.
- [ ] **Triage, on the kiss side.** This repo's `/branch-open` lists open issues beside the feedback read-back and accepts an issue URL; the session file records `issue:`.
- [ ] **Return.** `/branch-close` writes `Fixes #N`, and the CHANGELOG entry links the issue, so `kiss-ssg upgrade` shows the reporting site its fix. A site's `kiss-branch-open` read-back retires a gotcha whose issue has shipped. A comment on the issue at release, approved by the operator, closes the loop publicly.
- [ ] **Clean-room.** The clean-room agent, meeting a kiss limitation, finds the instruction and drafts an issue with `kiss-ssg issue` without being told to.

**Version.** With a changed default, a new helper API and a new CLI command, propose a minor (2.14.0) at the close.

**2026-11-08 — code review of the first slice (operator's `/code-review`, high), and the guard dropped.** Ten findings. Claude reproduced findings 1 and 3 in a scratch probe against the engine before acting; the reviewer's own probe covered 1, 2, 3, 5 and 8. Dispositions:

1. **Quote or `>` inside brackets** (`before:content-['']`, `[&>svg]:size-4`) still cut: **fixed**. Bracket groups are part of a token.
2. **Guard judged by the extractor that missed**: **moot**, guard removed.
3. **Guard ignored ids, tags and attributes**, so `#sidebar .card` and `ul.menu` failed correct builds: **fixed by removing the guard**. The operator chose "make it impossible, drop guard": the pages' exact `class` attribute classes are a second PurgeCSS content item, so a markup class cannot be lost, and PurgeCSS still judges every selector in full. This **supersedes the Intent's guard criterion**. The `.btn[data-size=xl]` "guard fires" test had encoded the wrong behaviour; it is now a build that passes.
4. **Message names a missing `kiss-ssg issue`**: **moot**, the message went with the guard.
5. **`$&` in the build folder's name**: **fixed**, the replacement is a function.
6. **Logger rewrote diagnostics** (`err.stack`): **fixed**. Only `success` and `info` are mapped.
7. **Entity-encoded JSON not re-split**: **fixed**.
8. **Second entity decoder, prototype lookup**: **fixed**, it reuses `lib/links.js` `decodeEntities`.
9. **Tokenised N+1 times; quadratic `=` split**: **fixed**. Reads are cached per `html` list, and only the first `=` of an attribute-like token splits.
10. **`AIKB/kiss.md` not updated**: **fixed**.

Every fix was seen red, against `a4b8752` or under a mutation:

- the bracket regex (script string);
- the exact feed (`class="a>b"`);
- the decoded re-split;
- the first-`=` split;
- the correct-removal build;
- `$&`;
- the `warn`/`debug` passthrough.

Stop rule for any further round: same scope (this branch's `lib/` diff), ordinary sites (one site per script, honest files), correctness only.

**2026-11-08 — second review round (operator's `/code-review`, high), on `951548e`.** Nine findings. Dispositions:

1. **`WHOLE_TOKEN` quadratic**: **fixed**. Bounded bracket groups, and the trailing `:` trimmed by a loop. Measured red: 50–53 s on 200k characters for the old regex, 21 s for `/:+$/` (my own first draft of the trim). Now under the 250 ms test budget.
2. **The log and the report used two path rules**: **fixed**. `unstageText` hands each matched path to `reportedPath`.
3. **Unbound logger methods** (a class with private fields throws): **fixed**, every method is bound. A regression this branch had introduced.
4. **Patterns rebuilt per call**: **fixed**, compiled once per staging folder.
5. **`WeakMap` cache on list identity, never hit by the audit**: **fixed**. `purgeReads()` is made per run and keyed by text.
6. **Unmapped `error` lines name a discarded staging folder**: **recorded, not fixed**. They read the same way on `main`, so the change is outside the scope. Noted in `AIKB/staging.md`.
7. **`standard` redundant beside `greedy`**: **fixed**, `greedy` only. The greedy meaning for RegExps goes into GUIDE in the docs step.
8. **`\` treated as a separator on POSIX**: **fixed** with 2, and tested on POSIX only.
9. **GUIDE.md does not mention `DYNAMIC_ATTRIBUTES`**: the docs criterion, still open.

Each fix was seen red against `951548e` or under a mutation. No finding changed kind: all are ordinary-site cases.

**2026-11-08 — the purge proven on a1k9training in a clean room (operator: "Prove the purge on a1k9training in a fresh clean room"), and one more defect fixed.**

- **The clean room:** a robocopy of a1k9training's _working_ state (its uncommitted `router.js` holds the purge config) into `%TEMP%\cleanroom-a1k9`, without `node_modules`, `docs` or `.git`, then `npm ci` from its lockfile.
  - Its `router.js` copy chooses the purge by `CR_PURGE`. The site's own folder was not written to.
  - Engines: the published 2.13.3 from the lockfile, and tarballs of committed HEADs (`git archive` + `npm pack`), each checked for its exports before use.
  - Comparison: the reporter's harness, its paths pointed at the clean room, plus an `ariaExpanded` state (every `[aria-expanded]` set to `true`). Computed style of every element and its `::before`/`::after`, 20 pages, 375 and 1440 wide.
- **Results, full stylesheet (73,560 bytes, the issue's figure) against each purge, no safelist:**
  - **2.13.3: 35,217 differences** over 63,935 elements, plus 22 count or skip lines. The breakage reproduces: hero height, nav border, `p-1.5`.
  - **Branch at `9ed8b8b`: 62 differences**, every one a missing keyboard focus ring (`outline`/`box-shadow` on the nav button and form inputs). PurgeCSS 8.0.0 removes `:focus-visible { … }`, a selector made of pseudo-classes alone. The site's catch-all safelist had been keeping it by accident.
  - **Fixed in `2caac60`:** `PSEUDO_PART` in PurgeCSS's `standard` safelist, red-first test, recorded in `AIKB/upstream.md`.
  - **Branch at `2caac60`: 0 differences** over 69,428 elements and 246 state checks. The 2 skips are the reporter's expected `/courses/` formFocus. Purged CSS 54,747 bytes, against the reporter's 54,833 with the safelist. The only focus rule still removed, `.focus-visible\:outline-none`, appears in no page or script.

**2026-11-08 — review rounds 3 and 4, and the stop rule for the rest of the branch.**

- **Round 3** (the operator's `/code-review`, `main...HEAD`): 10 findings, all fixed in `08336d1`. The operator's call: check-mode write lines keep naming the build folder.
- **Round 4** (the operator's `/code-review` again; `/codex:review` did not run, "Your workspace is out of credits"): 10 findings, fixed in `e6bf1d1`.
  - **The headline:** the report had started rewriting a plain build's relative page paths (`docs/x.html` → `./docs/x.html`), so every page would have moved against a site's last record.
  - **A regression my round-3 fix made, found here:** the logger Proxy over an empty object lost spies, `Object.keys` and `instanceof`. Now back over the logger; a frozen logger passes through unmapped.
  - **Also fixed:** the `./` spelling, Always allow's label, GUIDE's safelist sentence (pseudo-classes and attributes match too), and two stale comments.
  - **Recorded, not fixed:** the one-slot cache under two concurrent instances; mixed separators on Windows; the audit's per-stylesheet page lists missing the joined-classes cache; AVIF counted as decoded everywhere (the operator's accepted cost).
- **The stop rule (operator, 2026-11-08: "Ordinary sites only").** One site per build script, honest files, current browsers. A finding outside that is recorded, not fixed. One more round only if it reads new code (the feedback loop), then the close's review. The branch still has no Codex review.

**2026-11-08 — the branch's remit, restated (operator: "Can we make this branch a bug fix and feature feedback branch. Is there need for multiple branches").** One branch, no split. Its remit is the client feedback from the #78 exchange:

- **Bug fixes:** #78 (the purge and the audit), the `kiss-ssg aikb` staging-name leak, and the `:focus-visible` loss the clean room found.
- **Feature feedback:**
  - item 4, the 768 default image width;
  - item 5, the `image-oversized` `<picture>` fallback rule, to be brought to the operator before it is built;
  - item 6, the poster button words exposed to CSS;
  - the issue process and the client feedback loop (`kiss-ssg issue`, the issue forms, `/branch-open` taking an issue URL, `/branch-close` writing `Fixes #N`).
- **Consequences:**
  - **Impact surface:** public API with new features. The Intent's proposed patch (2.13.4) no longer fits; the proposal at the close becomes a minor, 2.14.0, with `### Upgrading`. The operator decides.
  - **The #78 fix ships with the rest**, not ahead of it.
  - **The branch name stays `fix/purge-class-tokens`.** It is not pushed, so a rename is still cheap if the operator wants one. The PR title will name both halves.

**2026-11-08 — the purge proven on diploma-msc in a clean room (operator: "Approved to implement a clean room run with diploma-msc").**

- **The clean room:** a robocopy of diploma-msc's working tree into `%TEMP%\cleanroom-dmsc`, then `npm ci`. Its models are gitignored, so fleet-check's committed-state clone cannot build it. The copy's `config/assets.js` turns the purge off when `CR_PURGE=none`. The site's own folder was not written to. Three builds of 683 pages (`node router production`):
  - `full`: no purge;
  - `base-site`: 2.13.3 with the site's safelist;
  - `branch-site`: the `2caac60` tarball with the same safelist.
- **Sizes of `learna.css`:**
  - full: 195,874 bytes, 24.4 KB Brotli;
  - 2.13.3 purged: 97,454 bytes, 15.8 KB Brotli;
  - branch purged: 104,479 bytes, 16.5 KB Brotli.
  - `kiss-ssg css` reports Removable as 35% on the full build; the real saving is 32%.
- **Rules:** the branch removes **0** selectors that 2.13.3 kept, and keeps 73 more. All 73 are greedy-safelist Bootstrap compounds named by `/^show$/` and `/^dropdown/` (e.g. `.show>.btn-success.dropdown-toggle`).
- **Purge time:** the branch's `purgeCss` over all 683 pages, 39 scripts and the 191 KB sheet took 1.9–2.1 s in three runs, with a browser check running beside it.
- **Computed style, full against branch:** a sample of 51 pages (every root page, plus the first page of each folder) at 375 and 1440 wide, 251,940 elements. The states were rest, focusNav, openDetails and ariaExpanded. a1k9training's `menu` state was dropped: diploma-msc has no `site-menu`, and each miss cost two 30 s timeouts (the first run took more than 90 minutes for nothing).
  - 9,005 differences, **none from the purge**, sorted into:
    - **7,904 from the harness itself.** A computed `url()` is absolute, and the two builds are served on different ports (the `iti__*` flag sprites, the `LI` ticks). Normalised in the harness afterwards.
    - **Zero spelled two ways.** The minifier writes `0%` as `0`, so a background position or gradient stop computes as `0px` instead of `0%`, with the same rendering. It writes `outline:none` as `outline:0`: the style is `none` on both sides, so no outline is drawn, but Chrome reports the width as `medium` (3px) under the first spelling and 0px under the second (`#search-bar:focus`). Both rewrites are present under 2.13.3 too.
    - **Content that changes between loads.** The `/c/` images and the `/find-your-fit-quiz` card heights differ in both directions. Full against full on those pages gives the same kinds (272 differences).
    - **Time-driven.** The last 113: a countdown clock (`#clockdiv` and its `col-6` cells), a loading spinner, Vue fades caught halfway, and a testimonial carousel.
  - **2.13.3 against branch** on four of those pages (16 state checks): only the load-to-load kinds, and no others.
- **Scratch tools:** in the session scratchpad, `cleanroom/`: `build-dmsc.sh`, `purge-compare-cr.mjs` (now with `SAMPLE`, `ONLY`, `PAGES` and `ALL`, a 5 s action timeout, both sides printed, and zero positions and the origin normalised), `rule-diff.mjs`, `probe-icon.mjs`, `time-purge.mjs`.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-08** — First slice `a4b8752`, all five gates green, 0 commits behind `origin/main`.
  - **#78 extractor and audit: met for the engine.** Each test was seen red first:
    - 9 Tailwind classes plus the script-string case, red on `main`;
    - the unquoted attribute, red under a mutation;
    - the audit going 100% → 0% removable;
    - the safelist `greedy` change, red before the fix.
  - **Guard: met.** With 2.13.3's extractor put back, the Tailwind fixture build fails and names all 5 classes. The `.card .title`, partly-used component, `@property`/`@layer`/`@keyframes`/pseudo-element-only and safelist cases are silent.
  - **Staging leak: met in tests.** The integration build from a `./`-relative folder was red on the record (`public.kiss-staging-69272-y3nete\_headers`) and, separately, red on the log (`_redirects`, `sitemap.xml`). It is green and byte-stable across two records.
  - **Fleet: partial.**
    - a1k9training: identical (499 files, 0 differ). Its committed `router.js` has no purge, though, so this shows only that nothing else moved.
    - diploma-msc: both builds fail in the clone, 68 failures each, because its Orchard models are gitignored. The folders are byte-identical. The branch's check log names no staging folder; base's names it on 7 lines (`public.kiss-staging-39020-qw41ss/css/…`). All 36 page entries differ; inferred, not measured, to be the same mapping.
  - **Not started:** criteria 4–6, the feedback loop, docs, the clean-room check.
  - **Eyeball: looked** — the guard's failure message for 5 Tailwind classes. "Reads right."
  - **Review:** the operator runs `/code-review` on the slice. Pending.
  - **Offer:** the staging logger Proxy — **kept**.
  - **Decision: adjust course, then continue.** `scripts/fleet-check.mjs` gets a way to copy named site paths (uncommitted or gitignored) into its clone, with a `test/unit/` test. (The second pulse below supersedes the "guard" lines above: the guard was removed after review round 1.) Then diploma-msc reruns with its models, and a1k9training with its working `router.js`, with and without the safelist, through the reporter's harness. Before the docs and the feedback loop.

- **2026-11-08 (second pulse, after review rounds 1 and 2)** — at `9ed8b8b`, all five gates green, 0 commits behind `origin/main`.
  - **#78 engine: met in tests.** Markup classes reach PurgeCSS exactly. `classTokens` is linear (the old pattern took 50–53 s on 200k characters). The audit uses the same purge.
  - **Guard: superseded** by the operator's decision after round 1. Failure is impossible for markup classes. A correct removal (`#sidebar .card`) passes; it failed at `a4b8752`.
  - **Staging leak: met in tests and on a real site.** a1k9training fleet check: identical (499 files, 0 differ). The base check log names `kiss-staging` on 7 lines, the branch's on 0.
  - **Fleet purge comparison: not yet.** It needs the overlay.
  - **Not started:** criteria 4–6, docs, the feedback loop, clean-room.
  - **Eyeball: looked.** The operator could not see the terminal. Claude rendered both check logs verbatim side by side with Playwright (webapp-testing skill) and sent the image to the operator's device. "Reads right."
  - **Offer:** `DYNAMIC_ATTRIBUTES` (ARIA states kept whatever the markup holds) — **kept**.
  - **Decision: continue.** The fleet-check overlay, then the real-site purge proof, before the docs.

- **2026-11-08 (third pulse, after the clean room)** — at `a6d09e2`; the gates were green at `2caac60`; 0 commits behind `origin/main`.
  - **#78 on a real site: met for a1k9training.** Clean room, no safelist:
    - 2.13.3: 35,217 computed-style differences;
    - branch: 0 over 69,428 elements and 246 states (the Amendment above).
  - **The `:focus-visible` loss the clean room found:** fixed red-first (`2caac60`), recorded in `AIKB/upstream.md`. This engine change came after both review rounds and has no independent review yet; the close's review is owed.
  - **Fleet: partial.** a1k9training has the stronger clean-room proof. diploma-msc is still unproven (its Orchard models are not in the clone). The fleet-check overlay is still not built: the clean room did the job by hand.
  - **Not started:** docs, criteria 4–6, the feedback loop, clean-room agent.
  - **Eyeball: looked.** A rendered image sent to the operator: keyboard focus on a1k9training's Menu button, from the unpurged build, the branch before the fix, and the branch now. "Reads right."
  - **Offer:** `PSEUDO_PART` in PurgeCSS's `standard` safelist — **kept**.
  - **Decision: continue.** diploma-msc next, by the same clean-room method (copy its `src/models`), then the docs.

- **2026-11-08 (fourth pulse, after diploma-msc)** — at `b95c15c`; no `lib/` change since `2caac60`, when the gates were green; 0 commits behind `origin/main`.
  - **#78 on real sites: met for both.**
    - a1k9training: 0 differences.
    - diploma-msc: no difference from the purge; the 9,005 found are all traced (the Amendment above). The branch keeps every rule 2.13.3 kept, plus 73 greedy. The purge takes ~2 s over 683 pages.
  - **Fleet: met by the clean rooms**, built by hand. The fleet-check overlay was not built and is now optional.
  - **Not started:** docs, Upgrading/`Fixes #78`, the clean-room agent, the issue process and feedback loop, items 4–6.
  - **Review:** `2caac60` still has no independent review; the close's is owed.
  - **Drift:** none. The first harness run stalled for 90+ minutes on a1k9training's `menu` selectors. The operator caught it ("I suspect this has stalled"), and it was rerun with a state filter and a 5 s timeout.
  - **Eyeball: looked.** A rendered image sent to the operator: diploma-msc's home page, unpurged against the branch purge, at 375 and 1440. "Reads right."
  - **Offer:** sampling 51 of 683 pages for the browser check, with the rule comparison covering all 683 — **kept**.
  - **Decision: continue.** The docs next.

- **2026-11-08 (fifth pulse, after the docs, items 4–6 and review round 3)** — at `08336d1`; all five gates green at `08336d1` before its AIKB edits, `test/aikb.test.js` and prettier green after; 0 commits behind `origin/main`.
  - **Docs: met, except the CHANGELOG** (at the close, with the version). `7d333c4`:
    - GUIDE § Purged CSS says what counts as used, the hole and the greedy safelist; each of its 14 claims was run through `purgeCss`.
    - "Tailwind needs no purge" is replaced by measured numbers (9.4 → 8.4 KB Brotli) and banned in `CONTRADICTIONS`, seen red.
    - No `llms.txt` line for the purge: 24 characters to spare, and the trap is in GUIDE and the skill an agent turns the purge on from.
  - **Item 4: met** (`05751c4`). 768 in the default widths. a1k9training, 20 pages at 412 px and 1.75x: −19.9% image bytes to a phone, +16% cached.
  - **Item 5: met** (`2700b6e`). The operator chose "first `<source>` only"; a1k9training at 1600 wide: 10 findings → 0.
  - **Item 6: met** (`aad5f5b`). `data-kiss-embed-label`, checked in Chromium. The reporter session was told of 4–6.
  - **Review round 3** (the operator's `/code-review`, over `main...HEAD`, so it covers `2caac60` too): 10 findings, all fixed red-first in `08336d1`. The operator's call on one: check-mode write lines keep naming the build folder. The largest fix (`lib/staging.js`) was shown to the operator.
  - **Not started:** the issue process and feedback loop (contract first), the clean-room agent.
  - **Drift:** none beyond the remit amended at `075dc3c`. The proposed version is a minor (2.14.0). GUIDE's "Before 2.14" and "wider than 2.13" follow that proposal and change if the operator chooses another number.
  - **Eyeball: looked.** GUIDE § Purged CSS rendered from `docs/guide/assets/`, sent as an image. "Reads right."
  - **Offer:** the fallback `src` stays the lower-middle width, so a 960–1440 px source now gets a 768 `src` — **kept**.
  - **Decision: continue.** The feedback-loop contract (`planning/plans/`), its adversarial critique, then the build. Then the clean-room agent.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
