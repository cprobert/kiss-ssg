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

- **2026-09-26 — corpse-collector scanner taught the new surfaces.** Adjacent drift, absorbed here: the README became the consuming site's quick start, so the scanner reported that site's `.claude/settings.json` and `npm run build/dev/check` as this repo's corpses (11 rows), and it did not read `GUIDE.md` at all. `isConsumerSitePath` now excuses `.claude/settings.json` from the published surfaces (test seen red), Check 5 skips `README.md` as it skips `llms.txt`, and `GUIDE.md` joins the doc and API targets.

- **2026-09-26 — version: patch (2.6.1), not the minor the Impact surface implies.** Operator's decision at `/branch-close` Step 4a, asked with both options labelled; the skill's table puts a new command and new tarball files under minor. Recorded so the choice can be revisited if a site on `~2.6.0` picks up `init` or `GUIDE.md` unexpectedly.

## Pulse log

<!-- Slices: (1) plugin probe, (2) init + starter + tests, (3) docs move. Pulse at each boundary. -->

- **2026-09-26 — slices 1–2 (probe, init).** Probe (operator, clean `CLAUDE_CONFIG_DIR`, a folder `init` set up): after trusting the folder Claude Code did **not** offer the declared marketplace/plugins → criterion 1 met, negative; Quick start carries the three `--scope project` commands before `claude`. Criterion 2 met (measured): packed tarball on Windows, `npm i <tgz> && npx kiss-ssg init && npm run check` exit 0; `npx --package <tgz> kiss-ssg init` in an empty folder installed kiss-ssg@2.6.0 via npm.cmd and `npm run build` wrote the starter page (read it). Criterion 3 met: integration test hashes an initialised folder across a second run; four merge guards and the pack-gate row seen red by mutation. Drift: none in scope; three plan deviations ledgered (gates tests derive from `REQUIRED_PACKED`; next steps install before `claude`; `nextSteps` probe parameter removed). Impact surface unchanged (public API, minor). **Continue** to slice 3.

- **2026-09-26 — slice 3 + evidence.** Criteria 4–5 met: README first screen is the Quick start (read), GUIDE.md ships (tarball listing), corpse-collector clean after the scanner learned the new surfaces (Amendment). Criterion 6 met: clean-room agent, README only, empty folder → 7-page bakery site, `check` exit 0 first time, grew the starter; its gaps (no `main`/`aikb` script vs llms.txt's contract; no explanation why declared plugins still need installing; host/address guessed) fixed in 57e9d22. Criterion 7 met: Codex reviewed `init` — 14 findings, 5 reproduced as real breaks of the never-overwrite promise and fixed test-first; one (folder `npm.cmd` hijack) re-derived and **not** reproduced, so not guarded; five deferred as minors. Criterion 8: gates 5/5 green. Out of scope, for the operator: the clean-room agent also found the `kiss-site-new` skill says "Four habits" over seven bullets and `try`/`catch` where every example uses `.catch()`, and examples 1/11 contradict llms.txt in places. **Ready to close** after the final review.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
