---
branch: fix/security-bumps
base: main
status: closed
opened: 2026-11-06
---

# Session — 2026-11-06: Clear the Dependabot security alerts

## Intent (captured at /branch-open)

**Objective:** Clear the 17 open Dependabot alerts that switching alerts on surfaced (2 critical, 4 high, 10 moderate, 1 low). The two handlebars injection criticals ship in every site's dependency tree, so release the fix as a kiss patch with an upgrade note.

**Success criteria:**

- [ ] `handlebars` is at ≥ 4.7.10, and the `package.json` range is raised so a site resolving kiss cannot get a vulnerable one (`^4.7.10`).
- [ ] `glob` is at ≥ 14.0.2 (a major bump). Its breaking changes are read against every call site in `lib/`, `bin/` and `scripts/` before the bump, and the result is stated.
- [ ] The transitive alerts are cleared in the lockfile: `brace-expansion` ≥ 5.0.12, `source-map-js` ≥ 1.2.2, `minimatch` at a fixed version, `vite` ≥ 8.2.4, `@vitest/mocker` ≥ 5.0.3. Overrides are used only if no parent release takes them.
- [ ] `npm audit` reports 0 vulnerabilities (measured; the output is quoted in the pulse).
- [ ] `npm run gates` pass, and every example builds (`npm run eg1` … `eg12`; eg8 exits 1 by design).
- [ ] The built output of the docs site and at least one example is byte-compared before and after the bump. Any difference is explained, not assumed harmless.
- [ ] A patch version bump with a `CHANGELOG.md` entry whose `### Upgrading` note tells sites to take it (`npx kiss-ssg@latest upgrade`) because of the handlebars fix.
- [ ] After merge, the repository's Dependabot alert list shows 0 open (measured).

**Non-goals / out of scope:** Dependency bumps beyond what the alerts need (no general refresh), any change to handlebars usage or API, and upgrading the fleet sites (that is each site's own `upgrade`).

**Impact surface:** engine internals. Runtime dependency versions change, with no API change, so it is a patch.

**Expected shape:** planned. glob 14 is the one unknown.

**Delegation convention:** none: one session.

### Amendments

- 2026-11-06: the criterion "`npm audit` reports 0" cannot be met. eslint (the latest, 10.14) and `@eslint/config-array` still require minimatch `^10`, which the advisory covers in full. The operator chose to document and dismiss: it is recorded in `AIKB/upstream.md`, and the Dependabot alert is dismissed after merge as tolerable risk (dev-only). The criterion now reads: 0 runtime findings, and the 4 dev-only findings are that one eslint → minimatch chain.
- 2026-11-06: vitest and `@vitest/coverage-v8` move together (coverage pins vitest exactly), and `npm install` took them to 5.1.0, a dev-only minor. postcss moved 8.5.28 → 8.5.32 along with source-map-js. A first attempt that also updated sass and eslint was reverted as a general refresh, which is a non-goal.
- 2026-11-06: scope widened by the operator to have the docs site (`docs.js`, `src/`) use kiss's current features. A read of `llms.txt` against the site offered five items. The operator chose three: `{{image}}` for the header logo and the homepage screenshots (the audit's `img-not-responsive` on all 14 pages), listing examples 13 and 14 with the page's count corrected, and self-hosting Google Fonts and highlight.js (all 3 third-party origins). `cleanBuild: 'atomic'` and `host: 'github-pages'` were offered and not chosen. Criteria added: `kiss-ssg check docs.js --summary` reports no audit finding and 0 third-party origins; the Examples page lists all 14; a screenshot of the home page and a guide page at 375 and 1440 px is shown to the operator before the close. Nothing here ships in the tarball, so the 2.12.3 changelog entry stays the security note.
- 2026-11-06: `{{image}}` made the build's image variants hashed files, and the audit then reported `host-unset: cache headers`. So `host: 'github-pages'` was put to the operator again, and they added it. `cleanBuild: 'atomic'` stays unchosen.

## Pulse log

