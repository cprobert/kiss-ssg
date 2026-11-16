# Work order: Phase 2, slice 4 — the starter, the examples and `init`

One of five orders for [the approved spec](../specs/2026-11-15-command-runs-build.md) (`fad6eeb`).
Read this order, spec § 1, § 4.3, § 5.5 and § 7, and `CLAUDE.md`. It follows slices 1 to 3:
`kiss-ssg build` and `kiss-ssg dev` exist.

## Rules for the implementer

- **You do not commit, stage, branch or push.** The operator's diff review is the checkpoint.
- **No text reaches a file through the shell.** Write and Edit only.
- **Before any build or test run**, in PowerShell, and read the answer first:
  `Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen`. Any row: stop and ask.
- Run no example with `dev`. Every example run is a build, bounded: `timeout 60 npm run eg1`.
- After the runs, `git status --short` must show no `public/` folder: each example's is ignored.
- Do not run `npm run gates` or `node scripts/budgets.mjs --record`.
- Change nothing outside "Paths in scope". These files ship and are copied as good practice:
  change only what this order names, and keep every other comment and line as it is.

## Objective

No shipped script carries failure boilerplate or parses `--dev`; `init` writes the new npm
scripts; `npm run eg1` … `eg15` build through the command.

## Paths

**In scope:** `starter/router.js`; `examples/*/router.js`; `examples/*/README.md`;
`package.json` (the `eg1`…`eg15` scripts only); `lib/init.js`; `test/unit/init.test.js`,
`test/integration/init.test.js`, `test/integration/examples.test.js`,
`test/integration/packed.test.js` (only if it runs a starter or example script);
`AIKB/init.md`; `CLAUDE.md` (the `npm run eg1 … eg15` line in Commands).

**Out of scope:** every other `lib/` file, `bin/**`, `examples/*/src/**`, `docs.js`,
`plugins/**`, `GUIDE.md`, `llms.txt`, `README.md`, `CHANGELOG.md`, `scripts/**`, `planning/**`.

## Assumptions

Measured at `fad6eeb`.

- [M] `function reportBuildFailure` is in `starter/router.js` and 14 example routers;
  `examples/4-layouts-and-partials/router.js:62-69` has the same handling inline
  (`grep -c reportBuildFailure` per file).
- [M] Reads of a script's own `dev` besides `const dev = …` and the `dev,` key:
  `examples/2-page/router.js:99`, `3-pages:80`, `9-migrated-from-v1:244`,
  `10-asset-pipeline:125`, `11-blog:237` (`if (dev) this.viewStats()`); `5-helpers:88` (the
  branch); `7-versioned-outputs:63`, `:112` (`dev: false`). `13-course-packages` has no `dev`.
- [M] `examples/9-migrated-from-v1/router.js:247-252` chains `.complete(() => finish('successful'))`
  with a `.catch` that calls `reportBuildFailure(err)` and `finish('failed')`.
- [M] `examples/7-versioned-outputs/router.js:38` exits on a bad season before any `Kiss`;
  `:74-84` catches, prints and calls `process.exit()`; `:147` is the second `complete()`.
- [M] `lib/init.js:51-52` writes `build: 'node router.js'` and `dev: 'node router.js --dev'`.
- [M] `package.json:53-67` holds `eg1`…`eg15` as `cd examples/<n> && node router`.
- [M] `test/integration/examples.test.js:53` runs `node router.js` in each example's folder.
- [M] Example READMEs give `node router.js` and `node router.js --dev` as the commands
  (`grep -n "node router" examples/*/README.md`).
- [I] An example builds byte-identical output before and after this slice. Step 1 measures it.

## Steps

1. **Record the output first.** For each example, build it as it is and keep a listing of its
   `public/` with a hash per file, in a scratch folder under the OS temp (a small script written
   with the Write tool, outside the repo). Example 7 takes a season: `npm run eg7 -- test`.
   - verify: fifteen listings exist, none empty.

2. **`starter/router.js`** becomes the script in spec § 1: no `reportBuildFailure`, no `dev`
   constant or key, last statement `await kiss.complete()`. Keep its opening comment; replace
   the comment about failing loudly with one line saying `npx kiss-ssg build` sets the exit
   code and `npx kiss-ssg dev` previews.
   - verify: `grep -c "reportBuildFailure\|process.argv\|\.catch(" starter/router.js` → `0`.

