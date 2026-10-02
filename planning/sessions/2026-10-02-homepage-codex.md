---
branch: feat/homepage-codex
base: main
status: open
opened: 2026-10-02
---

# Session — 2026-10-02: Homepage showcase, "with AI" hero, and Codex beside Claude Code

## Intent (captured at /branch-open)

**Objective:** Make the docs-site homepage sell kiss to more people: show the sites built with it as thumbnails with a short description each, lead with "Build a professional website with AI", and give Codex users set-up instructions equal to Claude Code's, backed by `kiss-ssg init` actually setting Codex up.

**Success criteria:**

- [ ] **Codex is measured before anything is written about it.** With Codex CLI (0.157.1 installed here), record what a Codex session in a fresh folder can actually use: `AGENTS.md`, `llms.txt`, and whether kiss's skills load (through `codex plugin`, a skills folder, or not at all). Findings, with the commands run, go in the contract before either workstream builds against them.
- [ ] **`kiss-ssg init` sets a folder up for Codex as well as Claude Code**, by whatever mechanism the measurement shows works. The `lib/init.js` change has a unit test that was seen red first, `test/integration/init.test.js` covers the wrapper, `AIKB/init.md`, `llms.txt`, `README.md` and `GUIDE.md` are updated, and the Codex mechanism goes in `AIKB/upstream.md` with a way to re-check it.
- [ ] **The "Websites built with kiss-ssg" section shows each of the five sites as a card**: a committed, optimised screenshot thumbnail (under `src/assets/img/sites/`), the name as the link, and a one- or two-sentence description. Claude drafts the descriptions and the operator approves them. Images have meaningful `alt` text and explicit dimensions, so there is no layout shift.
- [ ] **The hero H1 reads "Build a professional website with AI — or upgrade the one you made in Claude or ChatGPT"**, the template comment explaining the search intent is updated to match, and the page `<title>`/description are reviewed for the same phrase.
- [ ] **The set-up step is two side-by-side boxes, Claude Code and Codex**, each with commands that work, stacking on narrow screens. The toolkit panel names "Claude Code or Codex" as the required coding agent, and its heading no longer says Claude Code only. The Codex prompts name the same skills, if the skills load in Codex.
- [ ] **Clean room, twice:** a fresh agent with only the packed tarball and the homepage's Codex instructions, starting in an empty folder, gets to a site that passes `kiss-ssg check`. The real Codex CLI is run where it can be, otherwise a sub-agent follows the Codex box. The Claude Code box is repeated the same way, to show it did not regress. Every place the agent had to guess is reported.
- [ ] **The operator looks at the built homepage partway through, not only at the close**: light and dark, desktop and phone width, at `node docs --dev` (port checked first, and the answer read before anything starts).
- [ ] **An independent (non-Claude) review of the `lib/init.js` change** runs at the slice that lands it, not just at the close.
- [ ] `node docs` builds clean, and `npm run gates` is green.

**Non-goals / out of scope:** supporting agents other than Claude Code and Codex (Cursor, Copilot, etc.: the existing `llms.txt` pointer stays as the general answer); a scripted screenshot tool (thumbnails are captured once and committed); redesigning the homepage outside the hero heading, the set-up step, the toolkit agent row and the showcase; adding or removing showcase sites; changing what kiss's skills do.

**Impact surface:** public API: `kiss-ssg init` (a published CLI command) gains Codex set-up, which a consuming project can see. The rest (`src/` homepage, models, assets) is tooling & docs. Expected bump: a minor, with an upgrade note.

**Expected shape:** between. The homepage work is planned; the Codex mechanism comes out of the measurement, and it decides the shape of the `init` change.

**Delegation convention:** the main session briefs, reviews and integrates; sub-agents implement inside the scope the contract gives them (one homepage workstream, one `init`/Codex workstream), and also run the clean rooms. **Agents never commit**: the operator's diff review is the checkpoint. The independent review of `lib/init.js` goes to Codex.

**Contract:** `planning/plans/2026-10-02-homepage-codex.md`. Written after the Codex measurement and before either workstream starts, then critiqued by one fresh-context agent before anything is built against it. When the design moves, it is amended in place with dated sections.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-02: Codex measured, and the mechanism chosen.** The kiss marketplace and both plugins
  load in Codex as they are (`codex plugin`, user scope). A project's `.codex/config.toml` did not
  load them, and `.agents/skills/` does (project scope). Operator chose the plugin route; the
  findings are in the contract §1.
- **2026-10-02: `init` appends the Codex section to an existing `AGENTS.md`** that lacks it
  (operator, after the contract critique's finding 5). Until now `planPointer` skipped any
  `AGENTS.md` that already pointed at `llms.txt`. This is a behaviour change, on top of printing new
  lines, and it goes in the upgrade note.
- **2026-10-02: operator review of the first slice.**
  - The showcase order is now Diploma MSc, A1K9, Pro Plumbing, K9 Solutions, Learna, so the two
    look-alike education sites are split and the plumber sits between the dog sites.
  - The Codex link uses OpenAI's mark (Simple Icons 15.22.0). It was removed in 16.0.0 pending
    OpenAI's permission; the operator chose to use it anyway.
  - GitLab and Bitbucket sit beside GitHub in the Git row.
  - "Codex has no project scope" was wrong: a trusted project's `.codex/config.toml` enables
    plugins (re-measured; see the contract amendment). `init` now also writes that file.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-02** — Criteria 1–5 and 9 met:
  - Codex measured twice (contract §1 and its amendment), GitHub end to end lists all 11 skills.
  - The init tests were seen red and re-run by the main session (11→0, then 8→0).
  - The seam test went red on a deliberate README drift.
  - Gates exit 0, `node docs` exit 0.
  - No page overflow at a 390px emulated viewport.

  Criterion 6 (clean rooms) not yet: the operator's own terminal run confirms the Codex install from
  GitHub, but no agent has built a site from the packed tarball. Criterion 8 (non-Claude review of
  `lib/init.js`) not yet.

  Drift: the GitLab/Bitbucket chips and the `.codex/config.toml` writer, both recorded as Amendments.
  Surface unchanged (public API, minor).

  **Eyeball: looked.** The operator reviewed the preview and asked for: Diploma MSc first and Learna
  last, Pro Plumbing between the dog sites, OpenAI's logo, GitLab and Bitbucket, and the Codex
  project-scope question (which overturned "no project scope"). All are done and re-screenshotted.

  Release gap found: npm's newest is 2.6.2 (2.7.0 was never published), while the plugins from
  GitHub `main` are 2.7.0.

  Decision: adjust (run the clean rooms and the Codex review), then `/branch-close` as the operator
  authorised.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
