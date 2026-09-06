---
name: new-site
description: Build a new static site with kiss-ssg from a description of what it should contain. Use when scaffolding a kiss-ssg site from scratch, adding a whole new section to one, or when asked to "make a site with kiss", "set up kiss-ssg", or "write the build script for this site".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# New kiss-ssg site

Build the site from the package's own shipped docs. They are the contract; this skill only sequences them, so read them rather than trusting a summary — including this one.

## Execution instructions

### 1. Confirm the engine is there

`node_modules/kiss-ssg/package.json` must exist; read its `version` so you know which API you are coding against. If it is missing, `npm install kiss-ssg --save-dev` before writing a line of build script.

### 2. Read the contract

Read `node_modules/kiss-ssg/llms.txt` — it is the API cheat-sheet that ships in the tarball, short enough to read whole. Pay particular attention to:

| Section             | What you need from it                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The opening summary | The chainable pipeline: pages are _queued_ by `.page()`/`.pages()`/`.scan()`, rendered by `.generate()`, awaited by `.complete()` |
| `## API`            | Which of `.page()` / `.pages()` / `.scan()` fits each part of the site, and what a controller may return                          |
| `## Config`         | `folders`, `cleanBuild`, `siteUrl`, `fetch`, `assets` — set these deliberately, do not inherit defaults by accident               |
| `## Helpers`        | `markdown`, `asset`, `canonical`, `absUrl`, `isActive`, `env` and friends — use the built-in before writing your own              |

Per-module detail, if you need it, is in `node_modules/kiss-ssg/AIKB/`.

### 3. Copy an exemplar by shape

`node_modules/kiss-ssg/examples/README.md` lists nine runnable sites in two tiers. Pick the one whose _situation_ matches and copy its structure — its folder layout, its script shape, its controller pattern — never its content.

| Shape                                                                      | Exemplar                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| One build per edition/season/version, each into its own folder             | `node_modules/kiss-ssg/examples/7-versioned-outputs.js`                                                     |
| Pages fanned out from data you do not control, validated in the controller | `node_modules/kiss-ssg/examples/8-data-fed-site.js`                                                         |
| A v1 project being moved to v2                                             | `node_modules/kiss-ssg/examples/9-migrated-from-v1.js` — and use the `migrate-v1` skill instead of this one |
| A single narrower question (which call, which option, which helper)        | Examples 1–6, the feature reference                                                                         |

Run the exemplar before you change anything, so you know what its output and exit code are meant to look like. Example 8 exits 1 on purpose.

### 4. Write the build script

End the chain at `await kiss.complete()`, inside a `try`/`catch` that prints every entry of `err.failures` and sets a non-zero exit code — the recipe is in `llms.txt` § Migrating from v1, and running code is `node_modules/kiss-ssg/examples/9-migrated-from-v1/pages/await-complete.hbs` (its README indexes the recipes by built page name).

Three mistakes real consumer sites made, all of which passed review before they bit:

- **A chain that ends at `.generate()` exits 0 on a broken build.** Page failures surface only through `complete()`'s rejection. A deploy script that does not await it ships a half-built tree and reports success.
- **Registering helpers on the global `handlebars` module renders nothing, silently.** Handlebars is per-instance in v2 — use `kiss.handlebars`. The symptom is an empty element where content should be, with a green build and no warning; nothing will tell you.
- **Two pages claiming one output path fail the build** (`Page already processed`). If two sources can produce the same slug, dedupe before registering — do not rely on the engine to pick a winner.

### 5. Build, then verify

Build it, then run the `check` skill (`/kiss-ssg:check`) and do not declare the site done until it reports `ok: true`. A build you have not verified is a build you have not finished.
