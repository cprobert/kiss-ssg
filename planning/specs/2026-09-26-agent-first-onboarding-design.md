# kiss-ssg: agent-first onboarding (design)

Status: APPROVED in conversation 2026-09-26; awaiting written-spec review.

## Objective

kiss-ssg is meant to be used through a coding agent first and by hand second. The README does not say so: it opens on requirements and types, reaches agent setup in its fourth section, and then runs to 1,100 lines of library reference. A new user should get from an empty folder to a built site with three shell lines and one pasted prompt, and the README should be that path, not a reference manual.

## Decisions (operator, 2026-09-26)

| Question                          | Decision                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Scope                             | Docs **and** a new `npx kiss-ssg init` command                                   |
| Where the library reference lives | Root `GUIDE.md`, shipped in the tarball                                          |
| What `init` writes                | Agent wiring **and** a minimal starter site                                      |
| May `init` run npm                | Yes: installs `kiss-ssg@<its own version>` when missing, `--no-install` skips it |
| Plugin scope                      | Project (`.claude/settings.json`), everywhere the docs show an install           |

## 1. First-run experience (README top)

```
mkdir my-site && cd my-site
npx kiss-ssg@latest init
claude
```

then one copyable prompt, e.g.:

> Use the kiss-site-new skill to build me a site for a small bakery in Leeds: home, menu, about, and a news section for seasonal specials. Run the build check when you're done.

README order after the change:

1. One-paragraph pitch: an SSG built to be driven by a coding agent, with a machine verdict (`kiss-ssg check`) and a memory (`kiss-ssg aikb`).
2. **Quick start**: the three lines, what happens on first `claude` launch (trust folder, accept the plugin install), and the prompt.
3. **Prompts to copy**: new site, add a page, "why is my build failing", "catch me up on this site", "upgrade kiss-ssg". Each names the skill it reaches.
4. **What you just installed**: the two plugins and their skills in one short table each, linking `plugins/*/README.md` for detail.
5. **Setting up by hand**: shell `claude plugin marketplace add cprobert/kiss-ssg --scope project` + `claude plugin install kiss-ssg@kiss-ssg --scope project` (and `kiss-memory`); in-session `/plugin …` then `/reload-plugins`; other agents via `AGENTS.md` and `node_modules/kiss-ssg/llms.txt`.
6. Requirements (Node ≥22.12, ESM).
7. **Using the library directly** → link to `GUIDE.md`.

### Unverified assumption, first implementation step

That Claude Code, on first launch in a trusted folder whose `.claude/settings.json` declares `extraKnownMarketplaces.kiss-ssg` and `enabledPlugins`, prompts to install the plugins so no reload is needed. **Inferred, not measured.** Step one of the plan is a throwaway probe in a temp folder. If it does not hold, the Quick start adds the two `claude plugin … --scope project` shell lines before `claude` (those flags are measured: `claude plugin install --help`, v2.1.283, lists `-s, --scope <user|project|local>`).

## 2. `npx kiss-ssg init`

Shape mirrors `check`: decisions in `lib/init.js`, I/O in `bin/kiss-ssg.js`.

- `lib/init.js` exports a pure `planInit(state)` that takes what is on disk (existing `package.json` content, presence of `router.js`, `src/`, `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` content, `node_modules/kiss-ssg`) and returns an ordered list of actions: `create`, `merge`, `append`, `skip` (with a reason), `install`. The bin executes the list and prints one line per action.
- **Idempotent and non-destructive.** An existing file is never overwritten. `package.json` and `.claude/settings.json` are merged key by key: an existing key is kept and reported, never replaced. The `CLAUDE.md` import line and the `AGENTS.md` pointer are appended only when missing. A second run over an initialised folder is all `skip`.
- **What it writes**:
  - `package.json`: created if absent (`name` from the folder); merged: `"type": "module"`, `scripts.build` (`node router.js`), `scripts.dev` (`node router.js --dev`), `scripts.check` (`kiss-ssg check router.js`).
  - `npm install --save-dev kiss-ssg@<version of the running init>` when `node_modules/kiss-ssg` is absent, unless `--no-install`.
  - `CLAUDE.md`: `@node_modules/kiss-ssg/llms.txt`.
  - `AGENTS.md`: a short pointer to `node_modules/kiss-ssg/llms.txt`, `examples/` and `npx kiss-ssg check` (AGENTS.md has no import syntax).
  - `.claude/settings.json`: `extraKnownMarketplaces.kiss-ssg = { source: { source: 'github', repo: 'cprobert/kiss-ssg' } }`, `enabledPlugins['kiss-ssg@kiss-ssg'] = true`, `enabledPlugins['kiss-memory@kiss-ssg'] = true`.
  - The starter site, **only** when neither `router.js` nor `src/` exists; otherwise one `skip` line saying the site was left alone.
