---
branch: feat/homepage-codex
base: main
status: closed
opened: 2026-10-02
consolidated: 2026-10-03
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
- **2026-10-02: findings from the independent review and the clean rooms, fixed on this branch.**
  - **Codex review (P2):** the `.codex/config.toml` merge compared exact header lines, so a valid
    header with a trailing comment, other quotes or other spacing slipped past, and `init` appended a
    duplicate table. TOML forbids that, so Codex could no longer load the file. Headers are now
    compared by meaning, and a file that defines a key another way is left untouched, with "add the
    rest by hand". 6 tests, seen red.
  - **Claude clean room:** after `npm init -y`, the starter kept `"main": "index.js"`, a file that
    does not exist. It is now pointed at `router.js`, with a note. 1 test, seen red.
  - **Claude clean room, shipped docs:**
    - `GUIDE.md` marked `'netlify'` as the redirects default in a table that also said it is unset.
    - `kiss-site-new` said "eleven runnable sites" (there are twelve).
    - `llms.txt` left example 12 out and gave a flat `node examples/<N>-name.js` run line that
      contradicts its own folder rule.
    - `kiss-site-new`'s `complete()` paragraph had a garbled sentence.

    All four are fixed, and the first two are banned in `CONTRADICTIONS`.

  - **Queued, not fixed** (recorded for the next branch):
    - under `check`, the log says "Copied assets: … to ./public" while it writes to staging;
    - example 11 hand-writes `/feed.xml` against habit 1;
    - no guidance on Sass deprecation warnings;
    - making an og:image needed a hand-written script.
  - **Codex clean room:** `init`, the GitHub install of all three lines and skill discovery were all
    shown under the real Codex CLI. The build was not: Codex's Windows sandbox reported `read-only`
    under `-s workspace-write` and rejected every command. The operator chose to run it themselves in
    `C:\Code\kiss\codex`, rather than run it unsandboxed.
  - **Corpse collector:** one real corpse, `GUIDE.md`'s description of the old exact-line TOML check,
    fixed. Its Check 6 reads `.codex/config.toml` as a config key `toml` (19 false positives), so the
    scanner is queued for the next branch.
- **2026-10-02: version stays 2.7.0, against the proposal (operator).** The impact surface is public
  API, and Claude proposed a minor, 2.8.0. 2.7.0 was never published to npm (the newest there is
  2.6.2), so the operator chose to fold this branch into the unpublished 2.7.0: no `npm version`,
  and the notes go into the 2.7.0 `CHANGELOG.md` entry ("Codex beside Claude Code", "Upgrading")
  and `kiss-site-migrate` § 0c. The plugin manifests on GitHub have said 2.7.0 since #30 merged, so
  installs taken from `main` before and after this merge report the same version with different
  contents.

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

# Session Reflection — 2026-10-02: Homepage showcase, "with AI" hero, Codex beside Claude Code

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges.
The session's quality is set by how actively the human supervised it. This reflection reads that
supervision, as CPD for both._

**What we shipped:** the docs-site homepage, and `kiss-ssg init` setting a folder up for Codex as
well as Claude Code. Eleven commits, `30948dd`…`2613c31`, folded into the unpublished 2.7.0.

- **Homepage:** the "Build a professional website with AI" hero, five site cards with screenshots,
  two set-up boxes, and the Claude Code or Codex toolkit row.
- **`init`:** `CLAUDE_STEPS` / `CODEX_STEPS`, the Codex section in `AGENTS.md`, and a
  `.codex/config.toml` merged by allow-list.
- **Tests:** a seam test holding the homepage, README, `init` and `llms.txt` to one set of
  commands.
- **Shipped docs:** five stale passages that the clean room found, fixed and banned.

## Reflect — what the session was

**The framing was good, and the shape sat between planned and emergent, as declared.** The
homepage half was planned and stayed planned: the operator's brief named the hero text, the cards
and the two boxes, and the contract's W1 delivered them in one pass.

The Codex half was always going to be emergent ("if the skills would indeed work with Codex"), so
the branch opened by measuring before writing. That served the work, but the measurement was wrong
once, in an instructive way:

