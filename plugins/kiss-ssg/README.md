# kiss-ssg plugin for Claude Code

Four skills, all prefixed `kiss-` so they're easy to pick out in a skill list, that teach Claude to set up, extend, migrate and verify [kiss-ssg](https://github.com/cprobert/kiss-ssg) sites. They carry no copy of the API: each one points at the docs the npm package ships (`node_modules/kiss-ssg/llms.txt`, `node_modules/kiss-ssg/examples/`, `node_modules/kiss-ssg/AIKB/`), so the guidance cannot drift away from the engine you have installed.

A sibling plugin in the same marketplace, `kiss-memory`, covers the other half — remembering a site rather than building one: a catch-up briefing over the `AIKB/` a build writes, and a site-shaped open/pulse/close loop.

## Install

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-ssg@kiss-ssg
```

The first command registers this repository as a marketplace; the second installs the plugin from it. See the root [README's "Using an AI coding agent?" section](../../README.md#using-an-ai-coding-agent) for the same steps in context.

Skills are then available as `/kiss-ssg:<name>` — but you don't have to invoke them by name. Each skill's frontmatter `description` is written as "use when…" triggers (specific phrasing, symptoms and file types), which is what Claude Code — and any other agent that reads plugin skill descriptions — matches against your request to decide whether to reach for it on its own. Ask to "add a page to this kiss-ssg site" or say a build is failing, and the matching skill loads without you naming it.

## Skills

| Skill             | Invoke                      | What it does                                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiss-new-site`   | `/kiss-ssg:kiss-new-site`   | Builds a new site from a description, or a whole new section on an existing one: confirms the install, reads `llms.txt`, copies the exemplar under `examples/` whose shape matches, writes a script that awaits `complete()`, then verifies with `kiss-check`. Names the three mistakes real consumer sites made |
| `kiss-add-page`   | `/kiss-ssg:kiss-add-page`   | Adds a single page to a site that already builds, or updates an existing page's view, model or controller — including how `.watch()` scopes a live-reload rebuild to just what changed — then verifies with `kiss-check`                                                                                         |
| `kiss-migrate-v1` | `/kiss-ssg:kiss-migrate-v1` | Migrates a v1 site to v2 against `llms.txt` § Migrating from v1 and the runnable `examples/9-migrated-from-v1/`, then compares the new output against the old — byte-identical is the goal for a content-only migration                                                                                          |
| `kiss-check`      | `/kiss-ssg:kiss-check`      | Runs `npx kiss-ssg check <site-script>` — a build staged atomically and discarded — and reads the JSON report: what each failure names, where the fix usually is, and why removing the page is never the fix                                                                                                     |

## Requirements

kiss-ssg installed in the project being worked on (`npm install kiss-ssg --save-dev`), on Node ≥22.12. The skills read the package's own docs from `node_modules/`, so an out-of-date install teaches out-of-date guidance — check the version first, which is the first step of `kiss-new-site`.
