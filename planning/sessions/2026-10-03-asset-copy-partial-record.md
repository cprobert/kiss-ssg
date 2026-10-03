---
branch: fix/asset-copy-partial-record
base: main
status: open
opened: 2026-10-03
---

# Session — 2026-10-03: An asset copy that fails partway records what it wrote

## Intent (captured at /branch-open)

**Objective:** an asset copy that fails partway still records every output it already wrote, so a later run removes them and a `git checkout` or bulk delete during `--dev` can no longer leave a stale asset in the build until restart (`AIKB/assets.md`, Known issue, found 2026-10-02).

**Success criteria:**

- [ ] A regression test reproducing the Known issue — a copy fails partway (a source vanishing between fs-extra's unlink and copy), the asset root is then removed, and the already-written output is gone afterwards — **seen red against the unfixed code** before the fix lands.
- [ ] The fix records per file as it is written (or from the source inventory before copying), at the point the gap opens — not a reconciliation pass in the `catch` that has to agree with the main path.
- [ ] Fix the class: every emit path in `lib/assets.js` and `lib/asset-copy.js` (the copy, the Sass compile, the `assets.hash` move, the watch re-copy) is audited for "written before recorded", and each is either fixed or named in the commit as not having the gap, with the reason.
- [ ] `AIKB/assets.md`'s Known issue is replaced by the mechanism that now holds (and `AIKB/asset-copy.md` if its seam moved); the `AIKB/upstream.md` cross-reference to the unlink-first gap still reads true.
- [ ] The fleet under `C:\Code\kiss` builds identically on `main` and on the branch (a `main` worktree, junctions, `check`'s own `diffReports`, `pipeline[].duration` masked), each site's git tree clean before and after.
- [ ] `npm run gates` green, exit code read, not filtered stdout.

**Non-goals / out of scope:** working around fs-extra's every-copy unlink-first gap itself (that stays documented in `AIKB/upstream.md`, per the upstream rule); changing the copy-beats-Sass precedence; any change to `copyAssets`' return shape or to what a site can observe on a successful build.

**Impact surface:** engine internals — `lib/assets.js` (and possibly `lib/asset-copy.js`) behaviour on a failure path, API unchanged; patch bump.

**Expected shape:** planned — red test from the recorded reproduction, per-file recording, sibling audit, docs.

**Delegation convention:** none: one session. Agents never commit.

### Amendments

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
