---
branch: feat/agentic-enablement
base: main
status: open
opened: 2026-09-06
---

# Session — 2026-09-06: Agentic enablement — make the published package teach an AI coding agent to build a kiss site well

## Intent (captured at /branch-open)

**Objective:** Make `npm install kiss-ssg` enough for an AI coding agent to build, check and migrate a site correctly — types it can read, a machine-readable build verdict it can act on, exemplar sites it can copy by shape, and a Claude Code plugin it can install — without converting the engine to TypeScript or changing what the engine builds.

**Success criteria:**

- [ ] **Types.** Every public export (`Kiss` and its methods, the `config` shape including `folders`, `fetch`, `assets`, page options, the built-in helpers, the `utils` export) carries JSDoc; a checked-in `.d.ts` is generated from it (`tsc --allowJs --declaration --emitDeclarationOnly`), shipped via `package.json` `types` and an `exports` map, and a test regenerates and diffs it so it cannot drift. A fixture consumer using `// @ts-check` and `import('kiss-ssg')` types passes `tsc --noEmit` in the suite.
- [ ] **Build summary.** `complete()` resolves to a build report (`pages`, `failures`, `assets`, `duration`, `buildDir`) and `kiss.report()` returns the last one; `kiss-ssg check <script>` (a `bin`) runs the site's own build script with the build staged atomically and discarded, prints the report as JSON, exits 1 when there are failures. The report assembly and the bin's decision core are unit-tested; llms.txt, README and CHANGELOG document both.
- [ ] **Examples as exemplars.** Example 8 (a data-fed site: `.pages()` fan-out from a model with one deliberately broken record, so the run shows one named failure and the rest built) and example 9 (the v1 → v2 migration recipes as a runnable site). Every example has a README (what it shows, how to run it, what to copy); `examples/README.md` indexes the two tiers; a test builds every example and asserts its exit code and page count (8 asserts the one failure); `examples/` ships in the tarball (build output excluded) and llms.txt § Docs points at `node_modules/kiss-ssg/examples/`.
- [ ] **Plugin marketplace.** `.claude-plugin/marketplace.json` at the repo root and `plugins/kiss-ssg/` with a plugin manifest and skills for building a new site, migrating a v1 site and running `kiss-ssg check`, each pointing the agent at `node_modules/kiss-ssg/llms.txt` and the examples rather than restating them; a test validates the manifests and every path a skill cites. `/plugin marketplace add cprobert/kiss-ssg` is the documented install.
- [ ] **README for agent users.** A "Using an AI coding agent?" section: the `@node_modules/kiss-ssg/llms.txt` CLAUDE.md import, the marketplace add command, the `check` bin. llms.txt names the plugin.
- [ ] `npm run gates` green after each theme; a `/branch-pulse` after each; every new `lib/` or `scripts/` module with its test and AIKB doc in the same commit.

**Non-goals / out of scope:** No TypeScript conversion of `lib/` (declarations are generated from JSDoc, consumers stay plain JS). No change to what the engine builds — a defect found while building the exemplars is a finding for triage, not a fix on sight. No dependency-graph step 3. No cutting 2.0.0 and no publish; the close proposes `2.0.0-alpha.3`.

**Impact surface:** public API — a new `exports` map and `types` field, a `bin`, `complete()`'s resolution value, a wider `files` whitelist. Obliges llms.txt + README + CHANGELOG on every theme; the bump is the prerelease one while the tag stands.

**Expected shape:** planned — five themes in a fixed order (types → build summary → examples → marketplace → README), each a pulse point; the marketplace last because it is the most speculative.

**Delegation convention** (unchanged from the previous branch): Fable writes briefs and reviews every diff, Opus implements judgement work, Sonnet does mechanical work; agents write findings to disk as they go and never commit.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-06 (themes 1, 3, 4 landed)** — Types (`f1bc6b3`): JSDoc on every public export, `types/` emitted by `npm run types` with the byte-parity test and the `// @ts-check` consumer fixture (three deliberate misuses caught by tsc); one real find on the way — tsc drops the quotes from `export { Kiss as 'module.exports' }` when the source is JS, so `scripts/emit-types.mjs` re-quotes it, with its own test. Examples (`118e53c`, `7f73d14`): 8 (one broken record, exit 1 by design) and 9 (the migration recipes, exit 0), a README per example and an index, `examples/` in the tarball (143 files, no build output), `test/integration/examples.test.js` builds all nine in ~5.5 s. Plugin (`d062c08`): marketplace + three skills, `claude plugin validate --strict` passes, manifest test ties both versions to package.json. Suite 513/513, gates green at each commit. Criteria 1, 3, 4 met; 2 (build summary) in progress; 5 (README agent section) after 2. Decision: **continue** to theme 2; no drift.
- **2026-09-06 (themes 2 and 5 landed, ready to close)** — Build report and check (`9a52487`): `kiss.report()`, `err.report`, `KISS_CHECK`/`KISS_REPORT`, `bin/kiss-ssg.js check` over pure `lib/build-report.js` + `lib/check.js`, each with its unit test and AIKB doc; `complete()`'s documented contract kept (the criterion's wording was adjusted by decision: the report is additive, not the resolution value). Verified from examples/: `check 8-data-fed-site.js` one report ok:false exit 1 with the real build folder untouched, `check 7-versioned-outputs.js` two reports exit 0, `--summary` on 9. Two documented limits: a site that reads its own build folder after complete() sees nothing published under a check (example 7's archive index); `cleanBuild: false` sites check from an empty staging folder. README agent section, llms.txt plugin bullet and CHANGELOG line landed. Suite 574/574 across 39 files; gates green (150 files in the tarball incl. bin, types, examples). All six criteria evidenced; every new lib module has its test and AIKB doc. Decision: **ready to close** — the close proposes 2.0.0-alpha.3.

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
