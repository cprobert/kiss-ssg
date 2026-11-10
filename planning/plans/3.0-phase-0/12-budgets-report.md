# 12. Budgets report

**Model:** Sonnet. **Impact surface:** tooling.

## Objective

One command prints the roadmap's budgets as numbers and says which way each has moved since the
recorded baseline. It reports; it does not fail the gates yet. Phase 1 turns it into a gate.

## Paths in scope

- `scripts/budgets.mjs` (new)
- `test/unit/budgets.test.js` (new)
- `planning/budgets.json` (new, the recorded baseline)
- `CLAUDE.md` (one line under Commands)

Out of scope: `scripts/gates.mjs`, `lib/`.

## The nine numbers, defined exactly

Each is a pure function over file contents, so it can be tested on a small fixture.

| Key                  | Definition                                                                                          | 2026-11-09 |
| -------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| `coreLines`          | Total lines of every `lib/*.js`                                                                     | 33,569     |
| `privateReach`       | Distinct matches of `kiss\._[A-Za-z]+` across `lib/*.js` except `lib/kiss.js`                       | 115        |
| `anyAnnotations`     | Occurrences of `{any}` across `lib/*.js`                                                            | 95         |
| `runtimeDeps`        | Number of keys in `package.json` `dependencies`                                                     | 21         |
| `testPrivateReach`   | Matches of `\b(kiss                                                                                 | site       | k   | instance | app)\._[A-Za-z]`across`test/**/*.js` | 288 |
| `claudeMdBytes`      | Size of `CLAUDE.md` in bytes                                                                        | 62,149     |
| `llmsTxtChars`       | Length of `llms.txt` in characters                                                                  | 15,996     |
| `msPerPage`          | Not computed here. Read from a bench JSON file when `--bench <file>` is given, else reported absent | 2.3        |
| `failureBoilerplate` | Files under `examples/`, `starter/` and the repo root that contain `function reportBuildFailure`    | 14         |

The figures are Fable's measurements. `testPrivateReach` came from a subagent's grep and its
exact pattern was not recorded, so the first run of this script sets the true baseline: if a
number differs from the table, record what the script measures and say so in the session log.

## Assumptions

- All nine can be computed with Node's `fs` and no new dependency. Inferred.
- `scripts/bench.mjs --json=<file>` writes a file a per-page time can be read from. Measured
  that the flag exists (`scripts/bench.mjs:27`); the shape of the file is not checked.

## Steps

1. Write the tests first, one per number, each over an in-memory fixture.
   verify: `npx vitest run test/unit/budgets.test.js` fails.
2. Write `scripts/budgets.mjs`. With no flag it prints a table: key, baseline, now, and
   `better`, `same` or `worse`. `--record` writes `planning/budgets.json`. `--check` exits 1 if
   any number is worse than the baseline.
   verify: the tests pass.
3. Run `--record` and commit the baseline.
   verify: a second run with no flag prints `same` on every row.
4. verify: `npm run gates`.

## Stop and ask

- A definition above is ambiguous for a real file. Do not pick a reading; ask.
- A measured number differs from the table by more than a tenth.

## Fast feedback

```sh
npx vitest run test/unit/budgets.test.js
```
