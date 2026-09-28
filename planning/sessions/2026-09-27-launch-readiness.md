---
branch: feat/launch-readiness
base: main
status: open
opened: 2026-09-27
---

# Session — 2026-09-27: Launch readiness — audit findings in the report, and a review skill that reads them

## Intent (captured at /branch-open)

**Objective:** Give every kiss build a set of advisory launch-readiness findings, decided from the written HTML and the build folder, so the checks a "does this site look finished?" review would make run on every build and every `kiss-ssg check`. Then ship a `kiss-site-review` plugin skill that reads those findings and does the judgement pass only an agent with a browser can do. The idea came from a "make it not look vibe-coded" prompt the operator found online, adapted for a static site: the SPA-only concerns are dropped (loading states, bundle size), and so is the "hide how it was built" framing.

**Success criteria:**

- [ ] **Head metadata** reported per page: `<title>` and meta description missing, or duplicated across pages; `og:image` missing; and site-wide, no favicon (no `<link rel="icon">` and no `favicon.ico` in the build).
- [ ] **Content structure** reported per page: an `<img>` with no `alt` attribute (`alt=""` counts as present, because it marks a decorative image); not exactly one `<h1>`; a skipped heading level.
- [ ] **Site-level** reported: no `404.html` in the build; the site url is left at localhost or a preview host.
- [ ] **Output hygiene** reported: files in the build that should not ship (source maps, `.env`, `.DS_Store`, logs, dotfiles); `console.log` left in shipped `.js`.
- [ ] Every finding is **advisory**: it appears in `kiss.report()` and the printed summary and never fails the build. **Each check can be switched off individually** under one config key, and the whole audit can be switched off too. All checks default to on. Skipped in dev, like `links`.
- [ ] Each finding is tested, and the test is seen red for the right reason (the failure message is read, not just counted) before the implementation lands.
- [ ] A site with none of the problems gets a clean audit. Every example's findings are looked at and either fixed (what ships is an example) or justified in the example.
- [ ] Public API obligations: `llms.txt`, `README.md`/`GUIDE.md`, `types/` regenerated, a new `AIKB/` doc and a row in the CLAUDE.md table, and `test/unit/skill-coverage.test.js` rows.
- [ ] `kiss-site-review` skill in `plugins/kiss-ssg/skills/`. It runs `kiss-ssg check`, reads the audit findings, then does the judgement pass: responsive widths, long text, visual consistency across pages, clickable things that do nothing, and whether the 404 is useful. It reports first and fixes only what the operator picks.
- [ ] **Clean-room:** a fresh sub-agent with only the packed tarball and the shipped skill reviews a deliberately flawed small site in an empty folder, and finds the planted problems. It reports every place it had to guess.
- [ ] Contract critiqued adversarially by a fresh-context agent before any workstream builds against it.
- [ ] `npm run gates` green; Codex review at close (`lib/` changes).

**Non-goals / out of scope:** Failing the build on any finding. An HTML parser dependency (the tolerant-regex approach of `lib/links.js` stands). Performance budgets and JavaScript bundle size. Accessibility beyond alt and headings (contrast, ARIA, focus order). Fixing the fleet sites under `C:\Code\kiss`: the skill will be run against them after this branch, not in it.

**Impact surface:** public API — a new report field and new config keys that a consuming site can observe. That points to a minor (2.7.0), to be decided at close.

**Expected shape:** planned. Two workstreams with a known destination. The design detail (the report shape, where extraction happens) is settled in the contract before any code is written.

**Delegation convention:** the main session writes the contract, briefs and reviews. Sub-agents implement inside the scope the contract names (engine workstream, then skill workstream). Agents never commit: the main session reviews every diff and commits.

**Contract:** `planning/plans/2026-09-27-launch-readiness.md`

### Amendments

