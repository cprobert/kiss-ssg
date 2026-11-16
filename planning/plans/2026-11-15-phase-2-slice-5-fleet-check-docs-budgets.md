# Work order: Phase 2, slice 5 — `fleet-check --via command`, skills, docs, budgets

One of five orders for [the approved spec](../specs/2026-11-15-command-runs-build.md) (`fad6eeb`).
Read this order, spec § 3, § 4.3 and § 7, and `CLAUDE.md`. It follows slices 1 to 4. The exit
(the clean room, the fleet runs, the Codex close) is the main session's and is not in this order.

## Rules for the implementer

- **You do not commit, stage, branch or push.** The operator's diff review is the checkpoint.
  This order has **two hand-overs**: steps 1 to 6, then step 7 alone, because the budgets
  re-record is its own commit.
- **No text reaches a file through the shell.** Write and Edit only.
- **Before any build or test run**, in PowerShell, and read the answer first:
  `Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen`. Any row: stop and ask.
- Do not run `npm run gates`. Do not run `node scripts/fleet-check.mjs` against a real site: the
  fleet under `C:/Code/kiss` is the main session's, and read-only.
- A skill's code block is a list of commands: no pipe, loop, condition, `&&`, `sed`, `awk` or
  `node -e` (`test/unit/skill-code-blocks.test.js`).
- Change nothing outside "Paths in scope".

## Objective

The fleet check can build the branch side through `kiss-ssg build` and fails on differing exit
codes; every skill and doc that tells an agent how to run a build says the new thing and nothing
says the old; the budgets are re-recorded in their own commit.

## Paths

**In scope:** `scripts/fleet-check.mjs`, `test/unit/fleet-check.test.js`;
`plugins/kiss-ssg/skills/**`; `test/unit/skill-coverage.test.js`; `GUIDE.md`, `README.md`,
`CONTRIBUTING.md`, `llms.txt` (wording only, never longer), `src/**` (only if `node docs` needs
it); `AIKB/testing.md`; `CLAUDE.md` (the `fleet-check` line in Commands);
`planning/budgets.json` (**step 7 only**).

**Out of scope:** `lib/**`, `bin/**`, `types/**`, `examples/**`, `starter/**`, `package.json`,
`CHANGELOG.md` (the entry is drafted in your report, step 6: `/branch-close` writes it with the
version bump, and `test/unit/changelog.test.js:95` fails an entry ahead of `package.json`),
`scripts/budgets.mjs`, the rest of `planning/**`.

## Assumptions

Measured at `fad6eeb`.

- [M] `scripts/fleet-check.mjs` builds each side with `run(process.execPath, entry, …)` (`:514`)
  after `run(process.execPath, [bin, 'check', ...entry], …)` (`:489`); `buildWith` returns
  `buildStatus` (`:534`); `main` returns `exitCodeFor(reports, folders)` (`:604`), which does
  not read it; options are parsed from a table at `:72-77`.
- [M] `plugins/kiss-ssg/skills/kiss-site-new/SKILL.md:86` tells an agent to end with
  `await kiss.complete().catch(reportBuildFailure)`; `:82` names the `build`/`dev` scripts.
- [M] Old run wording by file (`grep -c "node router\|--dev\b\|npm run dev\|npm run build"`):
  `kiss-performance/SKILL.md` 3, `kiss-performance/references/pipeline-recipes.md` 1,
  `kiss-site-review/SKILL.md` 2, `kiss-site-review/browser-pass.md` 4.
- [M] `CONTRADICTIONS` is at `test/unit/skill-coverage.test.js:1211`, entries
  `{ why, patterns, allowedIn }`; `COVERAGE` at `:31`, entries `{ feature, pattern, skills }`.
- [M] `GUIDE.md:375` and `:413` name `--dev`; `:2057` says `KISS_CHECK=1` drives a check by
  hand.
- [M] `planning/budgets.json` holds `coreLines` 34359, `claudeMdBytes` 36087, `llmsTxtChars`
  15997, `failureBoilerplate` 15.
- [I] After slices 1 to 4, `llms.txt` is at or under 15,997 characters and `failureBoilerplate`
  measures 0. Step 1 measures both.

## Steps

1. **Where things stand.**
   - verify: `node scripts/budgets.mjs` → `llmsTxtChars` 15997 or less, `failureBoilerplate` 0.
     Report every row. If `llmsTxtChars` is over: stop and ask.

2. **`fleet-check --via command`.** Add `--via <node|command>` (default `node`) to the option
   table and `USAGE`. With `command`, the **branch** side's build is
   `run(process.execPath, [<branch bin>, 'build', ...entry], …)`; the base side always builds
   with `node`, and the summary says which way each side was built. In both modes the run
   fails, and prints both codes, when the two sides' `buildStatus` differ. The `check` step is
   unchanged.
   - verify: `npx vitest run test/unit/fleet-check.test.js` → pass, with cases for the parse,
     the branch command line under each mode, and the exit code when the statuses differ.

3. **`kiss-site-new`.** Rewrite `:82-86`: the scripts are `kiss-ssg build` and `kiss-ssg dev`;
   the script ends with `await kiss.complete()`; it passes no `dev` key and parses no `--dev`;
   a choice that depends on the mode reads `Kiss.mode` before `new Kiss`. Say how to tell an
   older kiss-ssg: `npx kiss-ssg build --help` answering `unknown command` means upgrade first.
   - verify: `grep -n "reportBuildFailure" plugins/kiss-ssg/skills -r` → no output.

