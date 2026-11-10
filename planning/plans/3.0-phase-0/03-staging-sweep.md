# 03. Staging sweep spares live builds

**Model:** Sonnet. **Impact surface:** engine internals (patch).

## Objective

Stop one build deleting the staging folder of another build that is still running.

## Paths in scope

- `lib/staging.js`
- `test/unit/staging.test.js`
- `AIKB/staging.md`
- `TODO.md` (the one row)

Out of scope: `lib/kiss.js`, the promote and restore paths, any other test file.

## Assumptions

- `sweepStaleSiblings` removes every sibling named `<build>.kiss-staging-…` or
  `<build>.kiss-old-…` whose name does not start with this process's own pid
  (`lib/staging.js:72-102`). Measured.
- The suffix is `<pid>-<six random characters>` (`lib/staging.js:30`). Measured.
- Reproduced on 2026-11-09: a folder `public.kiss-staging-<pid>-zzzzzz` for a process that was
  still running was removed by `kiss-ssg check` in `examples/11-blog`, with the notice "Removed
  leftovers of an interrupted build". Measured.
- `process.kill(pid, 0)` throws `ESRCH` for a dead process, throws `EPERM` for a live one owned
  by another user, and returns for a live one. Inferred from Node's documentation, including on
  Windows. The CI Windows leg is the check.

## Steps

1. Read `AIKB/staging.md` and the existing `describe('sweepStaleSiblings')` block
   (`test/unit/staging.test.js:349`).
2. Add a test: start a child process that stays alive (`node -e "setTimeout(() => {}, 60000)"`),
   create a staging sibling named with the child's pid, run `sweepStaleSiblings`, expect the
   folder to remain. Kill the child in `afterEach`. Add a second test: a sibling named for a pid
   that is not running is still removed.
   verify: `npx vitest run test/unit/staging.test.js -t sweepStaleSiblings` fails on the first
   new test only. Record the failing output.
3. In `sweepStaleSiblings`, parse the pid from each candidate name and skip the candidate when
   that process is alive. A name whose pid cannot be parsed is treated as stale, as today. Log
   one `info` line naming each folder left because its build is still running.
   verify: the same command passes.
4. Update `AIKB/staging.md`: the rule, and the known limit that a recycled pid keeps a dead
   build's leftovers until that pid ends. Mark the `TODO.md` row "Implemented and tested".
5. verify: `npm run gates`.

## Stop and ask

- The fix needs a lock file, a timestamp or any change outside `sweepStaleSiblings`. The brief is
  a liveness check and nothing more.
- The new test is flaky, or fails on one operating system only.

## Fast feedback

```sh
npx vitest run test/unit/staging.test.js -t sweepStaleSiblings
```
