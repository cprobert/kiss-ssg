---
branch: feat/agent-first-onboarding
base: main
status: open
opened: 2026-09-26
---

# Session — 2026-09-26: Agent-first onboarding

## Intent (captured at /branch-open)

**Objective:** Make kiss-ssg agent-first for a new user — an empty folder to a built site in three shell lines and one pasted prompt — by adding `npx kiss-ssg init` (agent wiring at project scope plus a starter site) and splitting the README into an agent quick start with the library reference moved to a shipped `GUIDE.md`. Design: `planning/specs/2026-09-26-agent-first-onboarding-design.md`.

**Success criteria:**

- [ ] Probe recorded (either outcome): does first `claude` launch in a folder whose `.claude/settings.json` declares `extraKnownMarketplaces.kiss-ssg` + `enabledPlugins` offer the plugins? The README's Quick start matches the result.
- [ ] From an empty temp folder, the **packed tarball's** `init` followed by `npm run check` exits 0.
- [ ] A second `init` run changes no file (hash-compared), and `init` over an existing site never overwrites a file — merge-safety tests each seen red first.
- [ ] README's first screen is the Quick start and copyable prompts; every plugin install shown uses `--scope project`; `GUIDE.md` carries the reference and ships in the tarball.
- [ ] No `README.md#` anchor anywhere in the repo points at a heading that moved (`/corpse-collector` clean).
- [ ] Clean-room: a fresh agent given only the new README, in an empty folder, reaches a site that passes `kiss-ssg check` (inherited feedback 09-06, 09-10, 09-16).
- [ ] `lib/init.js` reviewed by something other than this session (Codex), or the close says plainly that it was not (inherited feedback 09-06, 09-16, 09-21).
- [ ] `npm run gates` green; `llms.txt`, `CLAUDE.md`, `AIKB/init.md`, `kiss-site-new` skill + skill-coverage row, CHANGELOG 2.7.0 all updated.

**Non-goals / out of scope:** No engine pipeline/config/helper change. No starter variants. `init` never shells out to `claude`. The reference content moves but is not rewritten. The docs site (`src/`) is not restructured beyond link fixes.

**Impact surface:** public API — a new CLI command (`kiss-ssg init`) and a new shipped `starter/` + `GUIDE.md` in the `files` whitelist; minor bump to 2.7.0.

**Expected shape:** planned — the spec fixes the destination; the one open fork (the settings-declared plugin probe) is resolved as the first step with a pre-agreed fallback.

**Delegation convention:** one session implements everything. Sub-agents only for (a) the clean-room run, which follows the README literally in a temp folder, and (b) an optional Codex review of `lib/init.js`. Agents never commit.

### Amendments

## Pulse log

<!-- Slices: (1) plugin probe, (2) init + starter + tests, (3) docs move. Pulse at each boundary. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
