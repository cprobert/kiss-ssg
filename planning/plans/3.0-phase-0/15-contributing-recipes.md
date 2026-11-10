# 15. Recipes in CONTRIBUTING.md

**Model:** Sonnet. **Depends on:** 01, 02. **Impact surface:** docs.

## Objective

State up front what the three most common engine changes must carry, so an implementer reads a
checklist instead of learning each obligation from a failing gate.

## Paths in scope

- `CONTRIBUTING.md` (new, at the repo root)
- `README.md` (§ Development: one link, and the single-test command)
- `CLAUDE.md` (one sentence pointing at the file)

Out of scope: `lib/`, `test/`, the gates, `package.json` `files` (the file does not ship).

## Assumptions

- There is no CONTRIBUTING file. Measured.
- A clean-room agent adding a built-in helper needed three gate rounds and touched seven files.
  Measured, 2026-11-10. What it learned, and how:
  - `lib/handlebars-helpers.js` and `test/unit/handlebars-helpers.test.js`: found by reading
  - a line in `llms.txt`: a failing test
  - a bullet in `AIKB/handlebars-helpers.md`: a failing test
  - regenerated `types/` (`npm run types`): a failing test
  - `llms.txt` under 16,000 characters, with 4 to spare: a failing test
  - a section in `GUIDE.md`: only `CLAUDE.md` says so; no test
  - `test/integration/watch.test.js` used the new helper's name as its own example: two failing
    tests whose messages did not say why
- A single test file runs with `npx vitest run <file>`, and one test with `-t <name>`. Measured:
  0.6 seconds against about two minutes for the suite.

## Steps

1. Write three recipes. Each is a numbered checklist where every item has the file to change
   and a `verify:` command:
   - add a built-in helper
   - add a config key (with a default, validated in `lib/config.js`)
   - add an audit check
     Start each with the single-test command for the module.
2. Prove each recipe by following it literally on a scratch branch, with a trivial change, and
   running the gates. Throw the scratch branch away.
   verify: for each recipe, the session log records "gates green on the first run" or what the
   recipe was missing. A recipe that needed a second gate round is corrected and proved again.
3. Add a short opening: how work is handed out here (a work order, `/branch-open`,
   `CLAUDE.md § Working practice`, the scope check, the red-first record), in under 200 words.
4. Link it from `README.md § Development` and `CLAUDE.md`.
   verify: `npx vitest run test/unit/markdown-links.test.js`.
5. verify: `npm run gates`.

## Stop and ask

- A recipe cannot be completed without adding to `llms.txt`. Record that the cap blocks it; do
  not cut another entry to make room.
- A recipe exceeds 25 items. That is a finding about the engine, not a longer recipe.

## Fast feedback

```sh
npx vitest run test/unit/markdown-links.test.js
```
