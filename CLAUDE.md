# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node (ESM, Node ≥22.12). The engine is the `lib/` folder — `lib/kiss.js` is the entry point and orchestrator; every other `lib/*.js` module has one responsibility. There is no build step, bundler, or transpilation.

`llms.txt` at the repo root is an LLM-oriented API cheat-sheet (per the [llmstxt.org](https://llmstxt.org) convention) that ships in the npm package so an agent working in a project that depends on `kiss-ssg` can read `node_modules/kiss-ssg/llms.txt` instead of the source. Keep it in sync with `lib/kiss.js` when the public API changes.

`package.json`'s `files` whitelist keeps the published tarball to `lib/`, `llms.txt` and `AIKB/` (plus the always-included `README.md`, `LICENSE` and `package.json`) — `AIKB/` ships deliberately, so an agent in a consuming project can read the per-module notes alongside `llms.txt`; `planning/`, `test/`, `src/`, `docs/`, `examples/` and the configs are all excluded.

`src/` is **not** engine code: it is the source of this repo's own docs site (`docs.js` builds it into `docs/`). Treat `docs/` as build output. Design specs, implementation plans and session logs live in `planning/` (`planning/specs/`, `planning/plans/`, `planning/sessions/`) — never under `docs/`, which `docs.js` empties on every run. `scripts/` holds dev tooling that never ships (the `files` whitelist excludes it).

## Architecture knowledge base

Detailed per-module notes live in `AIKB/` — read the relevant doc before changing that module, and update it in the same commit. `test/aikb.test.js` fails if a module has no doc, a doc is orphaned (its `lib/` module no longer exists), a doc is missing from this table, or a doc drops a template heading.

| Module                             | File                         | AIKB doc                      |
| ---------------------------------- | ---------------------------- | ----------------------------- |
| Orchestrator / public API          | `lib/kiss.js`                | `AIKB/kiss.md`                |
| Page renderer                      | `lib/kiss-page.js`           | `AIKB/kiss-page.md`           |
| Logger                             | `lib/logger.js`              | `AIKB/logger.md`              |
| Config + folder derivation         | `lib/config.js`              | `AIKB/config.md`              |
| Built-in Handlebars helpers        | `lib/handlebars-helpers.js`  | `AIKB/handlebars-helpers.md`  |
| Partials / layouts registration    | `lib/partials.js`            | `AIKB/partials.md`            |
| Assets + Sass                      | `lib/assets.js`              | `AIKB/assets.md`              |
| Model resolution                   | `lib/model-resolver.js`      | `AIKB/model-resolver.md`      |
| Controller resolution              | `lib/controller-resolver.js` | `AIKB/controller-resolver.md` |
| Sitemap                            | `lib/sitemap.js`             | `AIKB/sitemap.md`             |
| Dev server                         | `lib/dev-server.js`          | `AIKB/dev-server.md`          |
| File watcher                       | `lib/watcher.js`             | `AIKB/watcher.md`             |
| String/path utils                  | `lib/utils.js`               | `AIKB/utils.md`               |
| Cross-cutting: testing conventions | `test/`                      | `AIKB/testing.md`             |

## Commands

```bash
npm test                 # Vitest, single run
npm run test:watch
npm run test:coverage
npm run lint             # ESLint (flat config, eslint.config.js)
npm run format           # Prettier, write; format:check to verify
npm run gates            # the four pre-PR gates: test, lint, format, pack
node scripts/base-branch.mjs   # print the integration branch this work merges into
node docs                # regenerate docs/, minified, and exit; --dev keeps the old live-preview server running (does not exit, Ctrl-C to stop)
npm run eg1 … eg6        # run an example (examples/*.js); most start a dev server and don't exit on their own
```

`.nvmrc` pins the Node line for development. Note the split: the package's runtime floor is Node 22.12 (`engines.node`), but `npm run lint`'s `@eslint/js` needs 22.13 — on 22.12 exactly, tests pass and lint refuses to run.

Prettier config is in `.prettierrc` (no semicolons, single quotes) and `.prettierignore`. `.hbs` templates are **not** prettier-formatted: its Handlebars parser rejects `{{> "partial"}}`, which every template here uses.

## Pipeline in one paragraph

`new Kiss(config)` resolves config, creates a per-instance Handlebars env (with handlebars-layouts) and Remarkable renderer, ensures folders, queues an asset copy, registers helpers and partials, and in dev mode starts the server and watcher. `.page()`/`.pages()`/`.scan()` queue pages: each becomes one caught promise on `_promises` that resolves the model, runs the controller, and pushes a prepared `KissPage` onto `_stack`. Nothing renders until `.generate()`, which waits for `_promises`, renders each stack entry once, awaits the writes, then fires its callback. `.complete()` drains everything (including work queued by callbacks) and resolves. `.sitemap()` waits for `_promises` and writes `sitemap.xml`. Under `.watch()`, a whole-site rebuild replays that pipeline from the logged `_registrations` (`Kiss._replay()`) instead of just re-rendering the stack, so edited models and controllers take effect. Full detail: `AIKB/kiss.md`.

## Git workflow

Two automated nets, and they run the same script. A **pre-commit hook** (`.githooks/pre-commit`, activated per-clone by the npm `prepare` script) blocks a commit whose staged files fail prettier — it checks staged blob content, not the working tree, so it is immune to the CRLF noise of a Windows checkout. **CI** (`.github/workflows/ci.yml`) runs `npm run gates` on every push and PR to `main` and `v2`, and `prepublishOnly` runs the same gates before `npm publish` can ship anything. Neither replaces the ritual below: CI tells you a branch is broken, the ritual is what sweeps the docs, checks coverage, bumps the version and writes the reflection.

**The base branch is resolved, not assumed.** `node scripts/base-branch.mjs` prints the integration branch the current work merges back into — `main`, or the major line in development (`v2` today). Every skill and script below uses it, so nothing has to be edited when v2 lands on main. Override with `git config kiss.baseBranch <name>` or `KISS_BASE_BRANCH` — an override in effect names itself on stderr (stdout stays the bare ref), and one that resolves to no ref is reported and ignored in favour of the algorithm.

A branch runs as three beats, all reading one committed artefact — `planning/sessions/<date>-<slug>.md`:

- **`/branch-open`** (Frame) — run on the base branch. Interviews for intent (objective, success criteria, non-goals, **impact surface**, expected shape), writes it to the session file, creates the branch. The impact surface (public API / engine internals / tooling & docs) is what `/branch-close` reads to propose the semver bump.
- **`/branch-pulse`** (Steer) — run repeatedly mid-branch. Re-checks the captured success criteria with evidence (`npm test`, a `timeout`-bounded example run, a human eyeball), catches drift early, logs each checkpoint to the file's `## Pulse log`. Cheap and formative.
- **`/branch-close`** (Verify & close) — the single end-of-branch command. Sequences `/secrets-scan`, `/docs-sweep`, `/corpse-collector`, the version bump, `/test-coverage-check --gate`, `npm run gates`, an optional Codex review, `/retrospective`, then pushes and opens the PR **against the base branch**. Never push manually without running it first.

`/branch-close` also bumps the version in `package.json` and adds a `CHANGELOG.md` entry. Semver is a real promise here — this package is published — so the bump follows the branch's captured impact surface: public API additions are minor, breaking changes major, everything else patch. While the version carries a prerelease tag the bump is `npm version prerelease --preid alpha` unless the operator is deliberately cutting the release.

**One open branch at a time.** Scope that drifts into adjacent work is absorbed on the current branch and recorded as a dated **Amendment** in the session file — never split into a new branch on Claude's initiative. Only the operator authorises a new branch.

**Never run `/branch-close` or create a PR unless explicitly asked.** Commit and push the outstanding changes, then stop.

Supporting skills, all invocable on their own: `/docs-sweep` (holistic doc staleness for the branch's diff), `/corpse-collector` (dead references repo-wide), `/test-coverage-check` (modules with no `test/unit/` sibling), `/secrets-scan`, `/retrospective`. The supervision rubric the reflections score against is `.claude/skills/retrospective/rubric.md`.

## Rules

- Engine code goes in `lib/`, one responsibility per file, with a unit test in `test/unit/` (the orchestrator `lib/kiss.js` is covered by `test/integration/` instead) and an `AIKB/` doc.
- Dev tooling in `scripts/` gets a `test/unit/` test too — it is outside the engine, so nothing else exercises it. Exempt a genuinely thin file with `// @test-exempt: <reason>` near the top.
- Only `lib/logger.js` imports `colors`. Everything else logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises` — see `AIKB/kiss.md`.
- Public API changes: update `llms.txt` and `README.md` in the same commit.
