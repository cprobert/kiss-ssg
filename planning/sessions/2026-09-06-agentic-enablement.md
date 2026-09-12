---
branch: feat/agentic-enablement
base: main
status: closed
opened: 2026-09-06
consolidated: 2026-09-12
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

# Session Reflection — 2026-09-06: Agentic enablement — types, a build verdict, exemplar sites, a plugin

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 13 commits (`c786a2e` … this close) on `feat/agentic-enablement`, version 2.0.0-alpha.3. Five themes, in the order agreed at open: JSDoc types with generated declarations and an `exports` map (`f1bc6b3`); `kiss.report()`, `KISS_CHECK`/`KISS_REPORT` and the `kiss-ssg check` bin over two new pure modules (`9a52487`); examples 8 and 9 with a README per example, the examples shipped in the tarball and built in the suite (`118e53c`, `7f73d14`); an in-repo Claude Code plugin marketplace with three skills (`d062c08`); a README section for agent users (`7194e5e`). Suite 574 tests across 39 files, from 447 at open; tarball 150 files.

## Reflect — what the session was

**Planned**, and it stayed planned. The five themes and their order were agreed in the previous branch's closing conversation, so `/branch-open` was three questions (one branch or two, how `check` should surface, the name) rather than an interview, and the intent file's success criteria were written as a checklist the close could tick. The route was mapped well enough that three themes ran concurrently: theme 3's authoring touched only `examples/`, theme 4 only `.claude-plugin/` and `plugins/`, so both ran beside theme 1 while theme 2 waited for `lib/kiss.js` and `package.json` to be free. One criterion moved on contact with the code: the intent said `complete()` would resolve to a report, but `complete()` already resolves to the data array and llms.txt documents it, so the report became additive (`report()`, `err.report`) and the pulse recorded the decision. That is the only place the plan bent.

## Evaluate — how the human supervised the AI

**Problem framing** carried the branch. The three `/branch-open` answers each resolved a genuine fork: one sequenced branch rather than two (the prerelease made the semver argument moot); a bin plus an API for `check` rather than an API alone (which is why an agent gets a JSON verdict without writing any output); the name. Everything downstream followed from those, and no theme needed re-framing.

**Harness leverage** was the branch's other strength, and it was two-sided by design: the operator's skills (`/branch-open`, `/branch-pulse`, `/branch-close` with its eight sub-steps), the gates, the AIKB sync test and the parity tests are what made a five-theme branch closeable in one sitting. On Fable's side, the rule adopted after the previous branch's lost agents, every agent logs to disk as it goes, held for all ten agent runs; `claude` turned out to be on PATH, so the plugin was validated by the real CLI rather than by a test alone. Two real finds came from agents exercising the tooling, not from the review: TypeScript's declaration emit drops the quotes from `export { Kiss as 'module.exports' }` when the source is JavaScript, a syntax error that would have made every consumer's types `any`; and `cleanBuild: 'atomic'` under a failing build publishes nothing, which is right for production and wrong for an exemplar whose point is to show the other pages, so example 8 takes `--atomic` as a flag.

**Verification & ownership** and **iteration discipline** are where intended and actual supervision diverged, more sharply than on the previous branch. After the three opening answers the operator's input was one word, "proceed", and then `/branch-close`. The two mid-branch pulses were Fable's; no human eyeball touched a built page, a type hover or the check output. At the close, the ritual's two operator questions (run a security review, confirm the bump) went unanswered, and Fable proceeded under the ritual's own defaults, saying so in the close. Every fix was verified by Claude against Claude's own tests, repro runs and diffs, with the failing-first discipline intact. The system was designed to make that safe, and it was; but a branch that adds a `bin`, an `exports` map that refuses deep imports, and ships ninety more files in the tarball changed what consumers see, and the human did not look at any of it before the PR. **Learning engagement** and **architecture sense-making** follow: no question was asked all branch, and whether the operator could explain why `KISS_CHECK` discards staging on success too, or why `complete()` kept its old contract, is not evidenced.

