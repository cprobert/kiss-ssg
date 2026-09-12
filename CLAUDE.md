# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node (ESM, Node ≥22.12). The engine is the `lib/` folder — `lib/kiss.js` is the entry point and orchestrator; every other `lib/*.js` module has one responsibility. There is no build step, bundler, or transpilation.

`llms.txt` at the repo root is an LLM-oriented API cheat-sheet (per the [llmstxt.org](https://llmstxt.org) convention) that ships in the npm package so an agent working in a project that depends on `kiss-ssg` can read `node_modules/kiss-ssg/llms.txt` instead of the source. Keep it in sync with `lib/kiss.js` when the public API changes.

`package.json`'s `files` whitelist keeps the published tarball to `bin/`, `lib/`, `types/`, `llms.txt`, `AIKB/` and `examples/` (plus the always-included `README.md`, `LICENSE` and `package.json`) — `AIKB/` and `examples/` ship deliberately, so an agent in a consuming project can read the per-module notes and the runnable examples (`node_modules/kiss-ssg/examples/`) alongside `llms.txt`; `planning/`, `test/`, `src/`, `docs/` and the configs are all excluded. The examples build into a gitignored `public/` at the repo root, which never ships.

`bin/kiss-ssg.js` is the published command line (`npx kiss-ssg check <script>` and `npx kiss-ssg aikb <script>`) — a thin wrapper whose decisions all live in `lib/check.js`.

`src/` is **not** engine code: it is the source of this repo's own docs site (`docs.js` builds it into `docs/`). Treat `docs/` as build output. Design specs, implementation plans and session logs live in `planning/` (`planning/specs/`, `planning/plans/`, `planning/sessions/`) — never under `docs/`, which `docs.js` empties on every run. `scripts/` holds dev tooling that never ships (the `files` whitelist excludes it).

## Architecture knowledge base

Detailed per-module notes live in `AIKB/` — read the relevant doc before changing that module, and update it in the same commit. `test/aikb.test.js` fails if a module has no doc, a doc is orphaned (its `lib/` module no longer exists), a doc is missing from this table, or a doc drops a template heading.

| Module                                | File                         | AIKB doc                      |
| ------------------------------------- | ---------------------------- | ----------------------------- |
| Orchestrator / public API             | `lib/kiss.js`                | `AIKB/kiss.md`                |
| Page renderer                         | `lib/kiss-page.js`           | `AIKB/kiss-page.md`           |
| Build report (the machine verdict)    | `lib/build-report.js`        | `AIKB/build-report.md`        |
| `kiss-ssg check` decision core        | `lib/check.js`               | `AIKB/check.md`               |
| Logger                                | `lib/logger.js`              | `AIKB/logger.md`              |
| Config + folder derivation            | `lib/config.js`              | `AIKB/config.md`              |
| Built-in Handlebars helpers           | `lib/handlebars-helpers.js`  | `AIKB/handlebars-helpers.md`  |
| Partials / layouts registration       | `lib/partials.js`            | `AIKB/partials.md`            |
| Dependency graph (partial → page)     | `lib/dependency-graph.js`    | `AIKB/dependency-graph.md`    |
| Assets + Sass                         | `lib/assets.js`              | `AIKB/assets.md`              |
| Asset pipeline (external tools)       | `lib/pipeline.js`            | `AIKB/pipeline.md`            |
| Asset manifest + cache busting        | `lib/asset-manifest.js`      | `AIKB/asset-manifest.md`      |
| Sass binding                          | `lib/sass.js`                | `AIKB/sass.md`                |
| Model resolution                      | `lib/model-resolver.js`      | `AIKB/model-resolver.md`      |
| URL-model fetch policy                | `lib/fetch-policy.js`        | `AIKB/fetch-policy.md`        |
| Controller resolution                 | `lib/controller-resolver.js` | `AIKB/controller-resolver.md` |
| Sitemap                               | `lib/sitemap.js`             | `AIKB/sitemap.md`             |
| llms.txt (the AI-facing index)        | `lib/llms.js`                | `AIKB/llms.md`                |
| RSS feed (from the registry)          | `lib/feed.js`                | `AIKB/feed.md`                |
| Site knowledge base (`kiss-ssg aikb`) | `lib/aikb.js`                | `AIKB/aikb.md`                |
| Broken internal links                 | `lib/links.js`               | `AIKB/links.md`               |
| Redirects (`aliases` → `_redirects`)  | `lib/redirects.js`           | `AIKB/redirects.md`           |
| Dev server                            | `lib/dev-server.js`          | `AIKB/dev-server.md`          |
| File watcher                          | `lib/watcher.js`             | `AIKB/watcher.md`             |
| String/path utils                     | `lib/utils.js`               | `AIKB/utils.md`               |
| Cross-cutting: testing conventions    | `test/`                      | `AIKB/testing.md`             |

## Commands

```bash
npm test                 # Vitest, single run
npm run test:watch
npm run test:coverage
npm run lint             # ESLint (flat config, eslint.config.js)
npm run typecheck        # tsc --checkJs over lib/, scripts/ and bin/ — checks only, never emits
                         # (tsconfig.check.json; tsconfig.types.json is the one that emits types/)
npm run format           # Prettier, write; format:check to verify
npm run gates            # the five pre-PR gates: test, lint, typecheck, format, pack
npx kiss-ssg check <script>    # dry-run a site's build script: report it, publish nothing.
                               # Diffs against the site's own AIKB/last-build.json when it has
                               # one, so it says what this working tree changed since the last
                               # record; --against <file> names a different baseline.
                               # e.g. from examples/: `node ../bin/kiss-ssg.js check 8-data-fed-site.js`
                               # (exits 1 — example 8 fails one page on purpose)
npx kiss-ssg aikb <script>     # record the site's knowledge base into config.folders.aikb from
                               # the same staged, discarded build. Publishes nothing, refuses a
                               # failed build, and is the only thing that writes that folder —
                               # run it when a piece of work closes and commit the result.
                               # e.g. from examples/: `node ../bin/kiss-ssg.js aikb 9-migrated-from-v1.js`
npm run types            # regenerate types/ from the JSDoc in lib/ (never hand-edit types/)
node scripts/base-branch.mjs   # print the integration branch this work merges into
node scripts/sync-plugin-versions.mjs   # carry package.json's version into every plugin
                               # manifest. Wired to npm's `version` lifecycle, so
                               # `npm version` already ran it — this is the manual escape hatch.
node scripts/tag-release.mjs   # tag the current commit `v<package.json version>` and push the
                               # tag. Wired to npm's `postpublish`, so `npm publish` already ran
                               # it — the tag names the commit a version shipped from, which is
                               # also the commit a plugin install of that version came from
npm run bench                  # benchmark harness: 6 scenarios over a generated fixture,
                               # fresh child process per iteration, median of N runs
                               # --pages=50,500 --runs=5 --scenario=scan,watch
                               # scenarios: startup, scan, models, fanout, watch, styled
                               # (`styled` reproduces a real site's shape: a shared stylesheet
                               # compiled by the {{sass}} helper on every page)
                               # --json=<f> records; --baseline=<f> compares against a record
                               # baseline for this branch: `planning/benchmarks/baseline-main.json`
                               # --site=<path> times a REAL kiss-ssg site instead of the fixture:
                               # runs its own build script, in its own cwd, with KISS_REPORT set;
                               # nothing installed, linked or edited. Prints which kiss-ssg it
                               # resolved, since two runs on different copies are not comparable.
                               # --entry=<script> when package.json's build script isn't a bare `node x.js`
                               # --dev="<script> [args]" adds a WATCH reading to every --site: starts
                               # that dev entry, then edits a page, a partial and a model in turn and
                               # times each save to its live reload. The partial row re-registers the
                               # partials and re-renders the pages that rendered it (every page for a
                               # layout-wide partial, when partial/model is the registration-vs-render
                               # split). --livereload-port / --dev-port say
                               # where that dev process listens (35729 / 3001); --partial / --model /
                               # --page name the files to touch, else the first candidate under
                               # src/partials, src/models and src/pages. --partial should be one a page
                               # renders: one nothing has rendered yet re-renders every page (the
                               # fallback, not a scoped save), and one whose pages have all dropped it
                               # re-renders nothing, broadcasts no live reload, and the reading times out
node docs                # regenerate docs/, minified, and exit; --dev keeps the old live-preview server running (does not exit, Ctrl-C to stop)
npm run eg1 … eg11       # run an example (examples/*.js); builds and exits by default, --dev for a live preview (1-6, 8, 9, 10, 11); 7 takes a season slug instead and always builds and exits; 8 exits 1 by design; 11 takes --broken to show one broken-link finding
```

`.nvmrc` pins the Node line for development. Note the split: the package's runtime floor is Node 22.12 (`engines.node`), but `npm run lint`'s `@eslint/js` needs 22.13 — on 22.12 exactly, tests pass and lint refuses to run.

Prettier config is in `.prettierrc` (no semicolons, single quotes) and `.prettierignore`. `.hbs` templates are **not** prettier-formatted: its Handlebars parser rejects `{{> "partial"}}`, which every template here uses.

## Pipeline in one paragraph

`new Kiss(config)` resolves config, creates a per-instance Handlebars env (with handlebars-layouts) and Remarkable renderer, ensures folders, queues `config.assets.pipeline`'s external commands and then an asset copy (both on one queue, so the steps always run first), registers helpers and partials, and in dev mode starts the server and watcher — plus, per pipeline step that has one, a long-lived `watch` process that `close()` ends. `.page()`/`.pages()`/`.scan()` queue pages: each becomes one caught promise on `_promises` that resolves the model, runs the controller, and pushes a prepared `KissPage` onto `_stack`. Nothing renders until `.generate()`, which waits for `_promises`, renders each stack entry once, awaits the writes, then fires its callback. `.complete()` runs `_settle()` — drain everything (including work queued by callbacks), render whatever the drain left unrendered, repeat until the stack is stable — then **rejects with an `AggregateError`** if any page, controller, callback or the dev server failed, and otherwise resolves (and, under `cleanBuild: 'atomic'`, promotes the staging folder at that point). `.sitemap()` waits for `_promises` and writes `sitemap.xml`; `.llms()` waits on the same queue and writes the llmstxt.org `llms.txt` from the same registry and the same URL join; `.feed()` does the same for an RSS `feed.xml` of the dated pages. Every page carries an `id` (its view's route by default; `<prefix>/<slug>` for a fan-out item), and the `{{link "<id>"}}` helper turns identity into the served path from a live lookup over `_stack`, failing the render on an id no page claims. At the start of the settle path, before any staging folder is discarded or promoted, the pages' `aliases` are written as `_redirects` and every page's extracted `href`/`src` references (`lib/links.js`, gathered at write time beside the page hash) are resolved against the written files and the registry; the report carries `links`, `redirects` (with the `removed`/`moved`/`collisions` findings against the last record) and `feed` beside `aikb`, all advisory. Under `.watch()`, every event goes to `Kiss._handleChange`, which decides between a scoped re-render of matching stack entries (a page-view edit; a partial or layout edit re-renders the pages `lib/dependency-graph.js` recorded as having rendered it, or every page with a notice when it has none) and a whole-site rebuild that replays the pipeline from the logged `_registrations` (`Kiss._replay()`) so edited models and controllers take effect; both kinds go through one serial rebuild queue, and one live reload fires per settled rebuild. Every settled build also assembles one `BuildReport` — `kiss.report()`, `err.report` on the rejection, and a JSON Lines file when `KISS_REPORT` is set; with `KISS_CHECK=1` the build is staged and then discarded whether it passed or failed, which is what `kiss-ssg check` runs; with `KISS_AIKB=1` as well, a passing non-dev build also records the site's knowledge base into `folders.aikb`, which is what `kiss-ssg aikb` runs and the only thing that writes that folder. Full detail: `AIKB/kiss.md`, `AIKB/build-report.md`, `AIKB/check.md`, `AIKB/aikb.md`.

## Git workflow

Two automated nets, and they run the same script. A **pre-commit hook** (`.githooks/pre-commit`, activated per-clone by the npm `prepare` script) blocks a commit whose staged files fail prettier — it checks staged blob content, not the working tree, so it is immune to the CRLF noise of a Windows checkout. **CI** (`.github/workflows/ci.yml`) runs `npm run gates` on every push and PR to `main` and `v2`, and `prepublishOnly` runs the same gates before `npm publish` can ship anything. Neither replaces the ritual below: CI tells you a branch is broken, the ritual is what sweeps the docs, checks coverage, bumps the version and writes the reflection.

**The base branch is resolved, not assumed.** `node scripts/base-branch.mjs` prints the integration branch the current work merges back into — `main`, or the major line in development (`v2` today). Every skill and script below uses it, so nothing has to be edited when v2 lands on main. Override with `git config kiss.baseBranch <name>` or `KISS_BASE_BRANCH` — an override in effect names itself on stderr (stdout stays the bare ref), and one that resolves to no ref is reported and ignored in favour of the algorithm.

A branch runs as three beats, all reading one committed artefact — `planning/sessions/<date>-<slug>.md`:

- **`/branch-open`** (Frame) — run on the base branch. Reads back the Feedback of every earlier session log (skipping lessons already retired) and lists abandoned open logs, then interviews for intent (objective, success criteria, non-goals, **impact surface**, expected shape, and for a substantial branch the delegation convention and a contract document), writes it to the session file, creates the branch. The impact surface (public API / engine internals / tooling & docs) is what `/branch-close` reads to propose the semver bump.
- **`/branch-pulse`** (Steer) — run repeatedly mid-branch. Re-checks the captured success criteria with evidence (`npm test`, a `timeout`-bounded example run, a human eyeball), catches drift early, logs each checkpoint to the file's `## Pulse log`. Cheap and formative. Claude offers it — at least once per working session the branch stays open, and at each natural slice boundary — rather than waiting to be asked; a branch that reaches `/branch-close` unpulsed did all its verification at the boundary.
- **`/branch-close`** (Verify & close) — the single end-of-branch command. Sequences `/secrets-scan`, `/docs-sweep`, `/corpse-collector`, the version bump, `/test-coverage-check --gate`, an operator eyeball on one changed artefact, `npm run gates`, an optional Codex review, `/session-reflect`, then pushes and opens the PR **against the base branch**. Never push manually without running it first.

`/branch-close` also bumps the version in `package.json` and adds a `CHANGELOG.md` entry (`test/unit/changelog.test.js` fails the gates if the newest entry's version is not `package.json`'s, and `test/unit/plugin-manifests.test.js` if a plugin manifest disagrees). Semver is a real promise here — this package is published — so the bump follows the branch's captured impact surface: public API additions are minor, breaking changes major, everything else patch. While the version carries a prerelease tag the bump is `npm version prerelease --preid alpha` unless the operator is deliberately cutting the release.

**One open branch at a time.** Scope that drifts into adjacent work is absorbed on the current branch and recorded as a dated **Amendment** in the session file — never split into a new branch on Claude's initiative. Only the operator authorises a new branch.

**Never run `/branch-close` or create a PR unless explicitly asked.** Commit and push the outstanding changes, then stop.

Supporting skills, all invocable on their own: `/docs-sweep` (holistic doc staleness for the branch's diff), `/corpse-collector` (dead references repo-wide), `/test-coverage-check` (modules with no `test/unit/` sibling), `/secrets-scan`, `/session-reflect`, `/memory-consolidate` (housekeeping **between** branches: folds the recurring lessons out of `planning/sessions/` into a rule here or a step in a ritual skill, and stamps each log `consolidated:`). The supervision rubric the reflections score against is `.claude/skills/session-reflect/rubric.md`; the lessons already promoted out of the logs are listed in `.claude/skills/memory-consolidate/retired.md`.

## Rules

- Engine code goes in `lib/`, one responsibility per file, with a unit test in `test/unit/` (the orchestrator `lib/kiss.js` is covered by `test/integration/` instead) and an `AIKB/` doc.
- Dev tooling in `scripts/` gets a `test/unit/` test too — it is outside the engine, so nothing else exercises it. Exempt a genuinely thin file with `// @test-exempt: <reason>` near the top.
- `bin/` holds the published command line and nothing else: one thin wrapper per command, every decision in a `lib/` module with its own unit test, and the wrapper itself covered end-to-end by `test/integration/check.test.js`.
- Only `lib/logger.js` imports `colors`. Everything else logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises` — see `AIKB/kiss.md`.
- Public API changes: update `llms.txt` and `README.md`, and regenerate `types/` with `npm run types`, in the same commit. A feature an agent should reach for also goes into the skill that would use it (`plugins/*/skills/`) and gets a row in `test/unit/skill-coverage.test.js`, which is what makes that obligation fail loudly rather than surface as a question months later.
- JSDoc is the type source, and it is checked: `npm run typecheck` (a gate) runs `tsc --checkJs` over `lib/`, `scripts/` and `bin/`. A private class field annotated with `@type` needs `@private` in the _same_ JSDoc block — a second comment displaces it and the field lands in the published `types/`, which `test/unit/types.test.js` rejects.
- A regression test is accepted only once it has been seen to fail against the unfixed code. A test that has never been red is a guess about coverage, not evidence of it.
- A doc is a claim about the code, not evidence of it — check `lib/` before repeating what `AIKB/`, `llms.txt` or a `planning/plans/` document says about it, and before writing a plan step that depends on it.
- Say it at the point of decision, not in the reflection: an unanswered operator question, a risk carried by inherited work, a diff that is mostly generated files — surface it before the step that depends on it, not afterwards as a diagnosis.
