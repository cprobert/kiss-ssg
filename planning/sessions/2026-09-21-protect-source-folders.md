---
branch: codex/protect-source-folders
base: main
status: open
opened: 2026-09-21
---

# Session — 2026-09-21: Protect configured source folders

## Intent (captured at /branch-open)

**Objective:** Reject unsafe source/output configurations before construction can
create or delete files.

**Success criteria:**

- [ ] Reject `folders.src` resolving to the working project root, including aliases.
- [ ] Reject build folders equal to or containing any configured source folder.
- [ ] Reject build folders nested inside pages, assets, layouts, partials, models,
      controllers, helpers, or AIKB; permit an otherwise separate `src/public`.
- [ ] Check actual filesystem locations, including junctions/symlinks, Windows
      case differences, and non-existent descendants of existing aliases.
- [ ] Apply the guard regardless of `cleanBuild` and before filesystem mutation.
- [ ] Demonstrate regressions failing before the fix, then passing with source
      sentinel contents and directory structure preserved.
- [ ] Update configuration guidance and keep the other five review findings open
      in `TODO.md`.

**Non-goals / out of scope:** Staging ownership/liveness, atomic defaults, asset
hashing, fetch timeouts, watcher behaviour, and auxiliary-output failure policy.

**Impact surface:** Public API — previously accepted unsafe folder arrangements
will throw. No new configuration options. Release classification belongs to
branch-close; no version change or release is requested here.

**Expected shape:** Planned — config validation, filesystem preservation tests,
and documentation of the stricter contract.

**Delegation convention:** None: one session.

### Amendments

None.

## Pulse log

- **2026-09-21** — Started from `main`; the only working-tree change was the
  operator-requested review table in `TODO.md`, carried into this branch. Scope
  accepted in conversation. Existing feedback emphasises red-first evidence,
  platform-aware verification, and checking actual consumer shapes. No independent
  review has run.

---

<!-- Reflection and final verdict are reserved for branch-close. -->
