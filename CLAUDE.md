# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kiss-ssg` is a small, dependency-driven static site generator for Node (ESM, Node ≥22.12). The engine is the `lib/` folder — `lib/kiss.js` is the entry point and orchestrator; every other `lib/*.js` module has one responsibility. There is no build step, bundler, or transpilation.

`llms.txt` at the repo root is an LLM-oriented API cheat-sheet (per the [llmstxt.org](https://llmstxt.org) convention) that ships in the npm package so an agent working in a project that depends on `kiss-ssg` can read `node_modules/kiss-ssg/llms.txt` instead of the source. Keep it in sync with `lib/kiss.js` when the public API changes.

`src/` is **not** engine code: it is the source of this repo's own docs site (`docs.js` builds it into `docs/`). Treat `docs/` as build output. Design specs and implementation plans live in `planning/` (never under `docs/`, which `docs.js` empties).

## Architecture knowledge base

Detailed per-module notes live in `AIKB/` — read the relevant doc before changing that module, and update it in the same commit. `test/aikb.test.js` fails if a module has no doc, a doc is orphaned (its `lib/` module no longer exists), a doc is missing from this table, or a doc drops a template heading.

| Module | File | AIKB doc |
|---|---|---|
| Orchestrator / public API | `lib/kiss.js` | `AIKB/kiss.md` |
| Page renderer | `lib/kiss-page.js` | `AIKB/kiss-page.md` |
| Logger | `lib/logger.js` | `AIKB/logger.md` |
| Config + folder derivation | `lib/config.js` | `AIKB/config.md` |
| Built-in Handlebars helpers | `lib/handlebars-helpers.js` | `AIKB/handlebars-helpers.md` |
| Partials / layouts registration | `lib/partials.js` | `AIKB/partials.md` |
| Assets + Sass | `lib/assets.js` | `AIKB/assets.md` |
| Model resolution | `lib/model-resolver.js` | `AIKB/model-resolver.md` |
| Controller resolution | `lib/controller-resolver.js` | `AIKB/controller-resolver.md` |
| Sitemap | `lib/sitemap.js` | `AIKB/sitemap.md` |
| Dev server | `lib/dev-server.js` | `AIKB/dev-server.md` |
| File watcher | `lib/watcher.js` | `AIKB/watcher.md` |
| String/path utils | `lib/utils.js` | `AIKB/utils.md` |
| Cross-cutting: testing conventions | `test/` | `AIKB/testing.md` |

## Commands

```bash
npm test                 # Vitest, single run
npm run test:watch
npm run test:coverage
npm run lint             # ESLint (flat config, eslint.config.js)
node docs                # regenerate docs/ (dev mode, starts a server — does not exit on its own, Ctrl-C to stop)
npm run eg1 … eg6        # run an example (examples/*.js); most start a dev server and don't exit on their own
```

Prettier config is in `.prettierrc` (no semicolons, single quotes).

## Pipeline in one paragraph

`new Kiss(config)` resolves config, creates a per-instance Handlebars env (with handlebars-layouts) and Remarkable renderer, ensures folders, queues an asset copy, registers helpers and partials, and in dev mode starts the server and watcher. `.page()`/`.pages()`/`.scan()` queue pages: each becomes one caught promise on `_promises` that resolves the model, runs the controller, and pushes a prepared `KissPage` onto `_stack`. Nothing renders until `.generate()`, which waits for `_promises`, renders each stack entry once, awaits the writes, then fires its callback. `.complete()` drains everything (including work queued by callbacks) and resolves. `.sitemap()` waits for `_promises` and writes `sitemap.xml`. Full detail: `AIKB/kiss.md`.

## Rules

- Engine code goes in `lib/`, one responsibility per file, with a unit test in `test/unit/` and an `AIKB/` doc.
- Only `lib/logger.js` imports `colors`. Everything else logs through the injected `logger`.
- Never push an unhandled promise onto `Kiss._promises` — see `AIKB/kiss.md`.
- Public API changes: update `llms.txt` and `README.md` in the same commit.