4. **The other skills.** In `kiss-performance`, `kiss-site-review` (with `browser-pass.md`),
   `kiss-build-check`, `kiss-site-migrate`, `kiss-page-add` and `kiss-site-import`: where a line
   tells an agent to run or preview a build, name `kiss-ssg build` / `kiss-ssg dev` (or the
   site's own `npm run build` / `npm run dev`, which stay right), and remove `--dev` as the name
   of the preview. Do not copy a rule from one skill into another: link.
   - Add to `COVERAGE`: `kiss-ssg build` and `kiss-ssg dev` in `kiss-site-new`; the
     `unknown command` check in `kiss-site-new`.
   - Add to `CONTRADICTIONS`, `allowedIn: ['CHANGELOG.md']`, `why` starting `2.18.0:`:
     `/complete\(\)\.catch\(reportBuildFailure\)/`, `/node router\.js --dev/`,
     `/process\.argv\.includes\('--dev'\)/`.
   - verify: `npx vitest run test/unit/skill-coverage.test.js test/unit/skill-code-blocks.test.js`
     → pass. A `CONTRADICTIONS` hit in a file you did not expect (`GUIDE.md:413`, an example
     README) is the sweep working: fix the file if it is in scope, report it if not.

5. **`GUIDE.md`, `README.md`, `CONTRIBUTING.md`, `AIKB/testing.md`, `CLAUDE.md`.**
   - `GUIDE.md`: `:375` and `:413` lose `--dev`; `:2057` says the request is passed by the
     command and that `KISS_CHECK=1` still works until 3.0; § The build script gains the
     migration in spec § 4.3 (drop the `dev` key **and**, in the same edit, move any folder or
     `cleanBuild` choice to `Kiss.mode`). A new `##` or `###` needs a page in
     `src/models/guide.json` or a `LEFT_OUT` entry in `src/controllers/guide.js`: prefer none.
   - `README.md`: the quick start and command list show `kiss-ssg build` and `kiss-ssg dev`.
   - `CONTRIBUTING.md`: only where it names `node router` or `--dev`.
   - `AIKB/testing.md`: the two-copy test, the dev test's port and leftover-process rules.
   - `CLAUDE.md`: `--via command` on the `fleet-check` line.
   - `llms.txt`: wording only; it may not grow.
   - verify: `grep -rn "router.js --dev\|reportBuildFailure" GUIDE.md README.md CONTRIBUTING.md llms.txt plugins`
     → no output.
   - verify: `node docs` → exit 0. `node scripts/budgets.mjs` → `llmsTxtChars` 15997 or less.

6. **Draft the changelog entry, in your report, not in a file.** A `## 2.18.0` entry for site
   builders with a `### Upgrading` section holding: nothing breaks a script that awaits
   `complete()`; the npm script lines per shape (no arguments; an environment argument; the
   site's own `dev` or `--dev` passed through; a script not named `router.js`; steps chained
   with `&&` stay where they are); a script with no `complete()` now exits 1;
   `err.failures[].buildTo` names the build folder; the two changed messages and the missing
   "broken link" lines for failed pages; `kiss-ssg dev` refuses `dev: false` and
   `kiss-ssg build` refuses `dev: true`, with the one-edit migration of spec § 4.3; delete
   `reportBuildFailure` when moving to the command; what a dev restart keeps (spec § 5.3's
   table).
   - verify: `npm test` → exit 0. `npm run lint`, `npm run typecheck`, `npm run format:check` →
     exit 0. `node scripts/scope-check.mjs` → exit 0.
   - **First hand-over.** Stop. Wait to be told the work so far is committed.

7. **Re-record the budgets, alone.** Only after the main session says steps 1 to 6 are
   committed, and `git status --short` is empty:
   - `node scripts/budgets.mjs` → note every row's baseline and now.
   - `node scripts/budgets.mjs --record` (this script writes `planning/budgets.json`; that is
     its job, not a shell edit).
   - verify: `git status --short` → exactly ` M planning/budgets.json`.
   - verify: `node scripts/budgets.mjs --check` → exit 0.
   - Report, for the commit message, each number that grew and why: `coreLines` (four modules:
     `run-state`, `run-preload`, `run-script`, `dev-supervisor`, and the engine's edits) and
     `claudeMdBytes` (four table rows, three command lines); and each that fell
     (`failureBoilerplate` 15 → 0). If `privateReach`, `anyAnnotations`, `testPrivateReach` or
     `runtimeDeps` grew: **do not record; stop and ask.** `msPerPage` needs a bench file and is
     the main session's: if `--record` would change it, stop and ask.

## Red-first

`node scripts/red-first.mjs test/unit/fleet-check.test.js -t "<the new case's name>"` → exit 0
wanted; report the line. The `CONTRADICTIONS` rows are red-first by construction: before step 3
the new patterns match `kiss-site-new/SKILL.md`; run the test once after adding the rows and
before fixing the skill, and report that it failed.

## Expected size

`scripts/fleet-check.mjs`: 40 to 70 lines added. Tests: 60 to 120. Skills and docs: 150 to 300
changed. `planning/budgets.json`: its nine lines.

## Stop and ask

- `llms.txt` is over 15,997 characters at step 1, or a wording fix would lengthen it.
- A skill needs a new sentence of domain judgement, not a command name swapped (that is the
  designer's to write).
- A `CONTRADICTIONS` pattern hits a file out of scope.
- `fleet-check`'s base side cannot be told apart from the branch side at `:514` without
  restructuring `buildWith`.
- Any budget other than `coreLines` and `claudeMdBytes` grew (step 7).
- A new `GUIDE.md` heading seems necessary.

## Single-test command

```
npx vitest run test/unit/fleet-check.test.js
```