- **2026-11-06** — Security criteria met. `npm ls` shows handlebars 4.7.10 and glob 14.0.4. `npm audit --omit=dev`: 0 vulnerabilities; the full audit has 4 moderate, all the one dev-only eslint → minimatch chain (amended). Gates green on `ce368b1`. Docs and 14 examples byte-identical across the dependency bump. Docs criteria met: `check docs.js --summary` gives `ok — 14 pages, 0 failed` with no audit finding and no third-party origin, and the Examples page lists 14. Not yet: the 2.12.3 bump and changelog (close), and 0 open alerts (after merge). Impact surface moved to engine internals plus the docs site through Amendments; still a patch, tarball unchanged at 411 files. **Eyeball: looked**: the operator opened the homepage screenshots at 1440 and 375 (self-hosted fonts, `{{image}}` cards) and they match. The production AVIF/WebP markup has been read but not loaded in a browser until the site is live. Offer: vendoring highlight.js 11.9.0 (invisible to Dependabot), **kept** by the operator. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-06: Clear the Dependabot security alerts

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.12.3. `59c3e8d` bumps handlebars to `^4.7.10` (two critical advisories), glob to 14, and the alerted transitive packages. `ce368b1` moves the docs site to `{{image}}`, self-hosted fonts and highlight.js, `host: 'github-pages'`, and all 14 examples. `262113d` is the docs sweep, `6f9c4ea` the version bump and changelog.

## Reflect — what the session was

The branch grew out of a question ("do we have any dependabot notices?"). That led to switching alerts on, a direct-to-`main` `dependabot.yml` (its own closed log, `2026-11-06-dependabot.md`), and then the 17 alerts that turning alerts on revealed. The security half was **planned**: the intent named every package and a byte-identical before/after check, and that is how it ran. The docs-site half was **emergent**. It started from the operator's question ("are the docs using npm or the kiss lib directly?") and then a request to "run the upgrade skill". Two Amendments recorded it. The shape served the work: the planned half was finished and committed before the scope widened, so the security release was never mixed up with the docs-site changes.

## Evaluate — how the human supervised the AI