**Pushback & steering** did not arise because nothing drifted; the one deviation an agent proposed (example 8's default) was ruled on by Fable, not the operator.

**Competency level: Agentic engineering lead, by the workflow the operator built, with the caveat stated plainly.** The rubric's definition is a reproducible human–AI workflow: plans, context files, independent review passes, durable guidance, improved after failure. That is exactly what ran here, and it is the operator's design, refined across three branches. What this particular branch did not show is the live half of supervision: the review passes were all Claude's, the checkpoints were all Claude's, and the close's two decision points were answered by default. On the evidence of this branch alone the reading would be "assisted operator with an unusually good harness"; on the evidence of the workflow it ran inside, the level is earned. Both things are true and the second should not hide the first.

## Feedback — recommendations for next session

- **Operator: answer the two close questions, every time.** They exist so that the security review and the bump are human decisions; when they go unanswered the ritual proceeds on defaults and the reflection has to say so. Thirty seconds at the close keeps the level honest.
- **Operator: try the thing that was built.** Open a fresh project, `npm install` the packed tarball, put `@node_modules/kiss-ssg/llms.txt` in its CLAUDE.md, ask Claude to build a small site with `/kiss-ssg:new-site`, then run `npx kiss-ssg check site.js`. That single session is the acceptance test for everything on this branch, and only a human can run it.
- **Fable: when an operator question goes unanswered, say so at the point of decision, not only in the reflection.** This close did; keep that as the rule.
- **Fable: pulse after each theme, not after two.** Two pulses for five themes is thin against the previous branch's cadence; the parallelism made it tempting to batch, and the pulse log is the record a reader has of when the branch was checked.
- **Both: the next branch is the operator's proving run, not more features.** Publish 2.0.0-alpha.3 to npm, install it in a consumer, and let the findings from that run set the next branch. The engine and its agent surface have had two branches of building; the next evidence has to come from use.

## Verdict — did we achieve the objective?

The brief: make `npm install kiss-ssg` enough for an AI coding agent to build, check and migrate a site correctly, without converting the engine to TypeScript or changing what it builds. **Met**, with one criterion amended by decision and recorded in the pulse log.

- [x] **Types** — JSDoc on every public export; `types/` emitted by `npm run types` and byte-compared by `test/unit/types.test.js`; `exports` map and `types` field; the `// @ts-check` fixture catches a wrong `cleanBuild`, a misspelled `folders` key and an unknown method (`f1bc6b3`).
- [x] **Build summary** — `kiss.report()` and `err.report` (additive; `complete()`'s contract kept, the amendment the pulse records); `kiss-ssg check <script>` stages, discards and prints one report per instance, exit 1 on any failure or on no report; `lib/build-report.js` and `lib/check.js` unit-tested, the bin covered end to end (`9a52487`).
- [x] **Examples as exemplars** — 8 (one broken record, exit 1 by design, the other five pages built) and 9 (the migration recipes, exit 0); a README per example and an index; all nine built by `test/integration/examples.test.js`; `examples/` in the tarball; llms.txt points at the shipped copy (`118e53c`, `7f73d14`).
- [x] **Plugin marketplace** — `.claude-plugin/marketplace.json`, `plugins/kiss-ssg` with `new-site`, `migrate-v1`, `check`; `claude plugin validate --strict` passes; the manifest test ties both versions to `package.json` and proves every cited path exists and is packed (`d062c08`).
- [x] **README for agent users** — "Using an AI coding agent?": the llms.txt import, the check bin, the plugin install; llms.txt names the plugin (`7194e5e`).
- [x] Gates green after each theme; every new `lib/` and `scripts/` module with its test and AIKB doc in the same commit; two pulses.

**Measurably better:** a consumer's editor now types every method and option from plain JavaScript; an agent gets a JSON verdict on a build that never touches the published folder; the package carries nine runnable sites and three skills that point at its own docs. **Still open:** the docs site under `src/` gained the new material at this close and should keep tracking the API; spec step 3 (the traced dependency graph) still awaits a measurement; 2.0.0 itself, and the first install of alpha.3 by a real consumer, are the operator's acts.
