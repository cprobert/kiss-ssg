# Work order: Phase 2, slice 2 — the four messages, and one owner per diagnostic

One of five orders for [the approved spec](../specs/2026-11-15-command-runs-build.md) (`fad6eeb`).
Read this order, spec § 5.2 and § 6, and `CLAUDE.md`. It follows slice 1, whose
`test/integration/run-build.test.js` it extends.

## Rules for the implementer

- **You do not commit, stage, branch or push.** The operator's diff review is the checkpoint.
- **No text reaches a file through the shell.** Write and Edit only, scratch files included.
- **Before any build or test run**, in PowerShell, and read the answer first:
  `Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen`. Any row: stop and ask.
- Do not run `npm run gates` or `node scripts/budgets.mjs --record`. Start no server or watcher.
- Change nothing outside "Paths in scope".

## Objective

Four error messages say what the clean room found missing, and every failure's cause is logged by
exactly one site.

## Paths

**In scope:** `lib/handlebars-helpers.js`, `lib/links.js`, `lib/build-finish.js`, `lib/kiss.js`,
`lib/model-resolver.js`, `lib/kiss-page.js`, `lib/page-registry.js`,
`lib/controller-resolver.js`, `lib/utils.js`; their tests in `test/unit/` (`handlebars-helpers`,
`links`, `model-resolver`, `kiss-page`, `page-registry`, `controller-resolver`, `utils`);
`test/integration/link-helper.test.js`, `test/integration/links.test.js`,
`test/integration/atomic-build.test.js`, `test/integration/run-build.test.js`; the `AIKB/` doc of
each `lib/` file touched; `GUIDE.md` only where it quotes a changed message; `types/**`
(generated only).

**Out of scope:** `lib/build-report.js` (the report gains no field), `lib/assets.js`,
`lib/asset-copy.js` (already one log per cause), every `lib/run-*.js`, `bin/**`, `examples/**`,
`starter/**`, `plugins/**`, `planning/**`.

## Assumptions

Measured at `fad6eeb`.

- [M] (a) is thrown from `lib/handlebars-helpers.js:435-436`; the helper gets one id through
  `lookupPage` (`:95`), given in `lib/kiss.js:824`; a second caller is `:665`. The registry's id
  index is `_idIndexFor()` (`lib/kiss.js:1375`).
- [M] (b) is logged at `lib/build-finish.js:355-357` from `checkLinks`'s `broken` list
  (`lib/links.js:539-590`).
- [M] (c): `err.failures` is the internal list (`lib/kiss.js:1687`), whose `buildTo` is a
  staging path under `'atomic'` and check (`:1196`); `_reportedPath` is `:1266`.
- [M] (d) is thrown at `lib/model-resolver.js:64`; its mirror at `:60`.
- [M] The double logs: `lib/kiss-page.js:444-446` then `:476-477`; `:502-503` then `:476-477`;
  `lib/model-resolver.js:53-54` then `lib/page-registry.js:647-648`;
  `lib/model-resolver.js:17-20` and `:60` then `lib/page-registry.js:647`;
  `lib/controller-resolver.js:31-32`, `:39-41`, `:56-57`, `:121-122` then
  `lib/page-registry.js:647`.
- [M] Reproductions of (a) to (d) on this code are quoted in spec § 6.
- [I] No existing test asserts the exact text of a line this order removes. Step 5 finds out.

## Steps

1. **(a) Nearest id.** Add a small edit-distance function to `lib/utils.js` with a unit test.
   Hand the helper the registry's ids beside `lookupPage` (a function, read at render, as
   `lookupPage` is). The message becomes
   `link: no page with id "abuot". Did you mean "about"? (asked by …)`, naming up to three ids
   within distance `max(2, floor(length / 3))`, nearest first. With none that close:
   `link: no page with id "x". This build has N ids; kiss-ssg check lists them. (asked by …)`.
   The dev warning uses the same text. Give `:665` the same treatment if it prints the same
   message; if it does not, leave it and say so.
   - verify: `npx vitest run test/integration/link-helper.test.js test/unit/utils.test.js` → pass.

