# AIKB — this site's knowledge base

Half of this folder is written by the build and half is written by people, and the two must never be confused.

## Generated — never edit these

| File              | Written on every build                      |
| ----------------- | ------------------------------------------- |
| `site-map.md`     | the pages, models, controllers and partials |
| `site-map.json`   | the same map, as data                       |
| `last-build.json` | that build's report, minus its timings      |

`kiss-ssg` rewrites all three on every build, so an edit to any of them lasts until the next one. They are byte-stable across two identical builds: a diff here is a real change to the shape of the site, which is why this folder is committed.

`last-build.json` is also the baseline for `npx kiss-ssg check --against AIKB/last-build.json <build-script>`, which says which pages the working tree would add, remove or change.

## Authored — the engine never writes these

Everything under `notes/`. The map says _what_ the site is; a note says **why**, which no build can work out.

A note is wanted for each of the three things that carry judgement:

| Subject                | Its note                                       |
| ---------------------- | ---------------------------------------------- |
| a controller file      | `notes/controllers/<file, no .js>.md`          |
| a model fetched by URL | `notes/models/<host><path>.md` (query dropped) |
| an asset pipeline step | `notes/pipeline/<step name>.md`                |

Plain pages, partials and `.json` models are deliberately not subjects: a note saying "renders the about page" is noise, and a rule that demands one teaches people to write noise.

Every build reports two findings — a **missing** note (a subject nobody has explained) and a **dead** note (a note whose subject is gone). Neither fails the build. Write the missing ones; delete or rewrite the dead ones.

## The note template

```markdown
## What it does

One paragraph. What a reader would otherwise have to infer from the code.

## Why it is this way

The decision and the constraint behind it — the upstream that returns a
different shape on Sundays, the ordering the client asked for, the field
that is optional in the feed and required on the page.

## Gotchas

What bites. What broke last time. What looks wrong but is deliberate.
```
