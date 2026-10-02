# Contract — 2026-10-02: Homepage showcase, "with AI" hero, Codex beside Claude Code

Branch `feat/homepage-codex`. Session log: `planning/sessions/2026-10-02-homepage-codex.md`.
This is the one document both workstreams build against. When the design moves it is amended
**in place**, with a dated section at the bottom. It is never forked.

## 1. What Codex can actually use (measured 2026-10-02, Codex CLI 0.157.1, Windows)

Every row below was run here, against a throwaway `CODEX_HOME` so the operator's
`~/.codex/config.toml` was never touched. The skill-visibility rows were checked by asking
`codex exec -s read-only` to list the skills whose names start with `kiss-`, in an empty folder.

| Route                                                                         | Result                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex plugin marketplace add cprobert/kiss-ssg`                              | **Works**, straight from GitHub. Codex reads kiss's existing `.claude-plugin/marketplace.json` unchanged and lists both plugins                                                                                                                                                                                           |
| `codex plugin add kiss-ssg@kiss-ssg`, `codex plugin add kiss-memory@kiss-ssg` | **Works** (tried against a local marketplace). A session then lists all 11 skills, with descriptions. Installed **per user**: `codex plugin` has no `--scope project`, and it writes `[plugins."…"] enabled = true` into `$CODEX_HOME/config.toml`                                                                        |
| Marketplace and plugin declared in a project's `.codex/config.toml`           | **Not shown to work.** A clean home saw no kiss skills. A second try, with the folder marked trusted in the home config, also saw none, but the trust entry's path form may have been wrong (a forward-slash path; the backslash retry failed in the shell before it ran). Recorded as unproven, not impossible. Not used |
| A skill folder copied into the project's `.agents/skills/`                    | **Works**, project-scoped, with no install step. Not chosen (operator, 2026-10-02): it means shipping the skills in the npm tarball and copying 11 folders that go stale on upgrade, because `init` never overwrites                                                                                                      |
| `AGENTS.md`                                                                   | Codex's instructions file. `init` already writes one                                                                                                                                                                                                                                                                      |

The skills barely mention Claude (grep, 2026-10-02): `CLAUDE.md` in `kiss-site-new`, `kiss-site-migrate`
and `kiss-site-import`; `AskUserQuestion` in `kiss-branch-open`; "Claude Code" in two places. Codex
listed and described them correctly. They are **not** edited on this branch (non-goal).

**Decision (operator, 2026-10-02): the Codex route is the plugin.** One marketplace and one set of
skills serve both agents. `init` prints the Codex commands next to the Claude ones, and the homepage
shows them in a box of their own.

**How to re-check** (goes into `AIKB/upstream.md`): with `CODEX_HOME` pointed at an empty folder,
holding only a copy of `auth.json`, run the three `codex plugin` commands from §3, then
`codex exec --skip-git-repo-check -s read-only "list skills whose names start with kiss-"` in an
empty folder. If `codex plugin add --help` grows a project scope, or a project's
`.codex/config.toml` starts loading plugins, revisit the decision. Delete the copied `auth.json`
afterwards.

## 2. Workstreams

### W1 — Homepage (docs site)

**May touch:** `src/pages/index.hbs`, `src/models/home.json`, `src/assets/css/**`,
`src/partials/**` (new icons, e.g. `icons/codex`), `src/layouts/layout.hbs` only for
`<title>`/meta, `test/unit/home-quickstart.test.js`, `src/assets/img/sites/**` (images the main
session supplies).

**Must not touch:** `lib/`, `bin/`, `README.md`, `llms.txt`, `GUIDE.md`, `docs/` (build output), and
the screenshots themselves (the main session captures them, §4).

**Delivers:**

1. **Hero H1:** `Build a professional website with AI <span class="hero__title-more">— or upgrade the one you made in Claude or ChatGPT</span>`.
   Rewrite the comment above it so it explains the new search phrase ("professional website with AI"
   first, the upgrade path second). Review the page's `<title>`/meta description and use the same
   phrase where it currently says Claude Code.
2. **Toolkit:** the heading no longer names one agent ("What you need to build a website with AI").
   The `Claude Code` row becomes one coding-agent row: name "Claude Code or Codex", `Required`,
   `what` naming both and that each needs its own account, linking both (the `options` list is how
   the row already carries several links). Use an icon that stays honest: a neutral agent icon, or
   both brand icons, but not one agent's logo standing for both.
3. **Set-up step 1, two boxes:** the step's single `code` becomes two labelled boxes, **Claude Code**
   and **Codex**, side by side on desktop and stacked below ~720px. The data shape in `home.json` is
   W1's choice, but each box's commands must be exactly the lines from §3 (that is the seam test).
   Text under each box: Claude's says the plugins install for this folder; Codex's says they install
   for the user, once, and are then available in every folder.
4. **Set-up step 2 (prompts):** keep the two prompts, and make the intro text name both agents
   ("In Claude Code or Codex, paste one of these"). The prompts already name the skills, which load
   in both (§1).
5. **The band note** that says "Using another agent than Claude Code? Point it at … llms.txt" is
   reworded: Codex is no longer "another agent". Agents other than these two still get the
   `llms.txt` pointer.
6. **Showcase:** "Websites built with kiss-ssg" becomes a responsive grid of cards. Each card has the
   thumbnail (`<img>` with `width`/`height` attributes, `loading="lazy"`, `alt` describing what the
   screenshot shows, not just the name), the site name as the link (opens in a new tab, keeping the
   existing visually-hidden note), and a `description` of one or two sentences. Each `sites` entry in
   `home.json` gains `image`, `alt` and `description`. Descriptions are drafted by the main session
   and approved by the operator (§4), and W1 uses placeholders until then. The design needs to look
   good in **both themes** (the site has a light/dark toggle): image border, radius and shadow come
   from the existing tokens.
7. **`test/unit/home-quickstart.test.js`** is updated: tool names (`'Claude Code or Codex'`); the
   Claude box equals the README's Claude block; and (new) the Codex box equals the README's Codex
   block (§3 seam). It also checks that every `sites` entry has `image`, `alt` and `description`,
   that the image file exists, and that the `<img>` has its dimensions.

### W2 — `kiss-ssg init` sets Codex up (public API)

**May touch:** `lib/init.js`, `bin/kiss-ssg.js` (only if needed), `test/unit/init.test.js`,
`test/integration/init.test.js`, `AIKB/init.md`, `AIKB/upstream.md`, `llms.txt`, `README.md`,
`GUIDE.md` (wherever it describes `init` or agents), `plugins/*/README.md`,
`.claude-plugin/marketplace.json` `description` (it says "Claude Code skills"),
`test/unit/skill-coverage.test.js` (the `CONTRADICTIONS` table), `types/` via `npm run types` if a
public signature changes.

**Must not touch:** `src/`, `docs/`, `plugins/*/skills/**`, `package.json` `version`/CHANGELOG (the
version bump happens at `/branch-close`).

**Delivers:**

1. **`nextSteps()`** prints the Claude block (unchanged) and a Codex block, with the same plugins
   and the user-scope caveat, followed by `codex` (§3). Add exported constants for the Codex lines
   (e.g. `CODEX_STEPS`), so the seam test and the homepage compare against one source.
2. **`AGENTS_MD`** (what `init` writes to `AGENTS.md`) names the kiss skills and how to install
   them for Codex, keeping the existing `llms.txt` and `check` instructions. `init` still never
   overwrites: an existing `AGENTS.md` follows `planPointer`'s current append rule.
3. **`INIT_HELP`** says the Codex plugins install per user, and that `init` prints the commands.
4. **Tests seen red first**, against the unchanged code: a unit test that `nextSteps()` contains each
   Codex line and the per-user caveat, and that `AGENTS_MD` names the install. The integration test
   covers the wrapper's printed output. Record the red runs in the session log.
5. **Docs:**
   - `README.md` line 74 ("the plugins are Claude Code's") is now **wrong**, not just incomplete.
     Rewrite the Quick start so it has a Claude block and a Codex block (the README's Codex block is
     `sh`-fenced and is what the seam test reads), and **ban the old sentence** in
     `skill-coverage.test.js`'s `CONTRADICTIONS`, in every file that ships (CLAUDE.md rule: a mention
     test does not catch the stale half).
   - `llms.txt`, `GUIDE.md`, `plugins/*/README.md` and the marketplace `description` say the skills
     serve Claude Code and Codex.
   - `AIKB/init.md` describes the new output.
   - `AIKB/upstream.md` gets the §1 table in short form, with the version observed and the re-check
     recipe.
6. **Upgrade note** text, drafted for `CHANGELOG.md` and for the `kiss-site-migrate` skill's
   upgrade notes, handed to the main session rather than written into either file (both are outside
   W2's scope; the bump happens at `/branch-close`).

## 3. The seam: one set of Codex commands, in four places

```sh
codex plugin marketplace add cprobert/kiss-ssg
codex plugin add kiss-ssg@kiss-ssg
codex plugin add kiss-memory@kiss-ssg
codex
```

These lines appear in `lib/init.js` (`nextSteps()`, from an exported constant), the README's Codex
`sh` block, and `home.json`'s Codex box. The site is set up first with
`mkdir my-site && cd my-site` and `npx kiss-ssg@latest init`, the same as in the Claude box: the
README and homepage boxes both start with those two lines. Exactly how the shared lines are
presented (repeated in each box, or above both) is W1's and W2's to agree **through this document**:

- **Agreed shape (main session, 2026-10-02):** each box is complete on its own, so it can be copied
  in one go: `mkdir my-site && cd my-site`, `npx kiss-ssg@latest init`, then that agent's lines.
  The README carries two `sh` blocks under `## Quick start`, Claude first, each introduced by a
  `**Claude Code**` / `**Codex**` label line.
