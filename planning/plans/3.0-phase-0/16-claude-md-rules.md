# 16. Cut CLAUDE.md to rules

**Model:** Opus. **Depends on:** 15. **Impact surface:** docs.

Opus, not Sonnet: deciding what is a rule and what is the story of a rule is a judgement over
the whole file, and a wrong cut removes a guard silently.

## Objective

`CLAUDE.md` states each rule once, in a sentence or two, and links to its history. The history
moves, unedited, to a file nothing loads by default. Nothing is lost and no rule changes meaning.

## Paths in scope

- `CLAUDE.md`
- `planning/history/claude-md-rules.md` (new)
- `AGENTS.md` (only if a reference breaks)
- `test/aikb.test.js`, `test/unit/skill-coverage.test.js`, `test/unit/corpse-collector.test.js`
  (only where they assert on text that moves)

Out of scope: every skill, `AIKB/`, `llms.txt`, the meaning of any rule.

## Assumptions

- `CLAUDE.md` is 62,149 bytes, loaded into every session. Measured, 2026-11-10.
- It carried 58 dated incident references on 2026-11-09. Measured by grep.
- Tests read `CLAUDE.md`: `test/aikb.test.js` checks the AIKB table. Measured. Which other tests
  assert on its sentences is not checked; step 1 finds out.
- `.claude/skills/memory-consolidate/retired.md` points lessons at "a bullet in `CLAUDE.md`".
  Measured. Those pointers must still resolve.

## Target

20 KB or less. That is Fable's estimate, not a requirement: if a rule cannot be said shortly
without losing a guard, keep the guard and report the size reached.

## Steps

1. List every test, skill and script that reads `CLAUDE.md` or quotes it.
   verify: the list is in the session log, with what each one needs to stay true.
2. Copy the whole of the current file into `planning/history/claude-md-rules.md` under a dated
   heading, unedited. This is the record.
   verify: `git diff --stat` shows the new file at the size of the old one.
3. Work through `CLAUDE.md` one section at a time, one commit per section. For each rule: keep
   the instruction and, where it has one, the mechanism that enforces it. Replace the incident
   narrative with a link to the history file's matching heading.
   - Keep whole: Design philosophy, Working practice, the AIKB table.
   - The Commands block keeps one line per command; the long comments move to
     `CONTRIBUTING.md` or the history file.
   - The Pipeline paragraph becomes five sentences and a pointer to `AIKB/kiss.md`.
     verify: after each section, `npx vitest run test/aikb.test.js test/unit/skill-coverage.test.js
test/unit/corpse-collector.test.js test/unit/markdown-links.test.js`.
4. Make a table in the session log: every rule in the old file, and where it is in the new one.
   verify: no row is empty. A rule deliberately dropped is listed with the reason, for the
   operator to accept or refuse.
5. verify: `npm run gates`, then `node scripts/budgets.mjs` shows `claudeMdBytes` better.

## Stop and ask

- A rule and its history cannot be separated without changing what the rule means.
- A test asserts on a sentence that is history. Do not delete the assertion; ask.
- Before the last commit: the operator reads the new file whole. This is the one diff the
  operator reads in Phase 0.

## Fast feedback

```sh
npx vitest run test/aikb.test.js test/unit/skill-coverage.test.js
```
