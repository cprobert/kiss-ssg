# AIKB — this site's knowledge base

Half of this folder is written by the build and half is written by people, and the two must never be confused.

## Generated — never edit these

| File              | Written on every record                               |
| ----------------- | ----------------------------------------------------- |
| `site-map.md`     | the pages, models, controllers, partials and subjects |
| `site-map.json`   | the same map, as data — including each subject’s hash |
| `last-build.json` | that build's report, minus its timings                |

`kiss-ssg` rewrites all three every time the knowledge base is recorded (`npx kiss-ssg aikb <build-script>`), so an edit to any of them lasts until the next record. They are byte-stable across two identical records: a diff here is a real change to the shape of the site, which is why this folder is committed.

`last-build.json` is also the baseline `npx kiss-ssg check <build-script>` diffs against, which says which pages the working tree would add, remove or change since the last record.

## Authored — the engine never writes these

Everything under `notes/`, and `site.md`. The map says _what_ the site is; these say **why**, which no build can work out.

A note is wanted for each of the three things that carry judgement:

| Subject                | Its note                                       |
| ---------------------- | ---------------------------------------------- |
| a controller file      | `notes/controllers/<file, no .js>.md`          |
| a model fetched by URL | `notes/models/<host><path>.md` (query dropped) |
| an asset pipeline step | `notes/pipeline/<step name>.md`                |

Plain pages, partials and `.json` models are deliberately not subjects: a note saying "renders the about page" is noise, and a rule that demands one teaches people to write noise. An inline controller and an object model have no file to attach a note to, so they cannot be subjects either.

`site.md` is the one page about the whole site rather than any one subject — curated, evergreen, and the first thing to read when you come back to this repository. Five sections: **What this site is and who for** · **How it is deployed** · **Conventions** · **Standing gotchas** · **Retired feedback**. Nothing generates it and nothing enforces its shape; the `kiss-memory-consolidate` skill maintains it, folding the durable lessons out of old session logs so they stop being re-read one by one.

## The stamp

Every subject in `site-map.json` carries a `hash` — sha1 of the controller file's bytes, or of the pipeline step's command (a URL model has none: its id _is_ the subject). Copy that hash into the note's frontmatter as `subject-hash` whenever you write or review the note, and the next build can tell you when the subject has moved on without it.

A note with no stamp is not wrong — it is simply unstamped, and never reported stale. The engine never writes a stamp; only you (or the skill closing a piece of work) do.

## What every build reports

| Finding    | Means                                                       |
| ---------- | ----------------------------------------------------------- |
| `missing`  | a subject nobody has explained                              |
| `dead`     | a note under `notes/` whose subject is gone                 |
| `stale`    | the note's stamp is not the subject's current hash          |
| `dangling` | a note (or `site.md`) cites a file that resolves to nothing |

None of the four fails a build or changes an exit code — they are findings, printed by `npx kiss-ssg check --summary` and carried on the build report under `aikb.notes`. Write the missing ones; delete or rewrite the dead ones; re-read the subject and restamp the stale ones; fix or drop the dangling references.

Only backticked text that looks like a file reference is checked for dangling — something with a `/` in it, or ending in a known extension, and with no spaces or punctuation that a path cannot hold. Prose in backticks is left alone.

## The note template

```markdown
---
subject-hash: <the subject’s hash, from site-map.json>
---

## What it does

One paragraph. What a reader would otherwise have to infer from the code.

## Why it is this way

The decision and the constraint behind it — the upstream that returns a
different shape on Sundays, the ordering the client asked for, the field
that is optional in the feed and required on the page.

## Gotchas

What bites. What broke last time. What looks wrong but is deliberate.
```
