# 02. Red-first record

**Model:** Sonnet. **Impact surface:** tooling and docs.

## Objective

Make the rule "a regression test is accepted only once it has been seen to fail" auditable: one
command runs a new test against the unfixed code and writes down that it failed.

## Paths in scope

- `scripts/red-first.mjs` (new)
- `test/unit/red-first.test.js` (new)
- `.claude/skills/branch-pulse/SKILL.md`
- `CLAUDE.md` (one line under Commands; one sentence on the existing regression-test rule)

Out of scope: `lib/`, the gates, any existing test.

## Assumptions

- Nothing in the repo records a red run today: 3 test comments mention it and no convention
  links a test to one. Measured by the test-quality review, 2026-11-09.
- `scripts/fleet-check.mjs` already builds a copy of the repo at another ref with `git archive`.
  Measured from its description in `CLAUDE.md`; read the script before reusing its approach.
- A test file can be run against the base by checking the base out into a temporary worktree and
  copying only the test file in. Inferred. Step 1 proves or disproves it.

## Steps

1. By hand, on a scratch branch: add a deliberately failing test, create a worktree at the base
   with `git worktree add`, copy the test file into it, link `node_modules`, run the test there.
   verify: the run fails in the worktree and the main checkout is untouched. Remove the worktree.
2. Write the test first for the pure parts: argument parsing, and a `recordLine` function that
   takes the test path, the base, its commit and whether the test failed, and returns one
   Markdown line such as
   `- red-first: test/unit/x.test.js failed at <base> (<short sha>), <date>`.
   verify: `npx vitest run test/unit/red-first.test.js` fails.
3. Write `scripts/red-first.mjs <test file> [-t <name>]`. It resolves the base with
   `resolveBaseBranch`, does step 1, removes the worktree in a `finally`, and prints the line.
   Exit 0 when the test failed at the base (the wanted result), 1 when it passed there (the test
   proves nothing), 2 when it could not run.
   verify: the unit test passes; run the script on the scratch test from step 1 and see exit 0.
4. Tell `/branch-pulse` to run it for each new regression test and paste the line into the pulse
   log.
   verify: `npx vitest run test/unit/skill-code-blocks.test.js`.
5. verify: `npm run gates`.

## Stop and ask

- The test under check needs a fixture or helper that does not exist at the base. Report the
  case; do not copy more files across on your own judgement.
- Creating a worktree fails on Windows in CI.

## Fast feedback

```sh
npx vitest run test/unit/red-first.test.js
```