- **The first verdict was wrong.** It said a project's `.codex/config.toml` was "not shown to
  work", and the trust entry in that test was malformed. The contract recorded "unproven, not
  impossible", but the docs that followed flattened it to "Codex has no project scope" in five
  files.
- **The operator caught it.** They asked one question, "Is there no project scope for Codex?",
  and that sent Claude to Codex's source (`codex-rs/core-plugins`). There it found the config-layer
  merge and the repo-marketplace discovery. Re-measured with the trust key in the form Codex writes
  itself, the opposite was true.
- **The design changed.** `init` gained `.codex/config.toml`. That is the clearest case on this
  branch of a premature conclusion that a single operator question undid, and the branch is better
  for it.

**The `.codex/config.toml` merge took three review rounds to get right.** Codex's first review
found that an exact-line header check missed `[plugins."kiss-ssg@kiss-ssg"] # off` and appended a
duplicate table, which makes the file unloadable. Its second review found the same for an inline
`plugins = {}`.

At that point Claude stopped patching shapes. It went looking for the next one itself and found
`[[plugins]]` and a quoted `"plugins"` key, both red before any fix. It then inverted the guard to
an allow-list (`2613c31`): a line mentioning `plugins` or `marketplaces` is safe only as a plain
header under it, and anything else leaves the file alone. The third review was clean.

The change of method came one round later than ideal. The 2026-10-01 log's lesson ("when a review
loop's findings stay in one family, change the method, not the fix") applied after round one, not
round two.

## Evaluate — how the human supervised the AI

**Pushback & steering was the discriminating dimension, and it was strong.** The operator's mid-branch
review was short and four-for-four:

- Reorder the sites so the two look-alike education sites are split.
- Use OpenAI's logo.
- Add GitLab and Bitbucket.
- "Is there no project scope for Codex?"

The last one overturned a claim written into README, `llms.txt`, `GUIDE.md`, `AIKB/upstream.md`
and both plugin READMEs, and turned a docs change into an engine change. That is the human catching
what the agent had settled on. It came from scepticism about a plausible-sounding limitation, not
from reading code.

**Verification & ownership was strong, and partly delegated.**

- **The operator looked at the preview mid-branch.** That review is what produced the corrections
  above.
- **The operator ran the Codex install themselves.** They pasted the terminal output, which showed
  `npx kiss-ssg@latest` resolving to **2.6.2**. That is how the branch learned 2.7.0 was never
  published, which no gate here could see.
- **Claude re-ran every relayed result locally:**
  - each workstream's red/green, against the saved prior `lib/init.js`;
  - the Claude clean room's `check` exit;
  - the critique's blockers, against `docs.js:31` and `lib/init.js:345`.

  That follows the "doc is a claim" rule rather than trusting reports.

- **The weak spot is the Codex clean room's build step.** Codex's Windows sandbox blocked it, and
  the operator took it on themselves. So the claim "a Codex user can build a site from the homepage
  box" rests on the install, `init` and skill discovery shown here, plus a build that is still
  pending.

**Harness leverage was high.**

- **Delegation and review:**
  - two parallel workstreams against a written contract;
  - a fresh-context adversarial critique of that contract, which found 2 blockers and 12 smaller
    problems before any code was written;
  - two clean rooms;
  - three non-Claude reviews.
- **Tools:**
  - headless Chrome over the DevTools protocol, for cookie-free screenshots and phone emulation,
    with no new dependency;
  - a sparse clone of Codex's source, to answer a behaviour question from code rather than from
    memory.
- **One misfire:** the first `codex review` combined `--base` with a prompt, which the CLI
  rejects, and that cost a round trip.
- **One avoidable delay:** the operator had to type "Is there no project scope?" for the source to
  be read. Claude could have read it before writing "no project scope" anywhere.

**Iteration discipline was good.** A pulse ran after the first integrated slice, the operator's
review sat in the middle of the branch, and the resume rule was followed through two re-runs of
the close.

**Where the human meant to supervise versus where they did:** the operator authorised "close, then
start the feedback" up front. That is an explicit delegation of the close, and the close still
stopped twice for operator decisions:

- **The version number.** The operator chose 2.7.0 against Claude's 2.8.0, recorded as an
  Amendment.
