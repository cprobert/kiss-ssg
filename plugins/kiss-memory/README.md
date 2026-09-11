# kiss-memory plugin for Claude Code

A site outlives the context window that built it. Four skills, all prefixed `kiss-`, that give a [kiss-ssg](https://github.com/cprobert/kiss-ssg) site a memory: one that briefs a returning or new developer on what the site is and what bites, and three that run a piece of work from intent to reflection so the memory keeps being written.

They read what the build already knows. `npx kiss-ssg aikb <build-script>` **records** it: the build runs staged and discarded, publishing nothing, and writes `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json` — the pages, their views, models, controllers and partials, and the report of the build that produced them. A failed build is refused, so a record only ever describes a site that worked. Beside them, `AIKB/notes/**` holds the half a machine cannot write: why the controller is like that, why that URL is fetched, why the pipeline has that step.

A site opts in by recording once. From then on `npx kiss-ssg check --summary <build-script>` diffs the working tree against that record with no flag asked for — exactly which pages this change adds, removes or alters — and reports which subjects still have no note. Nothing else writes the folder: not a build, not the dev server, not a watch rebuild, not the check. The baseline moves only when somebody records, which `kiss-close` does once per closed piece of work, so the diff answers "since this work opened" rather than "since my last build". These skills sequence those facts; the engine's own contract stays in `node_modules/kiss-ssg/llms.txt`, so nothing here can drift from the version you have installed.

## Install

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-memory@kiss-ssg
```

The first command registers this repository as a marketplace (skip it if you already added it for the `kiss-ssg` plugin); the second installs this plugin from it.

Skills are then available as `/kiss-memory:<name>` — but you don't have to invoke them by name. Each skill's frontmatter `description` is written as "use when…" triggers, which is what Claude Code matches against your request. Say "catch me up on this site" or "we're done, ship it" and the matching skill loads without you naming it.

## Skills

| Skill           | Invoke                       | What it does                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiss-catch-up` | `/kiss-memory:kiss-catch-up` | The returning-developer briefing. Runs the check, whose diff against the last record comes for free, then reads the site map, the notes, the last build and the three most recent session logs: what the site is and who for, how it is built, what changed lately, what was left open, known gotchas — every statement labelled **generated** or **recollection**, and every absent source named |
| `kiss-open`     | `/kiss-memory:kiss-open`     | Frame: reads the last three sessions' Feedback for lessons that never stuck, interviews for objective, criteria phrased as pages added/removed/changed, non-goals and impact surface, writes `planning/sessions/<date>-<slug>.md`, creates or adopts the branch — and records the knowledge base if the site has never had one, so the branch has a baseline                                      |
| `kiss-pulse`    | `/kiss-memory:kiss-pulse`    | Steer: re-runs the check, reads the page diff against the criteria — including every line no criterion asked for — logs one dated line to the pulse log and decides continue / adjust / amend / ready-to-close                                                                                                                                                                                    |
| `kiss-close`    | `/kiss-memory:kiss-close`    | Verify: build green, diff matches the intent, every controller, URL model and pipeline step the change touched has a note that moved with it, then `npx kiss-ssg aikb` — the one moment the baseline moves — and the recorded folder committed, the reflection written into the session file against the shipped `rubric.md`, then push. PR only when asked                                       |

`kiss-close/rubric.md` is the supervision rubric the reflection scores against — seven behavioural dimensions and four competency levels. It is a verbatim copy of the one this repo uses on itself, and a unit test keeps the two from drifting.

## Requirements

kiss-ssg installed in the site being worked on (`npm install kiss-ssg --save-dev`), on Node ≥22.12, and a site that has been recorded at least once with `npx kiss-ssg aikb <build-script>` — that single command is the whole opt-in, and it needs no change to the build script. Until it has been run there is no `AIKB/` to read and no baseline to diff against, so the skills fall back to git and the build report alone, saying so as they go; `kiss-open` offers to record on the spot, and `kiss-close` records every time. `kiss-open`, `kiss-pulse` and `kiss-close` also assume the site is in git and keeps its session logs in `planning/sessions/`.

For building the site itself rather than remembering it, install the sibling `kiss-ssg` plugin from the same marketplace.
