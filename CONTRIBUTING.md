# Contributing

Work arrives here as a work order or a request, and an agent or a person does it. Open the branch with `/branch-open`, which writes the intent and a `scope:` line of the paths the branch may change into `planning/sessions/`. Follow [`CLAUDE.md § Working practice`](CLAUDE.md#working-practice): state your assumptions, change only what the task needs, and turn the task into a check before you start. `node scripts/scope-check.mjs` lists every changed file the `scope:` line does not cover. `node scripts/red-first.mjs <test file>` runs a new test against the base branch and prints the pulse-log line that records it failed there. The gates (`npm run gates`) run what CI runs, and take about two minutes.

A single test file runs in about a second: `npx vitest run <file>`, and one test with `-t <name>`.

Each recipe below lists what a change of that kind has to carry. Every item names the file to change and a command whose output shows it landed. A table row in a Markdown file is padded by Prettier: after editing one, run `npx prettier --write <file>`.

## Add a built-in helper

Start with `npx vitest run test/unit/handlebars-helpers.test.js -t <name>`.

1. Choose a name no test uses already: `grep -rn "<name>" test/` should find nothing. `test/integration/watch.test.js` registers its own `shout` helper, and a built-in of the same name fails two of its tests with `expected [Function] to be undefined`, which does not say why.
2. Write the test first, in `test/unit/handlebars-helpers.test.js`.
   verify: `node scripts/red-first.mjs test/unit/handlebars-helpers.test.js -t <name>` exits 0 (the test failed at the base).
3. Register it in `lib/handlebars-helpers.js` with `hbs.registerHelper('<name>', …)`, and add the name to the roster in the JSDoc above `registerHandlebarsHelpers`.
   verify: `npx vitest run test/unit/handlebars-helpers.test.js -t <name>` passes.
4. Add one index line to `llms.txt § Helpers`, in the shape of its neighbours: the name in backticks, a colon, what it does, and a trap if nothing reports it. `llms.txt` sits at its cap, so in the same change cut at least as many characters elsewhere in it, as `CLAUDE.md` says: raise the cap only by cutting something else, and never raise it for a new line. Tighten the wording of an existing line. A cut must not drop an entry or change what an entry says is true.
   verify: `npx vitest run test/aikb.test.js` passes, which includes the 16,000-character cap.
5. Add a bullet for the helper, in the shape of its neighbours, under `## Public interface` in `AIKB/handlebars-helpers.md`.
   verify: `npx vitest run test/aikb.test.js`.
6. Document the behaviour in `GUIDE.md § Helpers`, as a paragraph in the existing section, with a snippet you ran. A new `##` or `###` heading also needs a page in `src/models/guide.json`. No test checks that GUIDE.md mentions the helper.
   verify: `grep -n "<name>" GUIDE.md`.
7. Regenerate `types/`: `npm run types`. It changes `types/handlebars-helpers.d.ts` when the JSDoc roster changed.
   verify: `npx vitest run test/unit/types.test.js`.
8. verify: `npm run gates`.

## Add a config key

Start with `npx vitest run test/unit/config.test.js -t <key>`.

1. Write the test first, in `test/unit/config.test.js`: the default, a value given, and the value that must be refused.
   verify: `node scripts/red-first.mjs test/unit/config.test.js -t <key>` exits 0.
2. In `lib/config.js`, add the default to `DEFAULT_CONFIG` (or to the `DEFAULT_*` block the key belongs to), an `@property` line to the typedef, and a refusal in `resolveConfig` for a value of the wrong type that names the key (`config.<key> must be …`). The key needs a default: if there is no sensible one, the design is unfinished.
   verify: `npx vitest run test/unit/config.test.js` passes.
3. Add the key to the defaults block in `llms.txt § Config`. `test/aikb.test.js` evaluates that block and compares it with `resolveConfig({})`, so a key missing from it fails. `llms.txt` sits at its cap, so in the same change cut at least as many characters elsewhere in it, as `CLAUDE.md` says: raise the cap only by cutting something else, and never raise it for a new key. Tighten the wording of an existing line. A cut must not drop an entry or change what an entry says is true.
   verify: `npx vitest run test/aikb.test.js` passes, which includes the 16,000-character cap.
4. Add the key to the same block in `GUIDE.md` (`The default config options are:`), and a row to the table after it. Then `npx prettier --write GUIDE.md`.
   verify: `npx vitest run test/aikb.test.js`.
5. Add the key to the `DEFAULT_CONFIG` line in `AIKB/config.md`, and to the AIKB doc of the module that reads it.
   verify: `grep -n "<key>" AIKB/config.md`.
6. Regenerate `types/`: `npm run types`.
   verify: `npx vitest run test/unit/types.test.js`.
7. verify: `npm run gates`.

## Add an audit check

Start with `npx vitest run test/unit/audit.test.js -t <check-id>`.

1. Write the test first, in `test/unit/audit.test.js` beside the other per-page checks: build pages with `page({ … })`, run `audit({ pages })` and compare `only(result, '<check-id>')`. Include the value just inside the limit, which must not fire.
   verify: `node scripts/red-first.mjs test/unit/audit.test.js -t <check-id>` exits 0.
2. Append the id to `CHECKS` in `lib/audit.js`, after the last one: the order is public, so never slot it in. Then decide it in `auditBuild`, from the facts `extractPageFacts` already read, or add a fact there.
   verify: `npx vitest run test/unit/audit.test.js -t <check-id>` passes.
3. Fix the two tests in `test/unit/audit.test.js` that pin the tail of `CHECKS`: the list in `describe('CHECKS')`, which gains the new id, and `the speed checks are appended to CHECKS`, whose `CHECKS.slice(-n, -m)` bounds each move back one place. They fail with a diff of ids, and the second only with `expected [...] to deeply equal [...]`.
   verify: `npx vitest run test/unit/audit.test.js`.
4. Add a row to the table in `plugins/kiss-ssg/skills/kiss-site-review/SKILL.md` saying what to do about the finding. `test/unit/skill-coverage.test.js` fails until that skill names every id in `CHECKS`.
   verify: `npx vitest run test/unit/skill-coverage.test.js`.
5. Add a row to the checks table in `GUIDE.md § Checking a build`, and the id to the `CHECKS` line in `AIKB/audit.md`. Then `npx prettier --write GUIDE.md plugins/kiss-ssg/skills/kiss-site-review/SKILL.md AIKB/audit.md`.
   verify: `npx prettier --check GUIDE.md plugins/kiss-ssg/skills/kiss-site-review/SKILL.md AIKB/audit.md`.
6. Regenerate `types/`: `npm run types`. The `CheckId` union changes `types/audit.d.ts` and `types/config.d.ts`.
   verify: `npx vitest run test/unit/types.test.js`.
7. verify: `npm run gates`.
