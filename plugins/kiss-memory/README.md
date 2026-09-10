# kiss-memory plugin for Claude Code

A site outlives the context window that built it. Four skills, all prefixed `kiss-`, that give a [kiss-ssg](https://github.com/cprobert/kiss-ssg) site a memory: one that briefs a returning or new developer on what the site is and what bites, and three that run a piece of work from intent to reflection so the memory keeps being written.

They read what the build already knows. A site that calls `.aikb()` writes `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json` on every build — the pages, their views, models, controllers and partials, and the report of the build that produced them — and `AIKB/notes/**` holds the half a machine cannot write: why the controller is like that, why that URL is fetched, why the pipeline has that step. `npx kiss-ssg check --against AIKB/last-build.json <script>` turns the pair into a diff: exactly which pages this change adds, removes or alters. These skills sequence those two facts; the API itself stays in `node_modules/kiss-ssg/llms.txt`, so nothing here can drift from the engine you have installed.

## Install

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-memory@kiss-ssg
```

The first command registers this repository as a marketplace (skip it if you already added it for the `kiss-ssg` plugin); the second installs this plugin from it.

Skills are then available as `/kiss-memory:<name>` — but you don't have to invoke them by name. Each skill's frontmatter `description` is written as "use when…" triggers, which is what Claude Code matches against your request. Say "catch me up on this site" or "we're done, ship it" and the matching skill loads without you naming it.

## Skills

| Skill           | Invoke                       | What it does                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiss-catch-up` | `/kiss-memory:kiss-catch-up` | The returning-developer briefing. Runs the check against the last committed build, then reads the site map, the notes, the last build and the three most recent session logs: what the site is and who for, how it is built, what changed lately, what was left open, known gotchas — every statement labelled **generated** or **recollection**, and every absent source named |
| `kiss-open`     | `/kiss-memory:kiss-open`     | Frame: reads the last three sessions' Feedback for lessons that never stuck, interviews for objective, criteria phrased as pages added/removed/changed, non-goals and impact surface, writes `planning/sessions/<date>-<slug>.md`, creates or adopts the branch                                                                                                                 |
| `kiss-pulse`    | `/kiss-memory:kiss-pulse`    | Steer: re-runs the check with `--against`, reads the page diff against the criteria — including every line no criterion asked for — logs one dated line to the pulse log and decides continue / adjust / amend / ready-to-close                                                                                                                                                 |
| `kiss-close`    | `/kiss-memory:kiss-close`    | Verify: build green, diff matches the intent, every controller, URL model and pipeline step the change touched has a note that moved with it, a real build so `AIKB/` regenerates and is committed, the reflection written into the session file against the shipped `rubric.md`, then push. PR only when asked                                                                 |

`kiss-close/rubric.md` is the supervision rubric the reflection scores against — seven behavioural dimensions and four competency levels. It is a verbatim copy of the one this repo uses on itself, and a unit test keeps the two from drifting.

## Requirements

kiss-ssg installed in the site being worked on (`npm install kiss-ssg --save-dev`), on Node ≥22.12, and a build script that calls `.aikb()` — without it there is no `AIKB/` to read and the skills fall back to git and the build report alone, saying so as they go. `kiss-open`, `kiss-pulse` and `kiss-close` also assume the site is in git and keeps its session logs in `planning/sessions/`.

For building the site itself rather than remembering it, install the sibling `kiss-ssg` plugin from the same marketplace.