- `test/unit/home-quickstart.test.js` asserts: the README Claude block equals home's Claude box;
  the README Codex block equals home's Codex box; and the agent-specific lines of each equal
  `nextSteps()`'s (W2's constants). W1 owns the file. W2 exports the constants it imports. The main
  session integrates the two, because the test touches both workstreams' outputs.

## 4. Owned by the main session

- **Screenshots.** Capture each of the five sites (`home.json` → `sites`) once, at a 1280×800
  viewport, with headless Chrome (`chrome.exe --headless --screenshot`, installed here), and crop
  above the fold. Commit them under `src/assets/img/sites/<slug>.<ext>`, at most ~60 KB each, with
  the dimensions recorded for W1. If no converter is on hand without adding a dependency, PNG is
  acceptable. Adding `sharp` or similar to the package is out of scope.
- **Descriptions:** drafted from each live site and approved by the operator before W1 replaces the
  placeholders.
- **Integration** of the seam test, the version bump and the changelog at `/branch-close`.
- **Clean rooms** (session criterion): a sub-agent following only the packed tarball plus the
  homepage's **Codex** box, and the real Codex CLI where it can run against a throwaway
  `CODEX_HOME`. The Claude box is repeated the same way.
- **Independent review** of W2's `lib/init.js` diff by Codex, at the slice that lands it.