- **2026-09-28: version 2.6.4 (patch), against the proposed minor** (the operator's decision at `/branch-close` Step 4a). The proposal was a minor, 2.7.0, by `CLAUDE.md`'s rule: a real feature (the audit, `config.audit`, the `audit` report key, `kiss-site-review`) plus a changed default (the page title) that sites adapt to. The operator chose a patch. The upgrade note ships in `CHANGELOG.md` and `kiss-site-migrate` regardless, because the title change reaches `^2` sites either way.

- **2026-09-28: the `UNTITLED = 'Index'` guard in `lib/llms.js` removed** (the operator's decision at the close's docs sweep). It existed for the old default title. Afterwards it only rewrote a title somebody wrote, so an explicit "Index" now appears as written in `llms.txt` and the feed (`b8265db`).

- **2026-09-27: the default page title is fixed on this branch** (operator's decision). The audit's `title-duplicate` exposed a documented engine quirk: `KissPage` computed its default title from the default slug `'index'`, so every untitled page was "Index" (example 3's six roasts; the starter as soon as a second page is added). The default is now the page's own slug, title-cased with hyphens as spaces, the rule `lib/llms.js` already used (`78b0258`). A site that relied on the default sees those pages as changed, and `kiss-site-migrate` has the upgrade note. This is a public behaviour change, inside the minor the branch already expected.
- **2026-09-27: recommend Anthropic's `frontend-design` skill as an optional companion** (operator's decision). What it covers: a README paragraph with the install commands, saying the skill ships inside the `example-skills` plugin with 11 others; and one line each in `kiss-site-new` and `kiss-site-review` saying to use it for visual direction when it is present, while kiss keeps the file structure (layouts, partials, Sass). `init` and the declared plugins are unchanged. The clean-room run is done once with the plugin installed, to test whether `example-skills`' React-based `web-artifacts-builder` competes with `kiss-site-new`. That risk is inferred, not measured. Assigned to workstream B.

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-27** — Workstream A step 1 (`lib/audit.js`, 60 unit tests) done by a sub-agent and reviewed. Criteria status:
  - **Detection logic** for head metadata, content structure, site-level and hygiene: in place for all four groups (`test/unit/audit.test.js` green). Not yet wired into the build.
  - **Red-first:** partial. The sub-agent read 44 stub failures, then proved the 15 negative cases with a 12-mutation pass. Its one never-red case (`testing.io`) was replaced with `site.contest`, which was seen red under a dot-dropping mutation.
  - **Everything else:** not started (wiring, config, report, docs, skill, examples, clean-room).

  The review found one real defect. `auditBuild` rewrote `buildDir`'s `\` to `/`, which would have leaked `kiss-staging` into the report for a site whose `folders.build` uses Windows separators. I wrote a regression test through `reportedPath`, saw it red (`C:/site/…` against `C:\site\…`), then fixed it.

  `npm test`: 1820 passed. The 3 failures are the ones expected before step 2 (`AIKB/audit.md`, and `types/` for `audit.js` and `links.js`).

  No drift: `lib/links.js` only gained two `export` keywords.

  **Eyeball: looked** — the operator ran the facts script over example 11's built pages and opened `blog/index.html` (screenshot). "Looks good": one h1 then h3s with no h2, which matches `13333`, so `heading-skip` is a real finding. Every page sharing one description means `description-duplicate` will fire across example 11 in the sweep.

  Decision: **continue** to step 2 (wiring, config, report, docs, types).

- **2026-09-27** — Workstream A complete and committed (`3becec3`): wiring, config, report, docs, `types/`, example 9/11 records. Reviewed: the per-page `siteUrl` path (`options.config` is the merged config, `kiss.js:2268`) and the wiring against `_checkLinks`. `npm test`: 1854 passed, 1 failed — example 7 times out on an `EPERM` staging rename in this checkout; **reproduced on `main` with every change stashed**, so environmental, not this branch. `AGENTS.md` fails prettier on disk only (mixed CRLF; committed blob clean). Criteria: detection, advisory, per-check opt-out, report/summary, public-API docs and types **met in code**; examples, skill, clean-room, Codex still to come. Eyeball: **looked** — operator opened example 11 under Live Server and reported the links broken; Playwright showed 10/15 404 from the repo root and 15/15 + 9/9 200 served from `public/`; operator then clicked every link on the dev server (:3011): "Looks good." Two Workstream B additions recorded as a contract amendment (preview root in the skill; example 11 onto `{{link}}`). Pending operator answer: whether the duplicate summary line should show the shared value. Decision: **continue** to Workstream B.

- **2026-09-27** — Workstream B landed and was reviewed:
  - skills and docs (`d4bf12e`);
  - the duplicate summary line now names the shared value (`bffd55b`, operator's pick);
  - `check` now reads folder ownership from what the author declared (`ad7207b`): measuring the examples showed it disagreed with the real build for example 7's archive instance;
  - the example sweep (`bbb594e`): **every audited example re-measured at 0 findings** by me, not relayed. I fixed the sweep's card titles, which had grown visibly when they moved from h3 to h2, by sizing them in the card style;
  - the default title fix (`78b0258`, amendment above).

  `npm test`: 1866 passed, and the 1 failure is the known example 7 `EPERM`.

  Criteria: all four check groups, advisory, per-check opt-out, docs and types, the skill, and the example sweep are **met**. Clean-room, Codex review and gates are still to come.

  **Eyeball: looked** — operator on example 11's dev server (:3011, restarted on the new code once an orphaned node process holding the port was killed): "Looked — all good": card titles the same size as before, tab icon present, 404 page helpful. Operator decisions:
  - the starter gets the title fix only (no favicon, 404 or og:image);
  - fix the default title on this branch.

  Decision: **continue** to the clean-room run.

- **2026-09-27** — **Clean-room: met.** A fresh agent had only the packed tarball, the shipped `kiss-site-review` skill and Playwright, and reviewed a bookshop site with 18 planted problems (13 audit, plus canonical, plus 5 judgement-only).
  - It found all 18, plus 3 unplanted ones: image overflow at 320px, the 404 page listed in the sitemap, and an unstyled nav.
  - It served `public/` as the site root.
  - Its 14 guesses produced one skill-fix commit (`215d372`): build before the browser pass; judge `/404.html` directly, because the `--dev` preview answers a missing URL with a bare `Cannot GET` (**measured**); a `.scan()` site's 404 is registered via an earlier `.page()`; fix `site-url-local` first; the `{{title}}` fix; `pages[].canonical` and `detail` values documented in `llms.txt`.

  **`example-skills` competition: measured, partially.** Setup: a scratch folder run through `init` from the tarball, both marketplaces installed at project scope (both README install commands work as written), and one headless `claude -p` run with "Build me a website for Harbour Books… Make it look good."
  - Exactly one `Skill` call, `kiss-ssg:kiss-site-new`; `frontend-design` and `web-artifacts-builder` were offered and not used.
  - The output kept kiss's structure: a layout, 4 partials, 4 pages including a 404, a model.
  - It stopped at the 15-turn cap, and `acceptEdits` denied its `check`.
  - **Limit:** the marketplace installs from GitHub `main`, so this was the published `kiss-site-new`, without this branch's `frontend-design` line. The competition risk is measured as absent; the handoff line itself is not exercised.

- **2026-09-28** — **The `frontend-design` handoff: measured, met** (the operator chose to run it).
  - Setup: a scratch folder run through `init`, with the kiss marketplace pointed at this working tree (`directory` source) plus `example-skills`, and one headless run: the same prompt, 30 turns, Bash limited to `npx kiss-ssg`/`npm run`/`node`/`ls`/`cat`.
  - Skill calls, in order: `kiss-ssg:kiss-site-new`, then `example-skills:frontend-design` ("Visual direction for Harbour Books … (kiss-…"), then `kiss-ssg:kiss-build-check`.
  - The output kept kiss's structure: a layout, 4 partials, a model, `site.scss`, and 4 pages with the 404 at `/404.html`.
  - `check`: 4 pages, 0 failed, no broken links, **no audit findings**.

  **Incident, caught and reverted:** `marketplace add <dir>` re-registered the `kiss-ssg` marketplace **machine-wide** (`~/.claude/plugins/known_marketplaces.json`) as the directory source. It also overwrote the shared `cache/kiss-ssg/kiss-ssg/2.6.3/` with this branch's skills, because the branch is still versioned 2.6.3, so every real site on this machine would have loaded unreleased skills. Restored: the declaration was removed from the scratch folder, `cprobert/kiss-ssg` re-added, and the plugin reinstalled. The registry is back on GitHub, and the cached `kiss-site-new` is byte-identical to `origin/main` (no `kiss-site-review` in the cache).

  Lesson: a local-marketplace test needs a distinct version or name, or it poisons the shared cache.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
