---
branch: chore/scope-check
base: main
status: open
opened: 2026-11-10
scope: scripts/scope-check.mjs, test/unit/scope-check.test.js, .claude/skills/branch-open/SKILL.md, .claude/skills/branch-pulse/SKILL.md, .claude/skills/branch-close/SKILL.md, CLAUDE.md, planning/plans/3.0-phase-0/01-scope-check.md
---

# Session — 2026-11-10: Scope field and scope check (Phase 0, work order 01)

## Intent (captured at /branch-open)

The intent is `planning/plans/3.0-phase-0/01-scope-check.md`, the first of the Phase 0 work orders in `planning/plans/2026-11-10-roadmap-to-3.0.md`. This section restates it; where the two differ, the work order wins and the difference is an Amendment.

**Objective:** Let a branch declare which paths it may change, and report every changed file outside that list, so "surgical changes" is checked by a command instead of trusted.

**Success criteria:**

- [ ] The session-file template in `/branch-open` has an optional one-line `scope:` key (comma-separated globs), and the Step 3 interview and the template's Intent section have an **Assumptions** field, each assumption marked measured or inferred; a substantial brief with none is not opened.
- [ ] `test/unit/scope-check.test.js` tests `outOfScope(changedFiles, patterns)`: exact path, `dir/**`, no `scope:` key (nothing returned, scope reported undeclared), and the session file always in scope. It was seen to fail before `scripts/scope-check.mjs` existed, with the failing output pasted into the Pulse log.
- [ ] `node scripts/scope-check.mjs` finds the open session file for the current branch, reads `scope:`, reuses `changedFiles` from `scripts/gates.mjs` (no second diff) and `frontmatter` from `lib/sessions.js` (imported, not copied), prints each out-of-scope file, and exits 1 when there are any, 0 when none, 2 when it could not run.
- [ ] `/branch-pulse` and `/branch-close` run it as a step whose result is shown to the operator; widening `scope:` is recorded as an Amendment.
- [ ] `npx vitest run test/unit/skill-code-blocks.test.js test/unit/skill-coverage.test.js` and `npm run gates` pass.
- [ ] Run on this branch, the command reports no file outside this session file's own `scope:`.

**Assumptions:**

- `changedFiles(base, cwd, env)` is exported at `scripts/gates.mjs:133`. Measured, 2026-11-10.
- `resolveBaseBranch` is exported from `scripts/base-branch.mjs`. Measured.
- `frontmatter(text)` in `lib/sessions.js` returns each key as one plain string, first line wins. Measured.
- `test/unit/skill-code-blocks.test.js` accepts a plain `node scripts/scope-check.mjs` line. **Inferred, and weaker than the work order says**: the test lists exact lines (`node scripts/base-branch.mjs --name`), so it may need a new allow-list entry, and that file is outside the work order's paths. If so: stop and ask.

**Non-goals / out of scope:** `lib/`, `bin/`, `scripts/gates.mjs` and the `plugins/` skills. Not a sixth gate (`CLAUDE.md` and several tests say "five gates"). No `llms.txt` line (4 characters of headroom). No version bump or changelog entry: those belong to `/branch-close`.

**Impact surface:** tooling & docs — a dev script, its test, and three repository skills; nothing ships.

**Expected shape:** planned — the work order maps the route step by step, each with a `verify:` command.

**Delegation convention:** none: one session. Claude (Opus 5.5) implements, where the work order names Sonnet; the operator chose this at the open. Claude commits and pushes when the steps pass, and stops; the operator runs `/branch-close`. No `--dev` server. Codex review is not the default (no `lib/` or `bin/` change).

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- 2026-11-10 — The work order is implemented by Opus, not the Sonnet it names (operator's choice at the open). Every point where the brief left something to guess is logged here, as evidence for the roadmap's premise. The `scope:` line above adds this session file (always in scope) and the work order itself (deleted by the branch that completes it, per `planning/plans/3.0-phase-0/README.md`).

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