## 5. Order

1. This contract → one fresh-context adversarial critique → amend in place.
2. W1 and W2 run in parallel (their files do not overlap). Screenshots and descriptions run
   alongside.
3. Integrate the seam test → `node docs` → **operator eyeball** at `node docs --dev` (port checked
   first, and the answer read before starting) → pulse.
4. Clean rooms → Codex review of `lib/init.js` → `/branch-close` when the operator asks.

## Amendments

### 2026-10-02 — after the adversarial critique (14 findings; 1, 5 and 11 re-checked against the code)

These amendments **override** the sections above wherever the two disagree.

- **§1 overreach (finding 7).** The plugin installs were measured against a _local_ marketplace.
  From GitHub, only `marketplace add` and the listing were measured. "A session lists all 11
  skills" shows the skills are listed, not that they are invoked. The clean room is the evidence for
  installing from GitHub and for invoking a skill (W1.4's "which load in both" is read as "which are
  listed in both, invocation to be shown by the clean room").
- **W1 scope (findings 1, 10, 13).** W1 may touch `docs.js`, the home `.page()` entry only
  (`fullTitle`, `description` and the comment above them), instead of `layout.hbs`. W1 also rewrites
  `home.json`'s `setup.intro` ("With Node.js and Claude Code installed") and the step text "The last
  line opens Claude Code.". The skill-coverage `CONTRADICTIONS` scan does not reach `src/`, so on the
  docs site the stale Claude-only sentences are caught by W1's own test or by nobody: W1 adds an
  assertion that `home.json` and `index.hbs` no longer contain "another agent than Claude Code".
  Breakpoints use the stylesheet's rem convention (`@media (max-width: 60rem)` or similar), not px.
  W1 **may change the showcase section's layout**: it does not have to stay in `band--split
band__grid`'s narrow column, and a full-width card grid under the heading is expected.
- **Images (findings 11, 12).** Done by the main session: `src/assets/img/sites/{learna,diploma-msc,
a1k9-training,k9-solutions,pro-plumbing}.webp`, each **768×480**, 20–35 KB, captured over the
  DevTools protocol with the cookie dialog removed (scratchpad script, nothing added to the repo). In
  `home.json`, `image` is the asset key (`img/sites/learna.webp`), and the template uses
  `{{absUrl (asset image)}}`, never a hand-written `src` (the `/kiss-ssg/` base and `asset`'s throw
  on an unknown key both depend on it). `<img width="768" height="480">`, with CSS scaling it to the
  card. The image is **not** inside the link: descriptive `alt`, then the name as the only link.
  Styling: border `var(--rule)`, radius `var(--radius-panel)`, no shadow (the site has no shadow
  token). If W1 wants one, it defines a token for both themes. The audit checks only that `alt` is
  present, so W1's test is the only guard on the dimensions.
- **The seam (findings 2, 3, 8, 9).** The names are fixed now: W2 exports
  `CLAUDE_STEPS: string[]` (the three `claude plugin … --scope project` lines) and
  `CODEX_STEPS: string[]` (the three `codex plugin …` lines). The constants hold **only the plugin
  lines**. `nextSteps()` prints each block followed by its own "Run \`claude\`" / "Run \`codex\`" in
  this folder" line, and `init.test.js` pins that order for both. Every box in the README and on the
  homepage is `mkdir my-site && cd my-site`, `npx kiss-ssg@latest init`, the agent's plugin lines,
  then the bare agent command (`claude` / `codex`). The places that carry the Codex lines are **four**:
  `lib/init.js`, `README.md`, `home.json`, and `llms.txt` (plus `GUIDE.md`, which is prose).
  **Test ownership:** W1 writes only the assertions on its own data (shape, images, tool names, the
  Claude box against the README's _current_ block). The main session adds, at integration: the README
  blocks found **by their `**Claude Code**` / `**Codex**` label line** rather than by position; each
  box equal to its README block; each box's plugin lines equal to `CLAUDE_STEPS` / `CODEX_STEPS`; and
  `llms.txt` containing every `CODEX_STEPS` line. Neither workstream edits the other's files to turn
  a test green.
- **W2 obligations (findings 4, 6, 9, 14).** `npm run types` is **mandatory** in the same commit
  (the new exports change `types/init.d.ts`), along with `llms.txt`. W2.5 also covers the README's
  Claude-only text around the quick start: the line "You need … Claude Code", the paragraph after the
  block ("the three `claude plugin` lines") and "Setting up by hand". In `GUIDE.md`, W2 edits inside
  the existing `### Starting a site` and **adds no headings** (a new one fails `node docs`). The
  upgrade note goes into `CHANGELOG.md` **and**
  `plugins/kiss-ssg/skills/kiss-site-migrate/SKILL.md`, written by the **main session** from W2's
  draft: the one deliberate exception to "skills are not edited".
- **Sites that already ran `init` (finding 5).** `planPointer` skips any `AGENTS.md` that already
  mentions `node_modules/kiss-ssg/llms.txt` (`lib/init.js:345`), and every site `init`'d before now
  has that line, so re-running `init` would never add the Codex section. **Operator decision (2026-10-02): append if missing.**
  `init` checks for the Codex section on its own (by a stable marker string W2 chooses, e.g. the
  `codex plugin marketplace add cprobert/kiss-ssg` line), and when an existing `AGENTS.md` lacks
  it, appends the section. It never rewrites existing text, the same as its `package.json` merge. A
  fresh `AGENTS.md` gets both parts at once. Running `init` twice still changes nothing. Tests seen red
  first: an old-style `AGENTS.md` (llms.txt pointer, no Codex) gains the section; one that already has
  it is skipped; a fresh one is written whole. The upgrade note says "re-run `npx kiss-ssg init`".
- **Descriptions (operator, 2026-10-02): approved as drafted.**
  - **Learna**: Online postgraduate education for medical and business professionals: PGDips, MScs,
    exam revision and an eMBA, across a medical school and a business school.
  - **Diploma MSc**: Online postgraduate certificates, diplomas, MScs and MBAs for healthcare
    professionals, delivered with university partners including the University of Buckingham.
  - **A1K9 Training**: Gaynor Probert's dog behaviour and training academy: weekend group courses
    at Pontarddulais, and behaviour consultations at the academy or at home.
  - **K9 Solutions**: One-to-one dog training in Merthyr Tydfil: practical coaching for puppies,
    family dogs and problem behaviour, at Cyfarthfa Park, at home or remotely.
  - **Pro Plumbing**: Greg Probert's plumbing business in Aberdare and the Cynon Valley: small jobs
    and bigger installs, booked by WhatsApp or a call-back.
