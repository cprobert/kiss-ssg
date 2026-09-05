---
name: test-coverage-check
description: Detects modules on the branch that lack a matching test file. Advisory by default (added + modified, two-tier suggestions); --gate for a hard block on added files only, used by branch-close. Exemption path: add `// @test-exempt: <reason>` to the source file.
---

# Test Coverage Check

## On invocation

Before running any checks, output exactly:

```
"Testing leads to failure, and failure leads to understanding." — Burt Rutan
```

Then proceed.

---

## When to use

- Run `/test-coverage-check` mid-branch for advisory suggestions — surfaces every module you've touched that lacks tests, with two tiers of urgency.
- `/branch-close` invokes `/test-coverage-check --gate` at the Test Coverage step — harder scope, hard block.

| Mode     | Flag     | Scope                  | Behaviour on an uncovered module                                                |
| -------- | -------- | ---------------------- | ------------------------------------------------------------------------------- |
| Advisory | _(none)_ | Added **and** modified | Two-tier: strong suggestion for added, softer FYI for modified                  |
| Gate     | `--gate` | Added only             | Hard stop — write tests or add an exemption marker, then re-run `/branch-close` |

The gate scope is narrower deliberately: `CLAUDE.md`'s rule is "engine code goes in `lib/`, one responsibility per file, **with a unit test in `test/unit/`**" — an obligation that lands on the commit that _adds_ the module. Modified files may carry a pre-existing deficit you didn't create; advisory surfaces them, the gate doesn't enforce them.

**Where tests live.** Unlike a sibling-file convention, this repo puts every unit test in `test/unit/`, named after the module: `lib/sitemap.js` → `test/unit/sitemap.test.js`. Two standing exceptions, both from `CLAUDE.md` and `AIKB/testing.md`:

- **`lib/kiss.js` has no unit test on purpose** — the orchestrator is covered end-to-end through its public API in `test/integration/`. Never flag it, and never propose writing `test/unit/kiss.test.js`.
- **`scripts/*.mjs` is in scope too.** The obligation is about logic, not location. `scripts/` holds the dev tooling this whole ritual depends on — the gate battery and the base-branch resolver — and a wrong predicate there fails silently in exactly the place nothing else is watching. There is no CI in this repo, so `test/unit/` is the only safety net these files have.

---

## Execution instructions

### Step 1 — Detect files in scope

```bash
BASE=$(node scripts/base-branch.mjs)
```

**Gate mode** (`--gate`) — added files only:

```bash
git diff --name-only --diff-filter=A "$BASE...HEAD" \
  | grep -E '^(lib/[^/]+\.js|scripts/[^/]+\.mjs)$' \
  | grep -v '^lib/kiss\.js$'
```

**Advisory mode** (no flag) — added and modified, two separate lists: run the same pipeline twice, with `--diff-filter=A` (tier 1) and `--diff-filter=M` (tier 2).

If all lists are empty: report "No new or modified modules — pass." and exit.

### Step 2 — Check for a matching test

For each file in scope, check `test/unit/<basename>.test.js` — the basename with whichever extension it carries stripped, since a `.mjs` module's tests are still `.test.js`:

```bash
test -f "test/unit/$(basename "<path>" | sed -E 's/\.(js|mjs)$//').test.js" && echo covered || echo uncovered
```

Files with a matching test are ✅ **Covered** — skip classification.

### Step 3 — Classify uncovered files

For each uncovered file:

1. Check the first 15 lines for `// @test-exempt: <reason>`.
2. Read the first ~40 lines to classify the module.

| Bucket                 | Examples                                                                                                                                                                                                                                            | Gate behaviour                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| ✅ **Covered**         | Has `test/unit/<name>.test.js`                                                                                                                                                                                                                      | Pass                                      |
| 🔕 **Exempt**          | Has `// @test-exempt: <reason>`                                                                                                                                                                                                                     | Pass — show the reason                    |
| ⚠️ **Uncovered logic** | Path/slug derivation; model or controller resolution; dedupe and replay predicates; anything deciding _whether_ something rebuilds, writes, or is skipped; parsers of external input (a fetched JSON model, `npm pack` output); date/ordering logic | Gate: stop. Advisory: strong suggestion   |
| ℹ️ **Thin / glue**     | A module that only wires two others together; a pure constant table; an I/O wrapper whose decision core is already tested elsewhere                                                                                                                 | Advisory-only in both modes — never gates |

Prioritise the failure modes that are **silent in production**: a page that quietly stops rebuilding on watch, a dedupe that drops a page, an asset copy that races. Those are this engine's history — `AIKB/*.md`'s Non-obvious behavior sections are a list of them.

### Step 4 — Report and respond

**Advisory mode:**

- For each ⚠️ **added** file: strong suggestion — "Consider writing these before closing the branch." Outline the test shape: `makeSite(files)` from `test/helpers/site.js` for anything touching the filesystem, `silentLogger` from `lib/logger.js` for anything that logs, and the cases to cover (happy path, the invariant, the edge case).
- For each ⚠️ **modified** file: softer FYI — "You touched this untested file — here's what coverage could look like." Same outline, lower urgency. No action required.
- ℹ️ Thin files: list them briefly. No suggestion needed.

**Gate mode:**

- If no ⚠️ files: report clean and exit. The ritual may continue.
- If any ⚠️ files remain: **stop**. Do not proceed with `/branch-close`.

  > These modules are missing tests and carry no exemption marker. Before continuing:
  >
  > - Write the missing tests in `test/unit/` (run `npm test` to confirm they pass), then re-run `/branch-close`, **or**
  > - Add `// @test-exempt: <reason>` near the top of each file if the module is genuinely exempt, then re-run `/branch-close`.
  >
  > There is no CI here — an undocumented omission ships.

---

## Exemption mechanism

Add this comment within the first 15 lines of the source file:

```js
// @test-exempt: thin wiring — every branch it takes is covered in test/integration/lifecycle.test.js
```

The reason is visible in the PR diff, co-located with the code, and requires no separate allowlist. It is the operator's written justification, not a bypass.

---

## Relationship to other gates

| Gate                              | When                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/test-coverage-check` (advisory) | Mid-branch, on developer initiative or from `/branch-pulse` — added + modified                                   |
| `/test-coverage-check --gate`     | Test Coverage step of `/branch-close` — added only, hard block                                                   |
| `npm run gates` → test            | Gates step of `/branch-close` — validates that existing tests pass, but cannot detect missing tests on new files |
