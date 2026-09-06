# kiss-ssg plugin for Claude Code

Three skills that teach Claude to build, migrate and verify [kiss-ssg](https://github.com/cprobert/kiss-ssg) sites. They carry no copy of the API: each one points at the docs the npm package ships (`node_modules/kiss-ssg/llms.txt`, `node_modules/kiss-ssg/examples/`, `node_modules/kiss-ssg/AIKB/`), so the guidance cannot drift away from the engine you have installed.

## Install

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-ssg@kiss-ssg
```

The first command registers this repository as a marketplace; the second installs the plugin from it. Skills are then available as `/kiss-ssg:<name>`, and Claude will also reach for them on its own when the work matches the description.

## Skills

| Skill        | Invoke                 | What it does                                                                                                                                                                                                                                                     |
| ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-site`   | `/kiss-ssg:new-site`   | Builds a new site from a description: confirms the install, reads `llms.txt`, copies the exemplar under `examples/` whose shape matches, writes a script that awaits `complete()`, then verifies with `check`. Names the three mistakes real consumer sites made |
| `migrate-v1` | `/kiss-ssg:migrate-v1` | Migrates a v1 site to v2 against `llms.txt` § Migrating from v1 and the runnable `examples/9-migrated-from-v1/`, then compares the new output against the old — byte-identical is the goal for a content-only migration                                          |
| `check`      | `/kiss-ssg:check`      | Runs `npx kiss-ssg check <site-script>` — a build staged atomically and discarded — and reads the JSON report: what each failure names, where the fix usually is, and why removing the page is never the fix                                                     |

## Requirements

kiss-ssg installed in the project being worked on (`npm install kiss-ssg --save-dev`), on Node ≥22.12. The skills read the package's own docs from `node_modules/`, so an out-of-date install teaches out-of-date guidance — check the version first, which is the first step of `new-site`.
