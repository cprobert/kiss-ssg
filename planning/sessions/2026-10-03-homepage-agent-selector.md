---
branch: feat/homepage-agent-selector
base: main
status: open
opened: 2026-10-03
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

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
