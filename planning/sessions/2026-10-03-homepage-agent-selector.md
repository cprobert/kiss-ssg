---
branch: feat/homepage-agent-selector
base: main
status: closed
opened: 2026-10-03
consolidated: 2026-10-07
---

# Session — 2026-10-03: Homepage agent selector, a best-effort watcher, and a light interactivity recommendation

## Intent (captured in conversation, not through /branch-open)

The intent below was agreed with the operator over a conversation rather than by the `/branch-open` interview, so the step that reads back earlier sessions' feedback was not run for this branch.

**Objective:** replace the homepage's two side-by-side set-up boxes with one box chosen from an AI selector that defaults to Claude Code, and offers Codex and "Other agent". The branch also carries two documentation changes agreed earlier the same day: the dev watcher is best-effort, with its fringe kept in a register instead of being chased, and `kiss-site-new` recommends native HTML first, then Alpine's CSP build, for small bits of interactivity.

**Success criteria:**

- [ ] The set-up step shows a native `<select>` (Claude Code, Codex, Other agent), defaulting to Claude Code, and only the chosen agent's box. The choice is remembered across visits; when storage is blocked, it lasts for the page.
- [ ] Without JavaScript, the selector is hidden and every box shows, so nothing is lost.
- [ ] The "Other agent" box gives `mkdir` + `init`, and says how to reach the contract and that kiss's skills are not available to it. The note under the step no longer carries the Cursor/Copilot sentence that box replaces.
- [ ] `test/unit/home-quickstart.test.js` still pins the Claude Code and Codex boxes to the README and to `lib/init.js`, and covers the third box.
- [ ] The operator looks at the built homepage, light and dark, desktop and phone width.
- [ ] `node docs` builds clean and `npm run gates` is green.
- [ ] `CLAUDE.md` carries the best-effort watcher rule, and `AIKB/rebuild.md` has a Known knowns register.
- [ ] `kiss-site-new` recommends, in order: native HTML (`<details>`, `popover`, `<dialog>`), then Alpine's CSP build for stateful components, and never scattered scripts.

**Non-goals / out of scope:** changing the toolkit panel's "Claude Code or Codex" row, the README quick start, `kiss-ssg init`, or what the skills do; Alpine in the starter or the engine.

**Impact surface:** tooling & docs only: `src/` (the docs site), a skill's text, `CLAUDE.md`, `AIKB/`. Expected bump: a patch.

**Expected shape:** one session, no delegation.

### Amendments

**2026-10-03 — absorbed: a spike on shipping the core skills in the npm package.** The operator asked whether other agents use skills, then whether the npm package could act as a local plugin marketplace, so that Claude Code and Codex install the core skills from it while the memory skills stay a GitHub install. A measurement spike only, with no change to `init`, the package or the plugins. The findings are in `AIKB/upstream.md` ("The npm package as a local plugin marketplace"). The decision is the operator's, and any implementation goes on its own branch.

**2026-10-03 — absorbed after the close: a link from the README to the website.** With PR #35 open, the operator asked for a link near the top of `README.md` to send readers from the README to the docs site. One line under the intro; no other change. Gates rerun before the push; the earlier close steps were not rerun for a one-line README edit.

## Pulse log

**2026-10-03 — at the close (the branch was never pulsed).** Eyeball: looked. The operator checked the homepage's agent selector on the `node docs --dev` preview (Claude Code by default, switching boxes, remembered on reload, light and dark, phone width) and answered "Looked — fine". Asked at `/branch-close` Step 5a as the fallback, because no pulse ran.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-03: Homepage agent selector, a best-effort watcher, and a spike on shipping skills in npm

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `0e09636` (the homepage agent selector, the best-effort watcher rule with the Known knowns register in `AIKB/rebuild.md`, and the native-HTML-then-Alpine advice in `kiss-site-new`), `efb7f9c` (`docs/` rebuilt, also catching up a version stamp two releases stale), `d43b6d8` (the spike on the npm package as a local plugin marketplace, recorded in `AIKB/upstream.md` as not used), `0f6979b` (docs-sweep), `387f312` (2.7.3).

## Reflect — what the session was