- **The unsandboxed Codex run.** The operator declined it and took the build test on themselves.

No checkpoint was carried past by momentum.

**Competency level: Active supervisor**, edging toward agentic engineering lead. The operator framed
the work, steered with precise, high-leverage questions, looked at the artefact and ran the real
tool on their own machine. What keeps it below lead is that the decisive verification of the Codex
build is still outstanding at the close.

## Feedback — recommendations for next session

- **Claude — read the upstream source before writing a limitation, not after being asked.** "Codex
  has no project scope" went into five files from one malformed test, while the contract itself said
  "unproven". Code that answers the question was one sparse clone away. When a claim is "X cannot do
  Y", it needs the same evidence as "X can": the source, or a test that has been shown to be able to
  pass.
- **Claude — after the first review finding in a parsing heuristic, switch to an allow-list
  before the second review.** The deny-list in `planCodexConfig` lost to an inline table and then to
  `[[plugins]]`. Any guard that protects a file format from corruption should enumerate what is
  safe, not what is dangerous. This is the 2026-10-01 lesson recurring, so this log is its second.
- **Claude — check CLI flags with `--help` before scripting a long run.** `codex exec --full-auto`
  and `codex review --base … <prompt>` both failed, after setup that had taken minutes. One `--help`
  per subcommand would have caught both.
- **Operator — run the Codex build test and paste the result.** In `C:\Code\kiss\codex`, run
  `codex`, paste the bakery prompt, then run `npx kiss-ssg check router.js`. Until then the Codex
  box is verified up to the skill loading, not up to a passing site.
- **Operator — publish 2.7.0.** npm's newest is 2.6.2, while the homepage, README and plugins
  (from GitHub `main`) all describe 2.7.0. A new user following the homepage today gets the 2.6.2
  engine with 2.7.0 skills.
- **Process — the corpse collector's Check 6 reads `.codex/config.toml` as a config key `toml`.**
  That is 19 false positives on this branch alone. It is queued with the diploma-msc handover; the
  scanner should skip `config.` when it is part of a filename.

## Verdict — did we achieve the objective?

**Brief:** make the homepage sell kiss to more people (showcase cards, a "with AI" hero, set-up
boxes for both Claude Code and Codex), backed by `init` actually setting Codex up.

**Verdict: met, with one criterion handed to the operator.** The objective moved once, and the move
was good: from "Codex installs per user" to "`init` writes a project `.codex/config.toml`".

- [x] Codex measured before anything was written about it. See contract §1 and its dated
      amendment. The first measurement was wrong about project scope and was corrected by a second
      run, plus the Codex source.
- [x] `init` sets a folder up for Codex. Every test was seen red: 11, 8, 6, 1, 2 and 2 failures
      across the rounds. `AIKB/init.md`, `AIKB/upstream.md`, `llms.txt`, `README.md`, `GUIDE.md`
      and `types/` are updated.
- [x] Showcase cards: five 768×480 WebPs, with `alt` text and dimensions tested, in the order
      the operator asked for.
- [x] Hero H1 and the page title and description.
- [x] Two boxes and the toolkit row. The seam test was seen red on a deliberate drift. The page has
      no sideways scroll at a 390px emulated viewport.
- [~] Clean room, twice.
  - **Claude Code:** passed. `check` exit 0, 8 pages, re-run by the main session. It found five
    doc defects, all fixed.
  - **Codex:** `init`, the GitHub install and skill discovery were shown. **The build is pending,
    with the operator**, because Codex's Windows sandbox blocked it here.
- [x] Operator eyeball mid-branch: looked (pulse log).
- [x] Independent review of `lib/init.js`. Three Codex rounds: two real P2s were fixed, and the
      third round was clean.
- [x] `node docs` and `npm run gates`: both exit 0 after the last commit.

**What is concretely better:**

- The front door shows real sites and serves both agents.
- `init` records the skills for both agents and cannot corrupt an existing Codex config.
- One test keeps four copies of the set-up commands in step.

**Still open:**

- The Codex build test.
- Publishing 2.7.0.
- The diploma-msc handover queue, starting with the `check-mode-broken-link-count` branch.
