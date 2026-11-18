---
branch: docs/anthropic-skills-npx
base: main
status: open
opened: 2026-11-18
scope: README.md, src/models/home.json, src/pages/index.hbs, test/unit/home-quickstart.test.js, test/unit/skill-coverage.test.js, AIKB/upstream.md, CHANGELOG.md, package.json, package-lock.json, plugins/*/.claude-plugin/plugin.json, plugins/*/.codex-plugin/plugin.json, .claude-plugin/marketplace.json, .agents/plugins/marketplace.json, planning/sessions/2026-11-18-anthropic-skills-npx.md
---

# Session — 2026-11-18: Anthropic's optional skills through `npx skills`, one at a time

## Intent (captured at /branch-open)

**Objective:** Recommend Anthropic's optional `frontend-design` and `webapp-testing` skills with `npx skills add anthropics/skills@<skill>`, one skill each, instead of the `example-skills` plugin, which installs ten other example skills with them; and offer them in every agent box on the docs home page, since the CLI is not Claude-only.

**Success criteria:**

- [ ] `README.md`'s optional block and `src/models/home.json` give `npx skills add anthropics/skills@frontend-design` and `npx skills add anthropics/skills@webapp-testing`, and no longer the `claude plugin marketplace add anthropics/skills` / `example-skills@anthropic-agent-skills` lines, nor the "ten / eleven other example skills" sentences.
- [ ] The home page's Claude Code, Codex and Other agent boxes all offer the two skills (and Lighthouse); `test/unit/home-quickstart.test.js` pins that, and the README block and the home page's code stay identical.
- [ ] A test bans the old install lines where an agent or a person would read them (README, the home page model, the shipped skills), seen to fail against the base (`node scripts/red-first.mjs`).
- [ ] The two exact lines the docs give are run in a scratch site and install exactly one skill each (exit code and the files written recorded in the pulse log).
- [ ] `AIKB/upstream.md` records the `skills` CLI as observed: version, where it writes, the Windows junction, the lockfile, and how to re-check.
- [ ] `node docs` builds, and the built home page shows the new lines in all three boxes (looked at).
- [ ] `npm run gates` passes.

**Non-goals / out of scope:** kiss's own plugins (`kiss-ssg`, `kiss-memory`) stay on the plugin marketplaces, for their version lock with the engine. No `init` change: `init` declares neither Anthropic skill. No engine change. Historical `CHANGELOG.md` entries and the observation dated 2026-10-13 in `AIKB/upstream.md` stay as written.

**Impact surface:** tooling & docs — README (ships) and the docs site; no `lib/` or `bin/` change. Patch bump.

**Expected shape:** planned — the files are known from one grep, and the CLI was probed before the open.

**Assumptions:**

- `skills` on npm is Vercel's `vercel-labs/skills`, version 1.9.0 — measured (`npm view skills`, 2026-11-18).
- `npx skills add anthropics/skills@webapp-testing -a claude-code -a codex -y` found 20 skills, installed one, wrote `.agents/skills/webapp-testing/`, a `.claude/skills/webapp-testing` link and `skills-lock.json`, exit 0 — measured in a scratch git repo, 2026-11-18.
- On Windows that link is a junction with an absolute target; `git add` follows it and stages plain files, so committing it is safe on Windows; `--copy` writes plain folders — measured, same scratch repo.
- Without `-a` and `-y`, a person in a terminal is asked which agents and which scope — inferred from `skills --help` ("default: last selected, else detected"); the probe ran inside Claude Code, which the CLI detected and installed non-interactively.
- The CLI supports agents beyond Claude Code and Codex, which is what the Other agent box relies on — inferred, not checked per agent.
- No shipped skill gives the old install lines: they point at README § "Optional: Anthropic's `frontend-design` skill for the look" — measured (grep for `example-skills|anthropic-agent-skills|anthropics/skills`, 2026-11-18); that heading stays.

**Delegation convention:** none: one session.

### Amendments

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