**Problem framing and pushback & steering** discriminated this session. The operator asked short, well-aimed questions rather than issuing specs. "Are the docs using npm or the kiss lib directly?" was a real learning question. The answer (both resolve to the working tree, including the examples' `'kiss-ssg'` self-reference) surfaced the one thing the byte-compare could not test, the published-package path. The operator then made every choice Claude put up as a question: document and dismiss the minimatch alert, three of five docs-site items, and `host: 'github-pages'` once the image variants made the audit ask for it. The decline-then-accept on `host` is good steering: the answer changed because the evidence changed, not because it was asked again.

**Verification & ownership** held at the pulse: the operator opened the screenshots at both widths (`Eyeball: looked`). Most other verification was Claude's own, but measured rather than asserted. There were two baseline builds to prove the output is deterministic, an after-build byte-identical across the docs site and 14 examples, `npm audit --omit=dev` quoted, a red-then-green run of the rewritten home-page test, and a Chromium pass that scrolled to load lazy images and listed loaded font faces and foreign requests. Claude also caught three of its own slips before they shipped. `npm update` named sass, eslint and postcss and moved them, a general refresh the intent ruled out, so it was reverted and redone narrowly. The font-download script wrote `…-undefined.woff2` and overwrote the latin-ext files, so it was fixed and re-run. The changelog paraphrased the advisories as "GHSA-class bypasses", which the alerts never said, so it was replaced with their titles. None of these reached a commit.

**Where supervision was intended versus where it happened:** the fleet check was offered twice, as the one test of the published-package path (a real site installing kiss, with its own handlebars), and was never taken up. The operator moved to the docs-site work instead. So the claim "nothing in a site changes", written into the changelog, rests on this repo's docs site and examples, which resolve kiss from the working tree, not on a consuming site. The PR needs to say that.

**Harness leverage:** "run the upgrade skill" named a tool built for a different job. `kiss-site-migrate` upgrades a site's install and explicitly excludes feature adoption. Claude said so and ran the part that answered the question, reading `llms.txt` against `docs.js`, instead of running the skill to the letter. `kiss-ssg check --summary` and `kiss-ssg images` did the measuring. Codex was skipped by the rule, since no `lib/` or `bin/` change, and the operator skipped `/security-review` for a `package.json`-only diff. So the branch has no independent review. Its evidence is measured output rather than a second reader.

**Competency level: Active supervisor.** The operator framed the work through good questions, made each consequential choice with the trade-off in front of them, and looked at the artefact while it was warm. What keeps it from Agentic engineering lead: no diff was read by a person, and the offered fleet check, the one test aimed at the published path, was let go.

## Feedback — recommendations for next session

- **Operator — take the fleet check when a branch bumps a runtime dependency.** This repo's examples and docs resolve kiss from the working tree, so they cannot show what a site installing from npm gets. Swap the engine into one site under `C:\Code\kiss` and diff its build (memory: `fleet-sites-wiring.md`). It takes a few minutes and is the only evidence for "nothing in a site changes".
- **Claude — name only the alerted packages to `npm update`, from the first command.** Listing a parent to reach a child (sass, postcss and eslint, to reach source-map-js and minimatch) moved packages the intent ruled out. Update the vulnerable package itself, then read `npm ls` to see what moved before going on.
- **Claude — quote an advisory, never paraphrase it.** "GHSA-class bypasses" was a plausible phrase with no source. In a changelog a site will act on, use the alert's own title.
- **Process — check the live docs site after the merge.** The `{{image}}` AVIF/WebP markup and the italic face have been read, not loaded: the dev preview writes plain `<img>`. Open the home page and a guide page on `cprobert.github.io/kiss-ssg/` once it deploys. Dismiss the minimatch alert, and confirm Dependabot shows 0 open.
- **Both — vendored files are invisible to Dependabot.** The operator kept highlight.js 11.9.0 vendored, knowingly. Re-check it when the docs site is next touched: `npm view highlight.js version` against the file name.

## Verdict — did we achieve the objective?

The brief: clear the 17 Dependabot alerts and ship the handlebars fix as a patch with an upgrade note. **Met**, with one alert dismissed by decision. The objective then moved, through recorded Amendments, to cover the docs site's adoption of current kiss features. That was good drift: it was asked for, kept to `src/` and `docs.js`, and it changes nothing in the tarball.

- [x] handlebars ≥ 4.7.10 with the range raised to `^4.7.10`: `npm ls` shows 4.7.10.
- [x] glob ≥ 14.0.2, breaking changes read against every call site: 14.0.4. One call site, `lib/utils.js` `globFiles`, uses nothing glob 14 removed.
- [x] Transitive alerts cleared. brace-expansion 5.0.12, source-map-js 1.2.2, vite 8.3.6, @vitest/mocker 5.1.0; minimatch under eslint is amended, see below.
- [x] `npm audit`, amended to 0 runtime: `--omit=dev` finds 0. The full audit has 4 moderate, all the dev-only eslint → minimatch chain recorded in `AIKB/upstream.md`.
- [x] Gates and examples green: gates passed on `6f9c4ea`; all 14 examples build, and example 8 exits 1 by design.
- [x] Byte comparison: the docs site and 14 examples are byte-identical across the dependency bump, after two baselines showed the build is deterministic.
- [x] Patch bump with an upgrading note: 2.12.3, `CHANGELOG.md` `### Upgrading`.
- [ ] Dependabot shows 0 open alerts: can only be checked after the merge.
- [x] (Amended) `check docs.js`: no audit finding, no third-party origin.
- [x] (Amended) the Examples page lists all 14.
- [x] (Amended) screenshots in front of the operator before the close: `Eyeball: looked`.

**Measurable impact:** a site that upgrades to 2.12.3 can no longer resolve a handlebars with the two injection advisories. Of the 17 alerts, the 9 against runtime packages (handlebars 3, brace-expansion 3, source-map-js, glob, minimatch) are fixed, and `npm audit --omit=dev` reports 0. Of the 8 dev-only alerts, vite's and @vitest/mocker's are fixed; minimatch under eslint stays, documented. The docs site makes no request to another origin (it made 3), and its logo is 5 KB as AVIF where it was 44.6 KB as PNG. **Still open:** the post-merge alert count, the dismissal, the live-site check, and the untested published-package path.
