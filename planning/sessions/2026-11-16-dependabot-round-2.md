---
branch: chore/dependabot-round-2
base: main
status: open
opened: 2026-11-16
scope: package.json, package-lock.json, tsconfig*.json, scripts/emit-types.mjs, test/unit/types.test.js, types/**, AIKB/css-purge.md, AIKB/markdown-copy.md, AIKB/upstream.md, CHANGELOG.md, .claude-plugin/marketplace.json, plugins/*/.claude-plugin/plugin.json, planning/**
---

# Session — 2026-11-16: Dependabot round 2 (#95, #89, #88)

## Intent (captured at /branch-open)

**Objective:** Take the three open Dependabot PRs on one branch before Phase 3 opens, so Phase 3 starts from current dependencies: the minor/patch group (#95), purgecss 9 (#89) and TypeScript 7 (#88). Ship as 2.18.1.

**Success criteria:**

- [ ] **#95 taken:** glob 14.0.6, sass 1.108.2, turndown 7.2.5, prettier 3.10.1 in `package-lock.json`. If prettier 3.10 reformats anything, the reformat is its own commit.
- [ ] **#89 taken:** purgecss `^9.1.0`. Its release notes are read against `lib/css-purge.js` (the one importer, `:317`) before the bump, and the result is stated in a pulse.
- [ ] **#88 taken:** typescript `^7.0.2`. `npm run types` emits (the `TS5011` `rootDir` failure fixed in `tsconfig.types.json`), `npm run typecheck` passes, and `types/` is byte-identical to what TypeScript 5.9 emitted, or each difference is explained. The `test/unit/types.test.js` assertion that expects TypeScript 5.9's diagnostic wording is fixed by asserting what the test means, not by pinning TypeScript 7's wording.
- [ ] **Examples and docs:** all fifteen examples (`npm run eg1` … `eg15`) and `node docs` build byte-identical before and after, or each difference is explained.
- [ ] **Fleet check:** `node scripts/fleet-check.mjs <site> --base main` on a1k9training and diploma-msc (the two sites that purge; diploma-msc with its CMS data fetched by the recipe in the fleet memory), plus oxford-medical and medulla (sass, and turndown through the Markdown copies). Byte-identical, or each difference is explained.
- [ ] **Release:** `npm run gates` pass on both OS in CI. 2.18.1 with `### Nothing for a site to change` if the fleet is byte-identical; otherwise an upgrade note naming what moved.
- [ ] **After merge:** #95, #89 and #88 are closed, by Dependabot or by hand with the reason.

**Non-goals / out of scope:**

- Any code change beyond what a bump forces.
- Issue #90 (Phase 4, and the feature freeze).
- Phase 3, and the CMS recipe as a `fleet-check` option (a Phase 3 criterion).
- The stale remote branches (`dependabot/…/glob-14.0.2`, `vite-8.3.6`, `ccr-f6af9894-zy0ccy`, `feat/kiss-writing-for-the-web`, `v1`).

**Impact surface:** engine internals. Runtime dependency bumps with the API unchanged. purgecss is a major but internal to `assets.purge`. Patch, 2.18.1 (the operator's choice, as proposed).

**Expected shape:** planned. The unknowns are TypeScript 7 (a new compiler: whether `checkJs` and declaration emit from JSDoc hold) and whether purgecss 9 moves purge output.

**Assumptions:**

- Measured (2026-11-16, `gh pr view`): #95 and #89 are green on Ubuntu and Windows. #88 fails the `test` gate on both: `tsconfig.types.json(7,5): error TS5011` in `types.test.js` "types/ is what `npm run types` emits", and one assertion expecting `not assignable to type 'boolean | "a…'`.
- Measured (same): #95 changes only `package-lock.json`. #89 and #88 change `package.json` and the lock.
- Measured (2026-11-16, `gh pr view 89`): purgecss 9's one listed breaking change is "Node.js 22.12 or later". Our floor is `>=22.23.4` (`package.json:33`). The notes say the one-pass rule removal "gives the same output".
- Measured (2026-11-16, grep): purgecss is imported only at `lib/css-purge.js:317`. turndown is imported in `lib/markdown-copy.js` and `lib/utils.js`.
- Measured (2026-11-16, grep under `C:\Code\kiss`): a1k9training (`router.js:49`) and diploma-msc (`config/assets.js:11`) configure `purge`.
- Measured (2026-11-16, `gh api …/dependabot/alerts?state=open`): no open Dependabot alerts.
- Not measured: whether `typecheck` passes under TypeScript 7. The #88 log grep showed only the `test` gate.
- Inferred: `typecheck` runs `tsconfig.check.json`, a different file from the `TS5011` failure, so it may hit failures of its own.

**Delegation convention:** none: one session.

**Independent review:** no `lib/` or `bin/` change is expected. If a bump forces one, Codex reviews it at that slice and at the close.

### Amendments

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
