---
branch: chore/dependabot-round-1
base: main
status: open
opened: 2026-11-06
---

# Session — 2026-11-06: Dependabot's first round, and Node 22.23.4

## Intent (captured at /branch-open)

**Objective:** Take the first weekly round of Dependabot PRs (#60–#70) in one branch, and raise kiss's Node floor to 22.23.4 (the current Node 22 LTS, a security release) so chokidar 6 can be taken. Shipped as 2.13.0 with an upgrade note.

**Success criteria:**

- [ ] `engines.node` is `>=22.23.4` and `.nvmrc` is `22.23.4`. Every place that states the floor (21 files matched `22.12|22.13|>=22|≥22` at the open; `planning/` and `CHANGELOG.md` history excepted) says the new one, or is history.
- [ ] chokidar 6: its breaking changes are read against `lib/watcher.js` before the bump, and the result is stated. A `--dev` round trip (edit a page, see it rebuild) is seen to work on one example.
- [ ] htmlparser2 12: its breaking changes are read against the three `Parser` users (`lib/consent-gate.js`, `lib/html-split.js`, `lib/packages.js`) before the bump.
- [ ] The minor/patch group (#66: sass, eslint, prettier, fs-extra, globals, playwright-core, postcss, vitest) is taken, and the four Actions majors (#62–#65) after their release notes are checked against `ci.yml` and `static.yml`.
- [ ] `dependabot.yml` ignores `@types/node` majors (types stay on the Node floor's line), and #70 is closed by that decision.
- [ ] The docs site and all 14 examples build byte-identical before and after, or each difference is explained (sass and htmlparser2 can change output).
- [ ] **Fleet check:** one real site under `C:\Code\kiss` builds on this engine with `kiss-ssg check`, diffed against its last record. Carried from the 2.12.3 reflection: the repo's own builds resolve kiss from the working tree.
- [ ] `npm run gates` pass. 2.13.0, with a `### Upgrading` note naming the Node floor.
- [ ] After merge: the Dependabot PRs are closed (by Dependabot, or by hand with the reason), and the security alerts are 0 open.

**Non-goals / out of scope:** Any code change beyond what a bump forces, and other Node 22 → 24 work.

**Impact surface:** public API. `engines.node` is part of the API, so this is a minor (CLAUDE.md § Git workflow).

**Expected shape:** planned. The two majors (chokidar, htmlparser2) are the unknowns.

**Delegation convention:** none: one session.

### Amendments

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
