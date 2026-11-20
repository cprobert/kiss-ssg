---
branch: docs/anthropic-skills-npx
base: main
status: closed
opened: 2026-11-18
scope: README.md, src/models/home.json, src/pages/index.hbs, test/unit/home-quickstart.test.js, test/unit/skill-coverage.test.js, AIKB/upstream.md, AIKB/testing.md, CHANGELOG.md, package.json, package-lock.json, plugins/*/.claude-plugin/plugin.json, plugins/*/.codex-plugin/plugin.json, .claude-plugin/marketplace.json, .agents/plugins/marketplace.json, planning/sessions/2026-11-18-anthropic-skills-npx.md
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

- **2026-11-19 (close):** scope widened to `AIKB/testing.md`, which the docs sweep updated to name what `home-quickstart.test.js` now pins. At the close the operator also asked for a README sentence on what the command writes into a site (`.agents/skills/`, `.claude/skills/`, `skills-lock.json`), and the bump was the proposed patch, 2.18.2.

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-11-20: Anthropic's optional skills through `npx skills`

**What we shipped:** 2.18.2. The README and all three docs-home agent boxes install `frontend-design` and `webapp-testing` with one `npx skills add anthropics/skills@<skill>` line each, in place of the `example-skills` plugin and its ten other skills (`037948e`). A test pins every box to the README and bans the plugin's install lines from every surface a site reads (red-first: failed at `326af20`). `AIKB/upstream.md` records the `skills` CLI as observed. The changelog's upgrade note gives the swap (`4f442a6`), and the CLI's wording was corrected twice from measurement (`00e7efb`, `b888e12`, `c46a740`).

**Supervision:** emergent at the open, planned from there. The operator opened "Skills" with no brief, then turned it into a question ("sites recommend `npx skills add …`, why don't we?") and decided from the answer. That reframing was the session's best piece of problem framing. Where it would change the work, the operator chose quickly: all three boxes, not just Claude Code's; the patch; both open items, done here. **The checkpoint the operator intended to hold was delegated back.** They chose "I'll look now" and to run the CLI in a terminal, then said "Do it for me". So there was **no human eyeball** on this branch, and no pulse ran. What stood in for both was Claude's Playwright shots of the three boxes with the optional block open, served over HTTP from `docs/`, a stripped-environment run of the CLI, and a fresh Sonnet agent's fact-check of the changelog. All three found something:

- **The stripped-environment run** showed that the shipped sentence "detects the ones you have and lets you choose" was wrong. It asks for agents (79 offered), then a scope.
- **The fact-check** narrowed the CLI claim to "in a terminal". It also prompted a count of the `example-skills` plugin (12 skills), which settled the "ten other" figure.

**Claude's miss:** the first report called the terminal run "the one thing I couldn't see", and the advisor accepted that. It wasn't true. `env -i` removes the variables the CLI uses to detect Claude Code, and showed the prompts in one command. The wrong sentence survived two commits because nobody checked whether the run was really impossible.

Level: **assisted operator**. The framing and decisions were the operator's; the verification was Claude's, at the operator's request.

**Feedback for next time:**

- **Claude — before saying "I can't observe this", try the cheapest way to observe it.** A CLI that behaves differently under an agent can usually be run as a person would by stripping the agent's environment (`env -i PATH=… HOME=…`) with stdin from `/dev/null`, so a prompt shows and exits instead of hanging. Here that was one command, and it disproved a sentence already committed.
- **Claude — offer `/branch-pulse` before the close, not only in a report.** The first slice landed and the pulse was offered once, at the end of a long report, and never ran. The close then did a pulse's work in one batch.
- **Operator — "do it for me" on an eyeball is fine; say who should look.** Claude looking at its own page is not an independent read. When you can't look, name the reader you want instead (the advisor, a fresh agent), as on 2026-11-16.
- **Process — the fresh-agent changelog check (from 2026-11-16's Feedback) ran here and earned its place.** It found one over-claim the gates and Claude's review had passed. `/branch-close` Step 4a could name it as a step.

**Did we achieve the objective?** Met.

- [x] README and home page give the two `npx skills add` lines, with no `example-skills` lines or "ten/eleven other" sentences: `home-quickstart.test.js`, and grep of `docs/index.html` (3 boxes × 2 lines, 0 `example-skills`).
- [x] All three boxes offer the two skills and Lighthouse, pinned to the README block: the same test; Playwright text of each box.
- [x] The ban test was seen to fail on the base: `node scripts/red-first.mjs test/unit/home-quickstart.test.js`, failed at main (`326af20`), 2026-11-18.
- [x] Both documented lines run in a scratch site exited 0, each installing one skill of 20 found: `.agents/skills/` and `.claude/skills/` held `frontend-design` and `webapp-testing`, and `skills-lock.json` held 2 sources (2026-11-18).
- [x] `AIKB/upstream.md` records the CLI: version, where it writes, the junction, the lockfile, the prompts, `SKILLS_PROMPT_REQUIRES_TTY`, and a re-check.
- [x] `node docs` builds (exit 0) and the home page was looked at, **by Claude**, not the operator (Playwright shots of the three boxes, 2026-11-20).
- [x] `npm run gates` passes (all six, after `c46a740`).

Open: none. Sites that already use the plugin swap with the changelog's three lines, at their own pace.
