---
name: kiss-site-migrate
description: Migrate a site built on kiss-ssg v1 to v2. Use when a project's build script targets kiss-ssg 1.x, when a v2 upgrade fails with an unhandled AggregateError or silently empty output, or when asked to "upgrade kiss", "migrate to kiss-ssg v2", "migrate kiss-ssg", or "why did my kiss site break after the upgrade".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Migrate a v1 kiss site to v2

The migration is short — real consumer sites needed two or three edits each — but each one is silent if you miss it. Work from the shipped recipes, not from memory.

## Execution instructions

### 1. Check the floor, then read the recipes

Node ≥22.12 first: v2 will not install or run below it, so bump any pinned dev Node version before touching code.

Then read `node_modules/kiss-ssg/llms.txt` § Migrating from v1 — every recipe, including the "unchanged in v2" list, which is there to stop you rewriting code that still works. The runnable version of the same recipes is `node_modules/kiss-ssg/examples/9-migrated-from-v1/`; its README maps one page to each v1 idiom it replaces.

### 2. Point every future session at the contract

Open the project's `CLAUDE.md` (create it if the project has none) and make sure it carries this line:

```markdown
@node_modules/kiss-ssg/llms.txt
```

A migrated site is one that will be edited again; the import makes every later Claude Code session read the v2 contract instead of remembering v1. Add the line if it is missing, keep it if it is there, and say which you did.

### 3. Diff the site's script against each recipe

Go recipe by recipe against the site's own build script, controllers and helpers, and record for each: applies / does not apply. The two consumer migrations both found most recipes did not apply — knowing that is the point of the pass.

The three that actually bit, in the order they cost the most:

| Symptom in the site                                                                        | What to change                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete()` called callback-style, or a chain ending at `.generate()`                     | Attach a `.catch` to the `complete()` promise, print each `err.failures[]` entry, set `process.exitCode = 1`. A failed build **never runs `complete()`'s callback**, so anything that lived there — sitemap, index, deploy trigger — has to run in the catch too |
| A helper reading `require('handlebars').partials` or registering on the global module      | Pass `kiss.handlebars` into the helper and register there. This one fails **silently**: the build stays green and the element renders empty                                                                                                                      |
| Two sources that can claim one output path (a fan-out registered last so v1 would skip it) | Dedupe the slugs yourself before registering. v2 fails the build with `Page already processed` — v1's tolerance was an idiom, and it is gone                                                                                                                     |

Also check `livereloadPort` if the project runs more than one dev site: without it, a second site's pages poll the first site's reload server.

### 4. Build, verify, then compare against the old output

Run the build. Run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`) and fix until it reports `ok: true`.

Then compare the page list and the page bodies against the previous v1 build's committed output. **For a content-only migration the goal is byte-identical output** — one consumer test diffed v2-built pages against the v1-built ones and got an empty diff, which is the strongest evidence a migration is complete. A difference is a finding to explain, not noise to accept: it is either a v2 improvement you can name, or a regression you have not found yet.

A page that is missing rather than different usually means a failing controller or a model the new build could not resolve — see the `check` skill on reading a failure.
