# 01. Scope field and scope check

**Model:** Sonnet. **Impact surface:** tooling and docs.

## Objective

Let a branch declare which paths it may change, and report every changed file outside that list,
so "surgical changes" is checked by a command instead of trusted.

## Paths in scope

- `scripts/scope-check.mjs` (new)
- `test/unit/scope-check.test.js` (new)
- `.claude/skills/branch-open/SKILL.md`
- `.claude/skills/branch-pulse/SKILL.md`
- `.claude/skills/branch-close/SKILL.md`
- `CLAUDE.md` (one line under Commands)

Out of scope: `lib/`, `bin/`, `scripts/gates.mjs`, the `plugins/` skills. This is not a sixth
gate; `CLAUDE.md` and several tests say "five gates".

## Assumptions

- The session file's frontmatter has `branch`, `base`, `status`, `opened` and two optional keys
  (`.claude/skills/branch-open/SKILL.md`, "Session-file template"). Measured.
- `scripts/base-branch.mjs` exports `resolveBaseBranch` and `scripts/gates.mjs` already computes
  the branch's changed files (`changedFiles`, `scripts/gates.mjs:133`). Measured. Reuse it; do not write a
  second diff.
- `test/unit/skill-code-blocks.test.js` allows a plain `node scripts/<name>.mjs` line in a skill.
  Inferred from other skills using that shape. Verify in step 4.

## Steps

1. Add an optional `scope:` key to the session-file template: glob patterns on one line,
   separated by commas. One line, because `frontmatter` in `lib/sessions.js:24` reads each key
   as a plain string (measured), and a list would need a second parser.
   Add an **Assumptions** bullet to the Step 3 interview and to the template's Intent section,
   each assumption marked measured or inferred. A substantial brief with no assumptions is not
   opened.
   verify: read the template back; both additions are present.
2. Write the test first for a pure function `outOfScope(changedFiles, patterns)` that returns
   the files matching no pattern. Cover: exact path, `dir/**`, no `scope:` key (returns nothing
   and says scope is undeclared), and the session file itself (always in scope).
   verify: `npx vitest run test/unit/scope-check.test.js` fails.
3. Write `scripts/scope-check.mjs`: find the open session file for the current branch, read
   `scope:`, call `changedFiles`, print each out-of-scope file, exit 1 if any, 0 if none, 2 if it
   could not run.
   verify: the same command passes.
4. Add the command to `/branch-pulse` and `/branch-close` as a step whose result is shown to the
   operator. Widening `scope:` is recorded as an Amendment.
   verify: `npx vitest run test/unit/skill-code-blocks.test.js test/unit/skill-coverage.test.js`.
5. verify: `npm run gates`.

## Stop and ask

- The frontmatter parser needed is more than a few lines. `lib/sessions.js` has one; importing
  from `lib/` into `scripts/` is fine, copying it is not.
- A skill test rejects the new command line.

## Fast feedback

```sh
npx vitest run test/unit/scope-check.test.js
```