2. **(b) A failed page is not a broken link.** `checkLinks` takes the output paths of pages that
   failed and does not add a reference resolving to one to `broken`. `runLinkCheck` passes them
   (the stack entries that have a recorded page failure) and its log line adds
   `(N to pages that failed are not listed)` when N > 0. The report gains no field.
   - verify: `npx vitest run test/unit/links.test.js test/integration/links.test.js` → pass. The
     integration case: one failing page linked from three pages gives no `broken link:` line
     and an empty `links.broken`.

3. **(c) The rejection names the build path.** At `lib/kiss.js:1687` hand out copies:
   each failure with `buildTo` passed through `_reportedPath` (keep `null` as `null`). The
   internal list is untouched.
   - verify: `npx vitest run test/integration/atomic-build.test.js` → pass. New cases:
     `err.failures[0].buildTo` under `cleanBuild: 'atomic'` and under check contains no
     `.kiss-staging-`.

4. **(d) The model hint.** At `lib/model-resolver.js:64`, when `<modelsDir>/<name>.json` is a
   file, append ` — <modelsDir>/<name>.json exists: write model: '<name>.json' to read that file`.
   At `:60`, when a folder of the name without `.json` exists, append the mirror hint.
   - verify: `npx vitest run test/unit/model-resolver.test.js` → pass, both directions.

5. **One owner per diagnostic** (spec § 5.2, "The rule"). First
   `grep -rn "Error creating\|Error reading view\|Error getting model\|Can not find model\|Error in controller\|Invalid controller\|Failed to find" test`
   and list what asserts these lines. Then, for each inner site in the Assumptions: remove its
   log, and throw an error whose message carries the context and the cause's message, with the
   original as `cause` (`Error creating ./public/x.html: EACCES …`;
   `Error getting model from <redactUrl(model)>: …`; `Error in controller for menu.hbs: …`).
   Keep the URL-model wrapper's `.error` property. Remove `lib/page-registry.js:648`; log the
   stack at `debug` there. The owners (`lib/kiss-page.js:476-477`,
   `lib/page-registry.js:647`) are unchanged.
   - verify: `npx vitest run test/unit/kiss-page.test.js test/unit/page-registry.test.js test/unit/controller-resolver.test.js test/unit/model-resolver.test.js`
     → pass, with each changed assertion listed in your report.
   - verify: `npx vitest run test/integration/run-build.test.js` → pass. New cases: a page whose
     output path is a directory, and a URL model on a closed local port; in each the cause's
     text appears exactly once in the command's stderr.

6. **Docs and checks.** Update each touched module's `AIKB/` doc and any `GUIDE.md` line quoting
   an old message. `npm run types` if any JSDoc changed.
   - verify: `npm test` → exit 0. `npm run lint`, `npm run typecheck`, `npm run format:check` →
     exit 0. `node scripts/scope-check.mjs` → exit 0.

## Red-first

`node scripts/red-first.mjs <file>` for each, exit 0 wanted, the line reported:
`test/integration/link-helper.test.js`, `test/integration/links.test.js`,
`test/integration/atomic-build.test.js`, `test/unit/model-resolver.test.js`. These files exist at
the base, so use `-t <name>` to run only the new case. The new `run-build` cases cannot be run
at the base (slice 1 is not there): say so in the report.

## Expected size

`lib/`: 120 to 200 lines added, about 30 removed. Tests: 200 to 350. Docs: 40 to 80.

## Stop and ask

- A test or tool outside this order's scope reads a line that step 5 removes.
- `lib/handlebars-helpers.js:665` raises a different message for a different reason.
- A redacted URL would appear unredacted in any new message.
- The id list cannot be read at render time without a new private field on `Kiss` reached from
  another module (it would grow the `privateReach` budget).

## Single-test command

```
npx vitest run test/unit/model-resolver.test.js
```
