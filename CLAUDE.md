# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It states each rule once; the incidents that taught them are in [`planning/history/claude-md-rules.md`](planning/history/claude-md-rules.md), which nothing loads by default.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node (ESM, Node ≥22.23.4). The engine is `lib/`: `lib/kiss.js` is the entry point and orchestrator, and every other `lib/*.js` module has one responsibility. There is no build step, bundler or transpilation.

- **`llms.txt`** is the LLM-facing **index** of the API ([llmstxt.org](https://llmstxt.org)). It ships, and `kiss-ssg init` `@`-imports it into every site's `CLAUDE.md`, so every character is loaded into every session of every consuming site. It names what exists, the shape to follow and the traps nothing reports, and points at the `GUIDE.md` section holding each rule. `test/aikb.test.js` caps it at 16,000 characters; raise the cap only by cutting something else ([history](planning/history/claude-md-rules.md#what-this-is)).
- **The tarball** is `package.json`'s `files` whitelist: `bin/`, `lib/`, `types/`, `llms.txt`, `GUIDE.md`, `AIKB/`, `examples/`, `starter/`, `CHANGELOG.md`, plus `README.md`, `LICENSE` and `package.json`. `AIKB/`, `examples/` and `CHANGELOG.md` ship so an agent in a consuming project can read them; `starter/` ships its ignore file as `starter/gitignore`, because npm never packs a `.gitignore`. The whitelist overrides `.gitignore`, so a gitignored folder inside a whitelisted one ships unless `files` names it with `!` (`!examples/*/public`, `!examples/*/.converted`) and the `pack` gate's `FORBIDDEN_PACKED` names it too.
- **`bin/kiss-ssg.js`** is the published command line (`init`, `check`, `aikb`, `upgrade`, `speed`, `css`, `images`, `session`, `base`, `issue`): thin wrappers whose decisions live in `lib/init.js`, `lib/check.js`, `lib/upgrade.js`, `lib/speed.js`, `lib/css-audit.js`, `lib/images-sweep.js`, `lib/sessions.js`, `lib/base.js` and `lib/issue.js`.
- **`plugins/kiss-ssg/skills/`** holds two kinds of skill, all in the one plugin. **Task skills** do a job on a site and are named thing-action (`kiss-site-new`, `kiss-page-add`); **domain skills** hold one area of web expertise and are named for it in plain words (`kiss-writing-for-the-web`, `kiss-information-architecture`, `kiss-seo`, `kiss-accessibility`, `kiss-front-end`, `kiss-design`, `kiss-legal-and-privacy`). A task skill is a thin handler: kiss mechanics plus a Markdown link to the domain skill's `SKILL.md` with an instruction to open it, never a second copy of a domain rule; `test/unit/skill-coverage.test.js` fails a bare name. A domain skill's review reports to `kiss-site-review/review-protocol.md` and looks through `kiss-site-review/browser-pass.md`. Design: `planning/plans/2026-10-30-domain-skills.md`.
- **`src/`** is the source of this repo's docs site, not engine code. `docs.js` builds it into `docs/`, which is build output: git-ignored, built by the deploy workflow (`.github/workflows/static.yml`) from a clean checkout, never edited or committed. The guide pages are cut from `GUIDE.md`, one page per entry in `src/models/guide.json`: a new `##`/`###` section in `GUIDE.md` fails `node docs` until it has a page there or is named in `src/controllers/guide.js`'s `LEFT_OUT`.
- **`planning/`** holds specs, plans, reviews, session logs and history, never `docs/`. **`scripts/`** is dev tooling that never ships. **`CONTRIBUTING.md`** holds a checklist each for a built-in helper, a config key and an audit check: read the one that applies before starting.

## Design philosophy

**Architectural elegance is the prime objective, not compatibility.** The operator owns every site consuming this package, so a breaking change is a migration he schedules rather than a promise to strangers. That latitude is to be spent: where the right shape and the compatible shape differ, take the right shape, bump the minor, and say what moved. It is not licence to churn — a break still has to buy something structural — but "this would break existing sites" is a cost to weigh, never on its own a reason to keep a compromise. The version number says how much moved, not whether it broke (see the Git workflow below): a break inside the 2.x line is a minor with an upgrade note, never on its own a new major.

**kiss is opinionated, and persuadable.** Convention first: the default is the shape most sites want, stated once and applied everywhere — `folders` derives six folders from `src`, helpers auto-register from `folders.helpers`, a page's `id` is its view's route, an asset is keyed by the name a template asks for, `{{link}}` fails the build rather than emitting a URL nobody checked. Every one of those is overridable, and the override is a config key rather than a fork.

The order is not symmetrical and that is the point. A convention nobody can override is a cage; a configuration option with no default is a questionnaire. kiss asks the author nothing it can answer itself, and refuses nothing the author insists on.

Three consequences, because they settle arguments rather than decorate them:

- **A new capability arrives as a convention with a default, not as a required option.** If a design cannot produce a sensible default, that is evidence it is not finished — not evidence that the author should be asked.
- **A file extension is a statement about processing, not a naming habit.** `.hbs` is a template, `.md` is rendered Markdown, `.html` is HTML — and all three are _compiled_, so `{{ }}` in an `.html` partial is interpolated; `.txt` is the one kiss does not compile. An author should be able to predict what happens to a file from its name alone, and anything kiss adds has to keep that promise legible.
- **Agents do the work; humans have to be able to follow it.** The structure an agent produces is opened, read and hand-edited by a person sooner or later. A convention an agent finds convenient and a human cannot follow is the wrong convention — legibility to a person is a design constraint, not a nicety.

**What ships is an example.** `examples/` is in the published tarball precisely so an agent in a consuming project can read it, which means every example is copied as a statement of good practice whether or not it was written as one. An example that models a shape no real project would use is not neutral — it teaches that shape. Fixtures that exist to exercise the engine are a different artefact from examples that exist to be imitated, and the two must not be the same files.

**Domain skills are judged by the sites they produce, not by code review.** Measure one by building the same brief with and without it, on a site that has the failures the skill exists to prevent: a site that already practises the domain well gives "no difference" whatever the skill says, which is what the measurements of `kiss-seo` on three good sites showed twice (2026-10-31, 2026-11-01). A code review of a domain skill finds wording to tighten forever; it cannot say whether the site got better.

## Architecture knowledge base

Detailed per-module notes live in `AIKB/` — read the relevant doc before changing that module, and update it in the same commit. `test/aikb.test.js` fails if a module has no doc, a doc is orphaned (its `lib/` module no longer exists), a doc is missing from this table, or a doc drops a template heading.

| Module                                              | File                         | AIKB doc                      |
| --------------------------------------------------- | ---------------------------- | ----------------------------- |
| Orchestrator / public API                           | `lib/kiss.js`                | `AIKB/kiss.md`                |
| Page renderer                                       | `lib/kiss-page.js`           | `AIKB/kiss-page.md`           |
| Page registration + identity (the stack)            | `lib/page-registry.js`       | `AIKB/page-registry.md`       |
| Build report (the machine verdict)                  | `lib/build-report.js`        | `AIKB/build-report.md`        |
| Settled build (report, links, redirects)            | `lib/build-finish.js`        | `AIKB/build-finish.md`        |
| `kiss-ssg check` decision core                      | `lib/check.js`               | `AIKB/check.md`               |
| `kiss-ssg session` (session logs)                   | `lib/sessions.js`            | `AIKB/sessions.md`            |
| `kiss-ssg base` (the work's base branch)            | `lib/base.js`                | `AIKB/base.md`                |
| `kiss-ssg issue` (report to kiss-ssg)               | `lib/issue.js`               | `AIKB/issue.md`               |
| `kiss-ssg upgrade` (install + notes)                | `lib/upgrade.js`             | `AIKB/upgrade.md`             |
| `kiss-ssg speed` (Lighthouse KPIs)                  | `lib/speed.js`               | `AIKB/speed.md`               |
| `kiss-ssg css` (CSS partition audit)                | `lib/css-audit.js`           | `AIKB/css-audit.md`           |
| Git, asked one way (exact refs)                     | `lib/git.js`                 | `AIKB/git.md`                 |
| `kiss-ssg init` plan                                | `lib/init.js`                | `AIKB/init.md`                |
| Logger                                              | `lib/logger.js`              | `AIKB/logger.md`              |
| Config + folder derivation                          | `lib/config.js`              | `AIKB/config.md`              |
| Consent config + decisions                          | `lib/consent.js`             | `AIKB/consent.md`             |
| Consent default UI (banner, dialog, table)          | `lib/consent-ui.js`          | `AIKB/consent-ui.md`          |
| Consent browser client (inlined)                    | `lib/consent-client.js`      | `AIKB/consent-client.md`      |
| Consent gating markup + wiring check                | `lib/consent-gate.js`        | `AIKB/consent-gate.md`        |
| Click-to-load embeds (`{{embed}}`)                  | `lib/embed.js`               | `AIKB/embed.md`               |
| Consent history viewer (`consentRecord`)            | `lib/consent-record.js`      | `AIKB/consent-record.md`      |
| Built-in Handlebars helpers                         | `lib/handlebars-helpers.js`  | `AIKB/handlebars-helpers.md`  |
| Site's own helpers (auto-registered)                | `lib/site-helpers.js`        | `AIKB/site-helpers.md`        |
| Partials / layouts registration                     | `lib/partials.js`            | `AIKB/partials.md`            |
| Dependency graph (partial → page)                   | `lib/dependency-graph.js`    | `AIKB/dependency-graph.md`    |
| Assets + Sass                                       | `lib/assets.js`              | `AIKB/assets.md`              |
| The build's asset copies (queue, failures)          | `lib/asset-copy.js`          | `AIKB/asset-copy.md`          |
| Minified copied CSS and JS                          | `lib/asset-minify.js`        | `AIKB/asset-minify.md`        |
| Integrity attributes vs the written files           | `lib/integrity.js`           | `AIKB/integrity.md`           |
| Purged CSS (`assets.purge`, at the settle)          | `lib/css-purge.js`           | `AIKB/css-purge.md`           |
| Image header reader (size, GPS)                     | `lib/image-header.js`        | `AIKB/image-header.md`        |
| Responsive images (`{{image}}`, names)              | `lib/images.js`              | `AIKB/images.md`              |
| Image encode + committed cache                      | `lib/image-encode.js`        | `AIKB/image-encode.md`        |
| `kiss-ssg images` (cache sweep)                     | `lib/images-sweep.js`        | `AIKB/images-sweep.md`        |
| Markup decomposition (single-file → views)          | `lib/html-split.js`          | `AIKB/html-split.md`          |
| Asset pipeline (external tools)                     | `lib/pipeline.js`            | `AIKB/pipeline.md`            |
| Asset manifest + cache busting                      | `lib/asset-manifest.js`      | `AIKB/asset-manifest.md`      |
| Output ownership                                    | `lib/output-registry.js`     | `AIKB/output-registry.md`     |
| Staging folder + atomic promotion                   | `lib/staging.js`             | `AIKB/staging.md`             |
| Sass binding                                        | `lib/sass.js`                | `AIKB/sass.md`                |
| Model resolution                                    | `lib/model-resolver.js`      | `AIKB/model-resolver.md`      |
| URL-model fetch policy                              | `lib/fetch-policy.js`        | `AIKB/fetch-policy.md`        |
| Controller resolution                               | `lib/controller-resolver.js` | `AIKB/controller-resolver.md` |
| Sitemap                                             | `lib/sitemap.js`             | `AIKB/sitemap.md`             |
| llms.txt (the AI-facing index)                      | `lib/llms.js`                | `AIKB/llms.md`                |
| Markdown copy of each page (for agents)             | `lib/markdown-copy.js`       | `AIKB/markdown-copy.md`       |
| RSS feed (from the registry)                        | `lib/feed.js`                | `AIKB/feed.md`                |
| robots.txt (`.robots()`)                            | `lib/robots.js`              | `AIKB/robots.md`              |
| Site knowledge base (`kiss-ssg aikb`)               | `lib/aikb.js`                | `AIKB/aikb.md`                |
| Broken internal links                               | `lib/links.js`               | `AIKB/links.md`               |
| Launch-readiness audit                              | `lib/audit.js`               | `AIKB/audit.md`               |
| Redirects (`aliases` → `_redirects`)                | `lib/redirects.js`           | `AIKB/redirects.md`           |
| Cache headers for hashed files                      | `lib/cache-headers.js`       | `AIKB/cache-headers.md`       |
| Security headers (opt-in, beside the cache headers) | `lib/security-headers.js`    | `AIKB/security-headers.md`    |
| Deterministic zip (learning packages)               | `lib/zip.js`                 | `AIKB/zip.md`                 |
| Learning package manifest (IMS CP, SCORM)           | `lib/package-manifest.js`    | `AIKB/package-manifest.md`    |
| Learning packages (`package`, the writer)           | `lib/packages.js`            | `AIKB/packages.md`            |
| SCORM 1.2 bridge (`{{scormBridge}}`)                | `lib/scorm-bridge.js`        | `AIKB/scorm-bridge.md`        |
| Dev server                                          | `lib/dev-server.js`          | `AIKB/dev-server.md`          |
| File watcher                                        | `lib/watcher.js`             | `AIKB/watcher.md`             |
| Watch session (dispatch, rebuild queue)             | `lib/rebuild.js`             | `AIKB/rebuild.md`             |
| String/path utils                                   | `lib/utils.js`               | `AIKB/utils.md`               |
| Cross-cutting: design & lineage                     | —                            | `AIKB/design.md`              |
| Cross-cutting: testing conventions                  | `test/`                      | `AIKB/testing.md`             |
| Cross-cutting: upstream constraints                 | —                            | `AIKB/upstream.md`            |

## Commands

One line each. The flags and what each command reads and writes are in its `--help`, its `AIKB/` doc, or [the history](planning/history/claude-md-rules.md#commands).

```bash
npm test                                   # Vitest, single run; one file: npx vitest run <file> [-t <name>]
npm run lint                               # ESLint (eslint.config.js)
npm run typecheck                          # tsc --checkJs over lib/, scripts/, bin/; never emits
npm run format                             # Prettier, write; format:check to verify
npm run gates                              # the five pre-PR gates: test, lint, typecheck, format, pack
npm run types                              # regenerate types/ from lib/'s JSDoc (never hand-edit types/)
npx kiss-ssg init                          # set a folder up for an agent; never overwrites
npx kiss-ssg check <script>                # dry-run a site's build: report it, publish nothing
npx kiss-ssg aikb <script>                 # record the site's knowledge base; the only writer of that folder
npx kiss-ssg@latest upgrade                # install that kiss-ssg into a site and print the upgrade notes since its version
npx kiss-ssg speed <build folder>          # Lighthouse KPIs for a built site (optional peer)
npx kiss-ssg css <build folder>            # the CSS partition audit; reads, never writes
npx kiss-ssg images <script>               # fill and prune the committed image encode cache
node scripts/base-branch.mjs               # the integration branch this work merges into
node scripts/scope-check.mjs               # changed files outside the session file's scope:; exit 1 if any
node scripts/red-first.mjs <test file>     # run a new test against the base; exit 0 = it failed there (wanted)
node scripts/fleet-check.mjs <site> --base <ref>   # build a real site from the base and the branch; exit 1 if they differ
node scripts/budgets.mjs [--record|--check] [--bench <file>]   # the roadmap's budgets against planning/budgets.json
node scripts/arms.mjs setup|run|summarise  # measure a skill: one headless arm on a site at a commit
node scripts/sync-plugin-versions.mjs      # carry package.json's version into every plugin manifest (npm version runs it)
node scripts/release-check.mjs             # /kiss-publish's preflight: may HEAD be tagged v<version>? exit 1 names each failed check; --run: the publish run for the tag and its staging id
node scripts/tag-release.mjs               # tag HEAD v<version> and push it (/kiss-publish runs it; it re-pushes a tag whose push failed); --check: the pushed tag (GITHUB_REF_NAME) is v<version>, which publish.yml runs first; --dist-tag: latest, or next for a prerelease
npm run bench                              # the benchmark harness; the /bench skill says how to read it
npm run screenshot -- <build folder>       # shoot pages with Playwright; from Git Bash, run it from PowerShell
node docs                                  # build the docs site into docs/ and exit
npm run dev                                # docs live preview at http://127.0.0.1:3001; never exits (Ctrl-C)
npm run eg1 … eg14                         # run an example from its own folder; --dev previews (not 7 or 13)
```

`.nvmrc` holds the runtime floor, Node 22.23.4, and CI's `setup-node` reads it; a local machine on a newer Node passes the gates without proving the floor. Prettier config is in `.prettierrc` (no semicolons, single quotes); `.hbs` templates are not Prettier-formatted, because its Handlebars parser rejects `{{> "partial"}}`.

## Pipeline in one paragraph

`new Kiss(config)` resolves config, makes a per-instance Handlebars and Remarkable, queues `config.assets.pipeline`'s commands and then the asset copy on one queue, registers helpers and partials, and in dev starts the server, the watcher and each pipeline step's `watch` process. `.page()`, `.pages()` and `.scan()` each queue one caught promise on `_promises` that resolves the model, runs the controller and pushes a `KissPage` onto `_stack`; nothing renders until `.generate()`, and every page carries an `id` that `{{link}}` resolves live, failing the render on an id no page claims. `.complete()` settles (drain, render what the drain left, repeat until stable), runs the settle path — purge, image encode, redirects, consent files, cache headers, learning packages, link resolution, the audit — and rejects with an `AggregateError` if anything failed, or else resolves and, under `cleanBuild: 'atomic'`, promotes the staging folder. `.sitemap()`, `.llms()` (with each page's Markdown copy), `.feed()` and `.robots()` write from the same registry, and every URL the build emits goes through the one `config.links.trailingSlash` policy. Every settled build assembles one `BuildReport` (`kiss.report()`, `err.report`, `KISS_REPORT`, `last-build.json`), re-derived in place whenever a failure lands without a settle; `.watch()` sends each change through one serial rebuild queue, and `KISS_CHECK`/`KISS_AIKB` stage and discard the build for `kiss-ssg check` and `aikb`. Full detail: `AIKB/kiss.md`, `AIKB/build-finish.md`, `AIKB/build-report.md`, `AIKB/page-registry.md`, `AIKB/rebuild.md`, `AIKB/staging.md`, and [the history](planning/history/claude-md-rules.md#pipeline-in-one-paragraph).

## Git workflow

Two automated nets run the same script: a **pre-commit hook** (`.githooks/pre-commit`, set up by npm's `prepare`) blocks a commit whose staged files fail Prettier, and **CI** (`.github/workflows/ci.yml`) runs `npm run gates` on every PR and push to `main` and `v2`, on Ubuntu and Windows, so a `skipIf(process.platform !== 'win32')` test is a real gate. `prepublishOnly` runs the gates before a local `npm publish`. Neither replaces the ritual below.

**A release is the operator's two acts, and CI does the rest.** The first is typing **`/kiss-publish`** on the merged commit. It preflights the commit (`scripts/release-check.mjs`), then pushes the tag `v<version>`, which runs `.github/workflows/publish.yml` (environment `npm`, tags `v*` only). The workflow checks the tag against `package.json`, runs the gates and runs `npm stage publish` under npm trusted publishing, with provenance. The skill then watches the run to the staging id. The second act is approving the staged version with 2FA on npmjs.com; nothing is public until then. Before the first tag under the workflow, create the connection on npmjs.com (GitHub Actions, `cprobert` / `kiss-ssg`, `publish.yml`, environment `npm`, no allowed action): npm expires one that no publish has validated within 48 hours of its creation. **Only `/kiss-publish`, typed by the operator, pushes a release tag**: no other skill, ritual or session tags, and no session deletes or moves one (the operator's decision, 2026-11-12: [`planning/sessions/2026-11-12-kiss-publish.md`](planning/sessions/2026-11-12-kiss-publish.md)).

**The base branch is resolved, not assumed.** `node scripts/base-branch.mjs` prints the branch this work merges into (`main`, or a major line in development). Override it with `git config kiss.baseBranch <name>` or `KISS_BASE_BRANCH`; a bare name that is only a tag counts as none (write `refs/tags/<name>` for the tag).

A branch runs as four beats, all reading one committed artefact, `planning/sessions/<date>-<slug>.md`:

- **`/branch-open`** (Frame), on the base branch: reads back the Feedback of earlier logs, interviews for intent (objective, success criteria, non-goals, assumptions, scope, **impact surface**, expected shape), writes the session file and creates the branch, here or in a worktree (`/branch-open worktree`).
- **`/branch-pulse`** (Steer), repeatedly mid-branch: re-checks the criteria with evidence, catches drift, logs to `## Pulse log`. Claude offers it at least once per working session, at each slice boundary, and after every Amendment and every multi-round review. **A pulse is the skill, run; never an entry written by hand into the pulse log** ([history](planning/history/claude-md-rules.md#git-workflow)).
- **`/branch-close`** (Verify & close): the single end-of-branch command — secrets scan, docs sweep, corpse collector, the version bump, coverage gate, an operator eyeball, the gates, a Codex review (the default when `lib/` or `bin/` changed), the reflection, then the push and the PR against the base branch. Never push for a PR without it.
- **`/branch-merged`** (Tidy), after the PR merged: confirms the merge with `gh`, fast-forwards the base, deletes the local branch, and removes only the worktree the session file names. It never deletes the remote branch, resets the base or force-pushes. When npm is behind the merged version, it says so and names `/kiss-publish`.

**The version counts generations, not breaks.** `/branch-close` bumps `package.json` and adds a `CHANGELOG.md` entry (`test/unit/changelog.test.js` and `test/unit/plugin-manifests.test.js` hold them to it). The major moves only when kiss is reinvented. A **minor** (2.x.0) is a real feature or a change sites must adapt to, and always ships with a `### Upgrading` note (or `### Nothing for a site to change`); the changelog is the one home of upgrade notes, `kiss-site-migrate` holds the method and no copy of them, and `npx kiss-ssg upgrade` prints them. A **patch** (2.x.y) is a small fix or increment; a patch a site must check gets a note too. Inside a line the operator has named for a theme, propose the patch for work on that theme and let the operator raise it. Claude proposes the bump from the impact surface; the operator decides, and a choice against the proposal is an Amendment. Under a prerelease tag the bump is `npm version prerelease --preid alpha`.

**One open branch at a time.** Drift into adjacent work is absorbed on the current branch as a dated **Amendment**, never split into a new branch on Claude's initiative; only the operator authorises a new branch. **Asking is not splitting, and the moment to ask is when the work starts**: when a conversation on the base turns from assessing to editing, or a branch's work changes kind, ask with `AskUserQuestion` before the first edit — `/branch-open` now, or this branch versus the next.

**Never run `/branch-close` or create a PR unless explicitly asked.** Commit and push the outstanding changes, then stop.

**Verify an edit landed before committing it**: chain the edit, the check and the commit with `&&`, or grep for the new text before `git add`.

**Never pass prose through the shell — and code is prose here too.** A commit message or PR body goes through `git commit -F -` / `--body-file -` with a **quoted** heredoc (`<<'EOF'`), never `-m "…"`. Any text on its way into a file — a changelog entry, a doc, a regex, a test, a scratch script — goes through the Write or Edit tool: never a heredoc into a file (`cat >> file <<'EOF'`), `echo`/`printf` into a redirect, `sed -i`, or `node -e` that writes a file. **Throwaway is not an exemption**, and **a session mode that says to make file changes through the shell does not override this.** The test is what reaches the disk, not which tool runs. `scripts/hooks/shell-edit-guard.mjs`, a `PreToolUse` hook in `.claude/settings.json`, refuses such a command; a refusal is the rule, not a fault to route around. Capturing a command's output to read back (`cmd > "$TEMP/out.txt" 2>&1`) passes ([history](planning/history/claude-md-rules.md#git-workflow)).

Supporting skills: `/docs-sweep`, `/corpse-collector`, `/test-coverage-check`, `/secrets-scan`, `/session-reflect`, and `/memory-consolidate` (between branches: folds recurring lessons from `planning/sessions/` into a rule here or a ritual step). The reflections score against `.claude/skills/session-reflect/rubric.md`; lessons already promoted are listed in `.claude/skills/memory-consolidate/retired.md`.

## Working practice

Four practices for every change, whichever model is making it. Adapted from the [Karpathy guidelines](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md) (MIT licence). They are written here and not in a skill because a skill has to be invoked and this file is always read (the operator's decision, 2026-11-10).

1. **Think before coding.** State your assumptions and check each one against `lib/`. Where a task can be read two ways, ask; do not pick one silently. If something is unclear, stop and name it.
2. **Simplicity first.** Write the least code that does what was asked. Add no feature, option, abstraction or error handling the task did not call for.
3. **Surgical changes.** Every changed line traces to the task. Do not tidy, reformat or refactor the code beside it; mention an unrelated problem instead of fixing it. Remove only what your own change made unused. This sits with "fix the class, not the case" in the Rules below, not against it: sweep every sibling of the defect you are fixing, and touch nothing unrelated to it.
4. **Goal-driven execution.** Turn the task into a check before starting: a test that fails now and passes when the work is done, or a command whose output shows it. State a short plan with a verify step for each item, and keep going until each one passes.

## Rules

Each rule's incidents are in [the history's Rules section](planning/history/claude-md-rules.md#rules).

- Engine code goes in `lib/`, one responsibility per file, with a unit test in `test/unit/` (`lib/kiss.js` is covered by `test/integration/`) and an `AIKB/` doc.
- **A skill holds knowledge and judgement; the engine and the `kiss-ssg` CLI hold mechanism.** Anything a skill needs done exactly right every time is a `kiss-ssg` command with its decision in a tested `lib/` module. A skill's code block is a list of commands to run, never a program: no pipe into a filter, no loop or condition, no `&&` chain, no `awk`, `sed` or `node -e`, no logic copied into a second skill; `test/unit/skill-code-blocks.test.js` holds every skill to that allow-list. If getting it wrong would need a regression test, it belongs in `lib/`. A skill that needs a command an older installed kiss-ssg lacks says so, and how to check (`npx kiss-ssg session --help` answering `unknown command` means upgrade first). The repository's own skills follow the same rule against `scripts/`.
- **A review loop has a stop condition before it starts:** the scope, the **threat model** (which scenarios count), the severity that counts, and what happens below it. A round that adds code outside the scope is a new branch. "Until it comes back clean" is not a stop condition, and nor is severity alone, because the reviewer rates its own findings. **When the findings change kind**, put the threat model to the operator before the next round, unasked, and **between rounds put the largest fix diff in front of the operator** before re-running the reviewer.
- Dev tooling in `scripts/` gets a `test/unit/` test too; exempt a genuinely thin file with `// @test-exempt: <reason>`.
- `bin/` holds the published command line and nothing else: one thin wrapper per command, every decision in a tested `lib/` module, and each wrapper covered end to end in `test/integration/`.
- Only `lib/logger.js` imports `colors`; everything else logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises` (`AIKB/kiss.md`).
- **Public API changes** in the same commit: the behaviour in `GUIDE.md`, **one index line** in `llms.txt` (the name and any trap nothing reports, never the rules), `README.md`, and `npm run types`. A feature an agent should reach for goes into the skill that would use it, with a row in `test/unit/skill-coverage.test.js`; when a change makes an old instruction _wrong_, ban the old sentence in that file's `CONTRADICTIONS` table too, because a mention test is satisfied by the right paragraph beside the wrong one.
- **JSDoc is the type source, and it is checked** (`npm run typecheck`). A private field's `@type` needs `@private` in the same JSDoc block, and a method inserted between a JSDoc block and its definition orphans it; `test/unit/types.test.js` pins the signatures lost that way.
- **A regression test is accepted only once it has been seen to fail against the unfixed code.** `node scripts/red-first.mjs <test file>` runs it against the base and prints the line that goes in the pulse log.
- **URL policy is threaded, not global.** `toAbsoluteUrl` and `servedPathFor` are always handed the same `config.links.trailingSlash`, or a page is linked at one URL and canonicalised at another; `toURLKey` is page identity and takes no policy. Do not "unify the three URL functions".
- **Upstream is documented, not engineered around.** A defect or gap in Node, handlebars, chokidar or sass goes into `AIKB/upstream.md` with the version and how to re-check it; a cheap local guard is fine, a mechanism is not. The same file records a supported upstream mechanism kiss chose not to use.
- **The dev watcher is best-effort; its fringe is recorded, not chased.** A watch-only misbehaviour that Ctrl-C and a fresh `--dev` clears goes into the **Known knowns** register in `AIKB/rebuild.md`, and the work moves on. It earns a fix only when the one-shot build or `check` is wrong too, a restart does not clear it, it touches a source file or anything outside the build folder, or the operator asks — and that call is made with the operator **before** investigating.
- **A doc is a claim about the code, not evidence of it.** Check `lib/` before repeating what `AIKB/`, `llms.txt` or a plan says. **The same standard applies to Claude's own claims and to a peer session's**: say whether a statement is measured or inferred, re-derive a relayed finding before acting on it, and when no independent review ran, say so. **Agreement from the same model family is not confirmation.** Run every code snippet you write or change against the real engine; build and measure a sentence about behaviour across every case it covers; run the measurement before writing a number, even an aside.
- **After the first finding, fix the class, not the case.** Ask what the code promised before patching the instance (an allow-list of the safe shapes, not a deny-list of the ones seen), and sweep every sibling before the commit. **The suite is a sibling too**: grep for every test and tool that reads a rule or an output before changing it. The commit message names the class that was fixed, and no wider than the diff holds.
- **A conclusion drawn from a command needs its exit code and its stderr**, not its filtered stdout; an empty answer is unknown until the command is shown to have succeeded. **A commit that follows the gates is chained to them with `&&`**, never `;`.
- **Say it at the point of decision.** An unanswered question, an inherited risk or a mostly generated diff is raised before the step that depends on it. **Where two readings lead to materially different work, that is an `AskUserQuestion`, not a note at the bottom of a report**, and an option's **label states the choice**, with the reasoning in its description. **When the operator chooses against the recommendation without saying why, ask for the reason in one sentence** before writing the choice down, and if none comes, record "no reason given" — never an inferred one.
- **A command for the operator to run goes on its own line, copy-paste ready**: in a code block, with absolute paths, saying whether it exits (name a preview's port and how to stop it).
- **Before building into a folder or running the gates, check that nothing else is serving or watching it** (`Get-NetTCPConnection -LocalPort 3001,35729,5500 -State Listen`), ask before stopping a process the operator started, and **read the answer before starting anything** — never the check and the start in one batch.