3. **The examples.** In each `examples/*/router.js`: delete `reportBuildFailure`, the
   `const dev = process.argv.includes('--dev')` line and the `dev,` key; end with
   `await kiss.complete()`, keeping any callback. Then the named cases:
   - `2`, `3`, `9`, `10`, `11`: `if (dev) this.viewStats()` → `if (this.config.dev) this.viewStats()`.
   - `4`: the inline catch at `:62-69` goes.
   - `5`: lines 86-98 become one `await kiss.complete(() => { … })` with the same callback body
     and a comment saying one statement serves both modes.
   - `7`: keep `:38`'s refusal and both `dev: false`; `:74-84` become `await kiss.complete()`
     with a comment that a failed season ends the script there, so the index is not rebuilt.
   - `9`: decided by the operator 2026-11-15: a `try`/`catch` that rethrows, so the recipe it
     exists to show survives and the example prints no failure itself:
     `try { await kiss.complete(() => finish('successful')) } catch (err) { finish('failed'); throw err }`.
     Keep the comment above `finish`; check `src/pages/await-complete.hbs` still describes it.
   - `8` (`--atomic`) and `11` (`--broken`) keep their own arguments.
   - verify: `grep -rl "reportBuildFailure" examples starter` → no output, exit 1.
   - verify: `grep -rn "process.argv.includes('--dev')\|^\s*dev,$" examples/*/router.js starter/router.js`
     → no output.
   - verify: read all sixteen scripts once more for an inline catch that only prints and sets
     `process.exitCode`; report "sixteen read, none left".

4. **`package.json`.** `egN` becomes
   `cd examples/<folder> && node ../../bin/kiss-ssg.js build router.js` for all fifteen.
   - verify: `timeout 60 npm run eg1` … `eg15` each exit 0 (`npm run eg7 -- test`;
     `npm run eg8 -- --atomic` and `npm run eg11 -- --broken` also run, and `eg11 -- --broken`
     exits as it did before this slice: check against step 1's run of it).
   - verify: rebuild the listings of step 1 and compare → identical for all fifteen. A
     difference: stop and ask, with the diff.

5. **Example READMEs.** Where one says `node router.js`, say `npx kiss-ssg build` (and, for
   `--dev`, `npx kiss-ssg dev`), with the example's own arguments after `router.js` where it has
   some. Where one says "from examples/<n>/", add that inside this repository the commands are
   `npm run eg<n>` and, to preview, `node ../../bin/kiss-ssg.js dev` from the example's folder.
   Example 7 and 13: no preview line (7 passes `dev: false`; 13 writes no packages in dev).
   - verify: `grep -rn "node router" examples/*/README.md` → no output.

6. **`lib/init.js`.** `:51-52` become `build: 'kiss-ssg build'` and `dev: 'kiss-ssg dev'`.
   `nextSteps()` and `INIT_HELP` follow if they name the old commands. A site whose scripts
   already exist keeps them, as now.
   - verify: `npx vitest run test/unit/init.test.js test/integration/init.test.js` → pass.

7. **Tests.** `test/integration/examples.test.js` runs each example through
   `node bin/kiss-ssg.js build router.js` as well as through `node router.js`, with the same
   assertions on both.
   - verify: `npx vitest run test/integration/examples.test.js` → pass.

8. **`CLAUDE.md`.** The Commands line for `npm run eg1 … eg15` says it builds through the
   command and names the preview (`node ../../bin/kiss-ssg.js dev` from the example's folder;
   not 7).
   - verify: `node scripts/budgets.mjs` → `failureBoilerplate` reads `0`.
   - verify: `npm test` → exit 0. `npm run lint`, `npm run typecheck`, `npm run format:check` →
     exit 0. `node scripts/scope-check.mjs` → exit 0. `git status --short` shows no `public/`.

## Red-first

None is required: this slice removes code, and the behaviour it relies on has its red-first
tests in slices 1 and 3. The new command-run cases in `examples.test.js` fail at the base for
want of `build`; run `node scripts/red-first.mjs test/integration/examples.test.js` and report
the line, saying that is the reason.

## Expected size

`starter/` and `examples/`: about 190 lines removed, 30 to 50 added. `lib/init.js` and
`package.json`: 20 to 40 changed. Tests: 40 to 100 added.

## Stop and ask

- An example's output differs from step 1's listing.
- An example needs its own `dev` before `new Kiss` for anything but the `dev` key (none does at
  `fad6eeb`; if one does, it needs `Kiss.mode`, and the wording is the designer's).
- `npm run egN` fails because the engine gate or `describeEngine` cannot place the engine from
  an example's folder.
- A test outside this order's scope reads `node router.js --dev` or `reportBuildFailure`
  (`test/unit/skill-coverage.test.js`, `test/unit/budgets.test.js` and
  `test/unit/fleet-check.test.js` name them at `fad6eeb`; they are slice 5's or stay as they
  are, so report what fails and do not edit them).

## Single-test command

```
npx vitest run test/integration/examples.test.js
```