**Emergent, and it served the work.** The session started as a policy request (stop chasing watch-only quirks), then moved through four separate questions, each raised by the operator in turn: a third-party tools preference, the homepage selector, whether other agents use skills, and whether the npm package could deliver the skills. None was planned at the start. The branch was opened partway through, to hold the uncommitted doc edits and the homepage work together (the operator's choice), and the spike was absorbed as a dated Amendment rather than becoming a branch of its own. The shape fitted: each question was cheap to ask and was settled before the next one began. The cost was framing. The branch was opened without `/branch-open`, so the step that reads earlier sessions' feedback never ran, and the intent was written by Claude from the conversation.

## Evaluate — how the human supervised the AI

**Learning engagement and pushback were the strongest dimensions, and the session's best outputs came from them.**

- **"Do you agree with Alpine… Am I building in a dependency for the sake of it?"** The operator questioned their own recommendation after Claude had already written it into the skill. The honest answer was that `<details>`, `popover` and `<dialog>` cover every example they had named with no script at all. The skill paragraph became an ordered list (platform first, then Alpine only for stateful components, never scattered scripts) that neither of them had at the start. This is the clearest sum-beats-the-parts moment of the session.
- **"Do other agents not use skills?"** caught a false implication Claude had shipped into the homepage's Other agent box: "there are no kiss plugins… the skill names mean nothing to it" read as "other agents cannot use skills". What was actually true is narrower: kiss delivers its skills only through two plugin systems. The wording was corrected in `d43b6d8`.
- **"Would we create a problem for Claude with two skills of the same name?"** That was the right worry, aimed at the wrong agent. The spike proved it real for **Codex** (two `kiss-ssg:kiss-build-check` skills at two versions in one folder) and showed Claude Code was safe only with a marketplace per site. The operator's instinct framed the experiment that settled the decision.

**Problem framing** was strong at each decision point. Claude asked through `AskUserQuestion` (the Other agent option, one branch or two, the skills route, the version), and the operator answered each in a click. It was weak at the branch level, as above.

**Verification & ownership** was solid but thin in one place. The new homepage tests were seen red against the old model and view before they passed, and `npm run gates` and `node docs` were read by exit code. The spike checked Claude's and Codex's behaviour from the session's own `init` line and from `codex exec`, not from documentation. The operator looked at the page at the close and said "Looked — fine". The browser extension was not connected, so Claude never saw the page render, and the selector's JavaScript (the default, switching, remembering) was checked only by that human look. No unit test runs it.

**Iteration discipline:** the branch was never pulsed. The eyeball came at `/branch-close` Step 5a as the fallback.

**Harness leverage:** good use of `AskUserQuestion` at every real fork, and isolated `CLAUDE_CONFIG_DIR` / `CODEX_HOME` for the spike, so the operator's real configs were never touched (checked: zero matches afterwards). The operator's question about theme persistence turned out to be a feature that already existed. Claude checked the source, the build and the preview before building anything, and answered without writing code. `/branch-open` was not used. A spike is also the kind of self-contained measurement a sub-agent could have run while the main session finished the homepage, though running it inline kept the operator able to watch each finding land.

**Intended vs actual supervision:** the operator meant to look at the page before the push, and did, at the close. Claude's momentum did carry past one checkpoint. It wrote the Other agent box's reason from an assumption ("no kiss plugins" = no skills) and committed it before anyone had asked whether that was true.

**Claude also broke a standing rule in this session.** `CLAUDE.md` says text that lands in a file is written with the Write or Edit tool, never a heredoc. Claude wrote `edit-home.mjs` with `cat > … <<'EOF'`. It worked and was grep-verified, but the rule exists because this exact pattern has failed silently five times. Every later script went through Write.

**Competency level: Active supervisor.** The operator kept probing the AI's recommendations, caught a false claim, and asked the question that framed the spike, and every decision was theirs. It falls short of Agentic engineering lead because of the workflow, not the judgement: the branch was opened without `/branch-open`, never pulsed, and has no independent review. That last gap was defensible here, because no `lib/` or `bin/` code changed.

## Feedback — recommendations for next session

- **Operator — when a conversation turns into a branch, run `/branch-open` even mid-stream.** This branch's intent was written by Claude from the chat, so the feedback read-back never ran and the success criteria were Claude's own reading of what you wanted.
- **Claude — state the narrow truth, not the convenient generalisation, in anything a user reads.** "Other agents have no kiss plugins" became "skill names mean nothing to it", a claim about every other agent that Claude had not checked. Before a sentence about third-party tools ships, ask whether it is measured, inferred, or assumed, and write the narrow version.
- **Claude — Write tool for every file, including throwaway scripts.** The heredoc rule applies to scratch scripts too. Check it before reaching for `cat >`.
- **Both — keep questioning recommendations, as you did with Alpine.** "Am I adding this for the sake of it?" produced a better position than either of us started with. Ask it whenever Claude recommends adding a tool.
- **Process — the homepage's selector script has no test.** Its behaviour (default, switch, remembered choice, fallback for an unknown saved value) rests on one human look. If the docs site grows more script, a small jsdom test belongs in `test/unit/`. For now, record it as accepted, in the spirit of the watcher rule this branch added.
- **Process — when the browser extension is unavailable, say so at the moment the visual check is due** and hand the operator the URL and the checklist, as happened here. Do not let the tests stand in for it.

## Verdict — did we achieve the objective?

**Met, and the objective grew in a good direction.** The selector shipped as specified, both documentation changes landed, and the absorbed spike turned an open design question into a recorded, evidence-based decision.

- [x] The set-up step shows a native `<select>` (Claude Code, Codex, Other agent) defaulting to Claude Code, with only the chosen box visible, and the choice is remembered. Evidence: the operator's look at the close; the template and the selector's markup are pinned in `test/unit/home-quickstart.test.js`.
- [x] Without JavaScript the selector is hidden and every box shows. Evidence: the `hidden` attribute is pinned by test; this path was not exercised in a browser.
- [x] The Other agent box gives `mkdir` + `init` and the route to the contract, with the accurate reason (corrected in `d43b6d8`); the Cursor/Copilot sentence is gone from the note.
- [x] `home-quickstart.test.js` still pins the Claude Code and Codex boxes to the README and `lib/init.js`, and covers the third box. Seen red before green.
- [x] The operator looked at the page, light and dark, desktop and phone width.
- [x] `node docs` builds clean (157 references, none broken; audit clean), and `npm run gates` is green.
- [x] `CLAUDE.md` carries the best-effort watcher rule; `AIKB/rebuild.md` has the Known knowns register.
- [x] `kiss-site-new` recommends native HTML, then Alpine's CSP build, then never scattered scripts.

**What is concretely better:** a newcomer on the homepage sees one set-up box for their agent instead of two to choose between, and someone using Cursor or Copilot now has a route. A future session can no longer burn a debugging loop on a watch quirk that a restart clears. A new site's agent no longer reaches for a JavaScript framework to make an accordion. And the question "can npm deliver the skills?" now has a measured answer in `AIKB/upstream.md`, with a way to re-check it.

**Still open:** shipping the core skills as plain files in the package, pointed at from `AGENTS.md`, for agents with no kiss plugin. This is allowed by the decision but not started, and belongs on its own branch.
