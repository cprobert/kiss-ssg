---
branch: feat/kiss-publish
base: main
status: open
opened: 2026-11-12
scope: planning/sessions/2026-11-12-kiss-publish.md, .claude/skills/kiss-publish/**, scripts/release-check.mjs, scripts/tag-release.mjs, test/unit/release-check.test.js, test/unit/tag-release.test.js, test/unit/skill-code-blocks.test.js, .claude/skills/branch-merged/SKILL.md, .claude/skills/branch-close/SKILL.md, CLAUDE.md, planning/history/claude-md-rules.md, package.json, package-lock.json, CHANGELOG.md, .claude-plugin/marketplace.json, plugins/*/.claude-plugin/plugin.json
---

# Session — 2026-11-12: /kiss-publish, the release as one operator command

## Intent (captured at /branch-open)

**Objective:** Wrap the release in one repo-only skill, `/kiss-publish`. The operator typing it is the release decision. The skill preflights the merged commit, pushes the tag `v<version>` itself (falling back to a printed `!` command when the push is refused), watches `publish.yml` to the staged version, waits for the operator's 2FA approval, and confirms the version is live on npm.

**Success criteria:**

- [ ] `scripts/release-check.mjs` decides the preflight in tested code: on the base branch, level with `origin/<base>`, clean tree, CI green on that commit, a `CHANGELOG.md` entry for `package.json`'s version, `v<version>` not taken locally or on origin, and the version not already on npm. It exits 0 only when all pass and names every failing check. Its unit test was seen to fail first (`node scripts/red-first.mjs`).
- [ ] `.claude/skills/kiss-publish/SKILL.md` exists, is operator-only (`disable-model-invocation: true`), and its code blocks pass `test/unit/skill-code-blocks.test.js` (commands only, no pipes, loops or `&&` chains).
- [ ] The skill says what to do when the tag push is refused: print the exact command on its own line for the operator to run with `!`, then carry on watching the run.
- [ ] `CLAUDE.md` § Git workflow, `/branch-close` and `/branch-merged` agree with the new rule: the tag is pushed only by `/kiss-publish`, which the operator invokes. No other session or ritual tags. `/branch-merged`'s release paragraph points at `/kiss-publish` and no longer carries its own copy of the tag commands.
- [ ] The preflight runs against today's `main` and reports what it finds (2.15.0 is already tagged and staged, so it should refuse, naming the taken tag).
- [ ] `npm run gates` passes; both CI legs pass on the PR.

**Non-goals / out of scope:** approving the staged version (2FA is the operator's and OIDC cannot do it); changing `publish.yml`; deleting or moving a tag (a re-tag stays a manual act); a `kiss-ssg` CLI command (this is the repository's own tooling, so it lives in `scripts/`); the skill shipping in the plugin.

**Impact surface:** tooling & docs — a repo-only skill, a `scripts/` module and the rituals' release wording; nothing a site observes.

**Expected shape:** planned — the steps were done by hand on 2026-11-11/12 for 2.15.0 and are known.

**Assumptions:**

- `scripts/tag-release.mjs` with no flag already tags `HEAD` with `v<version>` and pushes it, and skips when the tag exists locally — measured, read 2026-11-12. It checks only local tags, not origin.
- `disable-model-invocation` is already used by a repository skill (`/branch-close`) — measured, grep 2026-11-12.
- `gh run list --workflow publish.yml` and `gh run watch <id> --exit-status` report the run, and the stage job's log carries `staged with id …` — measured on run 43174286036, 2026-11-12.
- Auto mode may refuse a plain `git push origin v<version>` as it refused the re-tag (delete plus push) on 2026-11-11 — inferred; the refusal seen was for a deletion.
- npm has no command to list or approve a staged version that the skill could use under OIDC — inferred; approval happens on npmjs.com.

**Delegation convention:** none: one session.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- 2026-11-12 — At the open, the operator chose against the recommendation (the skill prints the tag and the operator runs it): typing `/kiss-publish` pushes the tag. The operator's reason: "Typing /kiss-publish is the release decision, so one step (fall back to ! if it doesn't work)." This changes the standing rule "never tag or push a tag from a session" to "only `/kiss-publish`, invoked by the operator, pushes the tag".
- 2026-11-12 — Correction to an assumption: "`disable-model-invocation` is already used by `/branch-close`" was wrong. The grep matched a sentence in its prose, not its frontmatter, so no repository skill used the key before this one. That the key exists comes from Claude Code's skill documentation as Claude recalls it: **inferred, not measured**. `/kiss-publish` also says in its body that it is operator-only, so the rule holds even if the key does nothing.
- 2026-11-12 — `planning/history/claude-md-rules.md` was not edited although it is in scope: it says it is `CLAUDE.md` "copied unedited" on 2026-11-11. The new rule's link points to this session file instead.
- 2026-11-12 — 2.15.0 was approved on npm during the branch (`npm view kiss-ssg version` → 2.15.0, `latest`), so the preflight's run on `main` failed three checks: `tag`, `npm`, and `clean`, the last for the two scripts copied into the temporary worktree.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-12** — criteria 1–5 met: `release-check`, `tag-release` and `skill-code-blocks` tests green (3 files, 41 tests); `red-first: test/unit/release-check.test.js failed at main (6d4fed1), 2026-11-12`; `red-first: test/unit/tag-release.test.js failed at main (6d4fed1), 2026-11-12` (8 of 17 fail there, the new planRelease/tagRelease cases); a grep of `CLAUDE.md` and every skill for `git tag -a` / `git push origin v` finds only `/kiss-publish`'s printed re-tag; the preflight on `main` refused (`tag`, `npm`, `clean`, per the Amendment). Criterion 6 partial: gates green at `0819d85`, CI on the PR not yet (no PR). That `disable-model-invocation` takes effect stays inferred. No drift: `scope-check.mjs` exit 0, nothing listed; 0 commits behind `origin/main`. **Eyeball: declined** (`.claude/skills/kiss-publish/SKILL.md`). Offer: the preflight's branch check accepts any integration branch (main, master, vN), not only the resolved base — operator: keep. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
