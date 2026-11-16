---
branch: chore/dependabot-round-2
base: main
status: open
opened: 2026-11-16
scope: package.json, package-lock.json, GUIDE.md, tsconfig*.json, scripts/emit-types.mjs, test/unit/types.test.js, types/**, AIKB/css-purge.md, AIKB/markdown-copy.md, AIKB/upstream.md, CHANGELOG.md, .claude-plugin/marketplace.json, plugins/*/.claude-plugin/plugin.json, planning/**
---

# Session — 2026-11-16: Dependabot round 2 (#95, #89, #88)

## Intent (captured at /branch-open)

**Objective:** Take the three open Dependabot PRs on one branch before Phase 3 opens, so Phase 3 starts from current dependencies: the minor/patch group (#95), purgecss 9 (#89) and TypeScript 7 (#88). Ship as 2.18.1.

**Success criteria:**

- [ ] **#95 taken:** glob 14.0.6, sass 1.108.2, turndown 7.2.5, prettier 3.10.1 in `package-lock.json`. If prettier 3.10 reformats anything, the reformat is its own commit.
- [ ] **#89 taken:** purgecss `^9.1.0`. Its release notes are read against `lib/css-purge.js` (the one importer, `:317`) before the bump, and the result is stated in a pulse.
- [ ] **#88 taken:** typescript `^7.0.2`. `npm run types` emits (the `TS5011` `rootDir` failure fixed in `tsconfig.types.json`), `npm run typecheck` passes, and `types/` is byte-identical to what TypeScript 5.9 emitted, or each difference is explained. The `test/unit/types.test.js` assertion that expects TypeScript 5.9's diagnostic wording is fixed by asserting what the test means, not by pinning TypeScript 7's wording.
- [ ] **Examples and docs:** all fifteen examples (`npm run eg1` … `eg15`) and `node docs` build byte-identical before and after, or each difference is explained.
- [ ] **Fleet check:** `node scripts/fleet-check.mjs <site> --base main` on a1k9training and diploma-msc (the two sites that purge; diploma-msc with its CMS data fetched by the recipe in the fleet memory), plus oxford-medical and medulla (sass, and turndown through the Markdown copies). Byte-identical, or each difference is explained.
- [ ] **Release:** `npm run gates` pass on both OS in CI. 2.18.1 with `### Nothing for a site to change` if the fleet is byte-identical; otherwise an upgrade note naming what moved.
- [ ] **After merge:** #95, #89 and #88 are closed, by Dependabot or by hand with the reason.

**Non-goals / out of scope:**

- Any code change beyond what a bump forces.
- Issue #90 (Phase 4, and the feature freeze).
- Phase 3, and the CMS recipe as a `fleet-check` option (a Phase 3 criterion).
- The stale remote branches (`dependabot/…/glob-14.0.2`, `vite-8.3.6`, `ccr-f6af9894-zy0ccy`, `feat/kiss-writing-for-the-web`, `v1`).

**Impact surface:** engine internals. Runtime dependency bumps with the API unchanged. purgecss is a major but internal to `assets.purge`. Patch, 2.18.1 (the operator's choice, as proposed).

**Expected shape:** planned. The unknowns are TypeScript 7 (a new compiler: whether `checkJs` and declaration emit from JSDoc hold) and whether purgecss 9 moves purge output.

**Assumptions:**

- Measured (2026-11-16, `gh pr view`): #95 and #89 are green on Ubuntu and Windows. #88 fails the `test` gate on both: `tsconfig.types.json(7,5): error TS5011` in `types.test.js` "types/ is what `npm run types` emits", and one assertion expecting `not assignable to type 'boolean | "a…'`.
- Measured (same): #95 changes only `package-lock.json`. #89 and #88 change `package.json` and the lock.
- Measured (2026-11-16, `gh pr view 89`): purgecss 9's one listed breaking change is "Node.js 22.12 or later". Our floor is `>=22.23.4` (`package.json:33`). The notes say the one-pass rule removal "gives the same output".
- Measured (2026-11-16, grep): purgecss is imported only at `lib/css-purge.js:317`. turndown is imported in `lib/markdown-copy.js` and `lib/utils.js`.
- Measured (2026-11-16, grep under `C:\Code\kiss`): a1k9training (`router.js:49`) and diploma-msc (`config/assets.js:11`) configure `purge`.
- Measured (2026-11-16, `gh api …/dependabot/alerts?state=open`): no open Dependabot alerts.
- Not measured: whether `typecheck` passes under TypeScript 7. The #88 log grep showed only the `test` gate.
- Inferred: `typecheck` runs `tsconfig.check.json`, a different file from the `TS5011` failure, so it may hit failures of its own.

**Delegation convention:** none: one session.

**Independent review:** no `lib/` or `bin/` change is expected. If a bump forces one, Codex reviews it at that slice and at the close.

### Amendments

- **2026-11-16 — the loop and its stop condition (the operator's choices, all as recommended except the eyeball).** The work runs as a `/loop` of four turns, each ending in a commit, a `/branch-pulse` and a Codex review: (1) #95 with the before/after builds of the examples and docs, (2) #89, (3) #88, (4) the fleet check, the changelog and the 2.18.1 bump.
  - **Green:** no blocker or major in scope. Threat model: a change to what a site builds, or a broken gate, CI run on either OS, or emitted types. Blockers and majors in the turn's diff are fixed and Codex runs once more. Minors are logged in the pulse and not fixed. A finding outside the scope goes to the operator.
  - **End:** after turn 4 is green, commit, push the branch and stop with a report. The operator runs `/branch-close`.
  - **Eyeball:** the operator is asleep ("I'm going to bed, so use the advisor"). Each pulse's look is the advisor's (Fable), against a stated question, recorded as "looked, by the advisor".
- **2026-11-16 — the scope widens to `GUIDE.md`.** Prettier 3.10.1 (#95) reformats the inline `<script>` in § Consent's `consentScript` example across three lines (`fd3727a`), and the `format` gate fails without it. Whitespace only: the snippet builds to byte-identical HTML in both forms (below).
- **2026-11-16 — the fleet check cannot see #95, so the fleet criterion proves purgecss alone** (found by the advisor at turn 2's eyeball, measured). `fleet-check` installs a packed tarball into the site's copy, and npm does not pack `package-lock.json`. The site keeps its own locked versions: a1k9training's copy ran sass 1.108.1, turndown 7.2.4 and glob 14.0.4 on both sides, read from its `node_modules`. What a site receives from this branch is `package.json`'s ranges, and the only one that moved is purgecss (`^8.0.0` → `^9.1.0`). oxford-medical and medulla stay in turn 4, but as fleet coverage, not as evidence for sass or turndown. #95's evidence is the examples, the docs and the gates. The changelog says that purgecss's range is the only dependency change a site receives.

## Pulse log

- **2026-11-16, turn 1 (#95)** — 0 commits behind `origin/main`.
  - **#95: met.** Merged as `3bce7e7`. `npm ci`, then `node -p` reads glob@14.0.6, sass@1.108.2, turndown@7.2.5 and prettier@3.10.1 from `node_modules`. Prettier's one reformat (`GUIDE.md`) is its own commit, `fd3727a`.
  - **Examples and docs: met for #95.** `build-all.sh` ran before (`base`, at `6e726f8`) and after (`t1`, at `3bce7e7`): every exit code was the same (eg8 exits 1 both times, its intended failure), and `diff -rq base t1` exit 1 on one file only. That file is `examples/10-asset-pipeline/src/assets/css/generated.css`, a git-ignored intermediate whose first line carries the build's timestamp. `node docs` at `fd3727a` against `base`: `diff -rq` lists only `docs/guide/consent/index.html` and `index.md`, which differ by the reformatted snippet alone.
  - **Snippet probe:** example 14 copied to the scratchpad with the GUIDE's `visits` block in each form. Both builds exit 0, and `diff index-old.html index-new.html` exit 0.
  - **Gates:** `npm run gates` exit 0 at `fd3727a` (all six).
  - **Codex** (`review --base main --scope branch`, exit 0): "No actionable defects were identified." Green under the stop rule.
  - **Scope:** `scope-check` exit 1 on `GUIDE.md`; widened, with an Amendment.
  - **Eyeball: looked, by the advisor.** The question: does the three-line `<script>` still teach the same thing? Its reading: whitespace only, with the helper, the JS and the `{{asset}}` line unchanged. It asked for the engine run, and the snippet probe above is that run.
  - **Open items:** criteria 2–7 not yet (turns 2–4). None asked or out.
  - **Offer: unanswered** (the operator is asleep). The decision: #95 was taken by merging Dependabot's commit (`git merge --no-ff`), not by re-running `npm update`. GitHub then marks #95 merged when this branch lands. It would cost little if wrong, since the lock is the same either way. The next pulse reopens it.
  - **Decision:** continue to turn 2 (#89).
- **2026-11-16, turn 2 (#89)** — 0 commits behind `origin/main`.
  - **#89: met.** Merged as `b505107` with no conflict. `npm install --package-lock-only` left the lock unchanged. The lock moves only purgecss 8.0.0 → 9.1.0 and commander 12.1.0 → 15.1.0, which its CLI uses. Release notes against `lib/css-purge.js`: every safelist entry reaches PurgeCSS as a `RegExp` (`greedyPattern`, `:298`) and `dynamicAttributes` are plain names, so v9's slash-delimited strings don't apply. kiss sets no `keyframes`, `fontFace` or `variables`. The one change that reaches kiss is that root-level pseudo-only selectors are kept.
  - **Upstream re-check (`AIKB/upstream.md`, `2cd5184`).** With `standard: [PSEUDO_PART]` taken out (an edit, then `git checkout`, `git diff --quiet lib/` clean), `vitest -t "every element"` exits 0 on 9.1.0 (5 of 5). On 8.0.0 (`npm install --no-save`, then `npm ci` back to 9.1.0) it exits 1, failing 3 on `:focus-visible` and `:-moz-focusring:where(…)`.
  - **Selector probe:** the shipped `purgeCss`, guard in place, over sixteen selector shapes, under 9.1.0 and then 8.0.0. `diff probe8.txt probe9.txt` differs only on the version line.
  - **Examples and docs:** `build-all.sh` → `t2` against `base`. Same exit codes; `diff -rq` lists only turn 1's three explained files. No example and not the docs use `purge` (grep), so this says nothing about purgecss. The 51 `css-purge.test.js` tests pass.
  - **Fleet, a1k9training** (it purges, and has no CMS): `fleet-check --base main` exit 0, identical (571 files, 20 page hashes, 0 differ). Both build logs say `Purged css/site.css: 72.0 KB → 53.5 KB (26% removed)`. The branch side ran purgecss 9.1.0, read from the copy's `node_modules`.
  - **Gates:** `npm run gates` exit 0 at `b505107`.
  - **Codex**, twice over `8d858a1..HEAD`, both exit 0: "no actionable regressions" at `b505107`, and "no actionable compatibility defects" at `2cd5184`. Green.
  - **Scope:** `scope-check` exit 0.
  - **Eyeball: looked, by the advisor.** The question: does a purgecss 9 change reach kiss's options without the tests or a1k9training exercising it? It named the pseudo-only selectors against kiss's `PSEUDO_PART` guard, which the probe and the re-check answered. It also found that the fleet check cannot see #95 (Amendment).
  - **Open items:**
    - Criteria 3–7 not yet (turns 3–4).
    - The `PSEUDO_PART` guard is no longer needed on 9.1.0. Removing it is a `lib/` change outside this branch's non-goals: **out**, recorded in `AIKB/upstream.md` for the operator.
  - **Offer: unanswered** (the operator is asleep). Reopened from turn 1: #95 was taken by merging Dependabot's commit.
  - **Decision:** continue to turn 3 (#88).

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