- Ends by printing the next step: run `claude`, accept the plugins, paste the prompt (printed).
- `check`'s `HELP` and `parseArgs` gain the `init` command and `--no-install`.

### The starter

A new top-level shipped folder, `starter/`, copied verbatim: `router.js`, `src/pages/index.hbs`, `src/layouts/layout.hbs`, `.gitignore` (`node_modules/`, `public/`). Example 1's shape (no `folders` block, `reportBuildFailure`, `--dev`), without its content. `router.js` carries a marker comment (`// Started by \`npx kiss-ssg init\``) that `kiss-site-new` reads to grow the starter rather than replace it.

`starter/` is added to `package.json` `files` and to the pack gate's `REQUIRED_PACKED`. It is not an example (the CLAUDE.md distinction between fixtures and examples holds): it is the smallest site the conventions produce, and is written to be imitated.

### Tests

- `test/unit/init.test.js`: `planInit` over empty folder, initialised folder (all skip), existing site (starter skipped), existing `package.json` with a conflicting `type`/`scripts.build` (kept, reported), existing `settings.json` with other plugins (preserved).
- `test/integration/init.test.js`: run the bin in a temp folder with `--no-install` and the working tree linked as `node_modules/kiss-ssg`, then `kiss-ssg check router.js` exits 0; run `init` again and nothing changes on disk.
- CLAUDE.md regression rule applies: each merge-safety test is seen red first.

## 3. Documentation moves

- `README.md`: rewritten per section 1. The Migrating-from-v1 and Types sections move to `GUIDE.md`.
- `GUIDE.md`: everything from `## Types` and `## Usage` onward, headings kept so anchors survive under the new file.
  - `package.json` `files` and `REQUIRED_PACKED` gain it.
  - `test/aikb.test.js` reads the config-defaults block from `GUIDE.md` instead of `README.md`.
  - `test/unit/skill-coverage.test.js` `consumerFacing()` scans `GUIDE.md` beside `README.md`.
- Links: every `README.md#…` reference in `plugins/`, `llms.txt`, `AIKB/`, `examples/`, `src/` and `CLAUDE.md` is re-pointed to `GUIDE.md#…` where the section moved. Verified with `/corpse-collector`.
- `plugins/kiss-ssg/README.md`, `plugins/kiss-memory/README.md`: install blocks use `--scope project` (shell form first, in-session form with `/reload-plugins` second) and mention `init`.
- `plugins/kiss-ssg/skills/kiss-site-new/SKILL.md`: steps 1–2 note that `init` may already have done them; new rule: a `router.js` carrying the init marker is a starter to grow, not a site to preserve. Row in `skill-coverage.test.js`.
- `llms.txt`: CLI section gains `kiss-ssg init`. `CLAUDE.md`: commands block, the `bin/` paragraph, the `files` whitelist sentence, and a module-table row for `lib/init.js` → `AIKB/init.md`. New `AIKB/init.md` from the template.
- `CHANGELOG.md`: 2.7.0 entry.

## Non-goals

- No change to the engine's build pipeline, config or helpers.
- No starter variants (blog, docs) — `kiss-site-new` picks the exemplar; `init` gives it a floor to stand on.
- No attempt to run `claude plugin install` from `init` (the CLI may be absent; the agent may not be Claude Code). Settings declaration is the mechanism.
- No rewrite of the reference content itself — it moves, it is not re-edited beyond link fixes.
- The docs site (`src/` → `docs/`) is not restructured; only its links to README anchors are fixed.

## Impact surface and release

Public API (a new CLI command) → minor: **2.7.0**. Runs under the three-beat branch workflow: `/branch-open` on `main`, pulses at slice boundaries (probe; init; docs), `/branch-close` only when the operator asks.

## Success criteria

1. From an empty temp folder, `npx <packed tarball> init` then `npm run check` exits 0.
2. A second `init` run changes no file (hash-compared).
3. First `claude` launch in that folder offers the two plugins (probe result recorded in the session log either way).
4. README's first screen is the Quick start; `GUIDE.md` carries the reference; `npm run gates` green on Linux and Windows CI.
5. No `README.md#` anchor anywhere in the repo points at a heading that moved.
