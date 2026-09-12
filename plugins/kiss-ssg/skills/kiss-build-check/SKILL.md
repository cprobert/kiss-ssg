---
name: kiss-build-check
description: Verify that a kiss-ssg site builds cleanly without publishing the output, and read the resulting report. Use after writing or editing a kiss site's build script, models, controllers or views, before declaring a build done, and when asked to "check the site builds", "verify the kiss build", "verify the kiss-ssg build", or "why is this page missing".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Check a kiss-ssg build

A dry run. It executes the site's own build script with the build staged atomically and then discarded, so nothing published is touched — you learn whether the site builds without shipping the answer.

## The command

```bash
npx kiss-ssg check <site-script> [args]
```

Arguments after the script are passed through to it, so a script that takes a season or a cohort is checked the same way you run it. `--summary` anywhere on the line is the bin's own flag (one human-readable line per report instead of JSON); put `--` before it if the site script needs that word itself.

It prints a JSON array with one report per `Kiss` instance the script created — a script that builds several outputs gets several reports:

```json
[
  {
    "ok": true,
    "mode": "check",
    "buildDir": "./public",
    "duration": 1240,
    "pages": [
      { "view": "about.hbs", "buildTo": "./public/about.html", "ok": true }
    ],
    "failures": [],
    "assets": [{ "source": "css/site.css", "target": "css/site.605b52d7.css" }],
    "sitemap": "./public/sitemap.xml"
  }
]
```

`assets` lists what the build emitted: `source` is the path a template asks `{{asset}}` for, `target` the file the build wrote under whatever `config.assets` policy is on.

Exit code is 1 if any instance reports a failure, if the script itself exits non-zero, or if no report was written at all — a script that never awaits `complete()` reports nothing, which is itself the finding. Exit 0 and `ok: true` on every report is the only passing result.

**If the installed version has no `check` bin yet**, fall back to `node <site-script>` with a `.catch` on `complete()` that prints `err.failures` (the recipe is in `node_modules/kiss-ssg/llms.txt` § Migrating from v1). Same information, no staging — so run it against a scratch `folders.build`, not over published output.

## The diff against the last record, and the note findings

A site opts into a knowledge base by recording one — `npx kiss-ssg aikb <site-script>`, which runs the same staged-and-discarded build and writes `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json`. Once a site has recorded, `check` does two more things on its own, with no flag:

- **It diffs this build against the record.** `--summary` prints the block under the report line — `+ <path>` a page the working tree adds, `- <path>` one it removes, `~ <path>` one whose bytes changed, `= N` unchanged; JSON mode carries the diff alongside the reports. `--against <file>` compares against a different report instead. The record moves only when somebody records, never on a build, a dev build or a watch rebuild, so the diff reads "since the last record", not "since the last build".
- **It evaluates the note rules**, reported as `aikb.notes` on each report and as four lines in the summary. Every controller file, URL model and pipeline step in the map is a **subject**, and the map records each one's current hash, so two of these four are about a note falling behind its subject rather than being absent:

  | Summary line     | `aikb.notes` | Means                                                                                                                                                                     |
  | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `note missing:`  | `missing`    | a subject in the map with no note under `AIKB/notes/`                                                                                                                     |
  | `note dead:`     | `dead`       | a note whose subject has left the map                                                                                                                                     |
  | `note stale:`    | `stale`      | a note carrying a `subject-hash:` stamp that no longer matches the subject's hash — the code moved, the note did not. An unstamped note is never stale                    |
  | `note dangling:` | `dangling`   | `"<note path>: <token>"` — a backticked file-looking reference, in a note or in the authored `AIKB/site.md`, that resolves to no file, page, partial, model or controller |

  Four more lines read the site's **output** rather than its notes; the two rename findings need a record, the link scan does not:

  | Line                          | Report key               | Meaning                                                                                                                                                                                                                                                                                        |
  | ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `broken link:`                | `links.broken[]`         | `<page> -> <href>`: a page wrote an internal `href`/`src`/`srcset`/`action` that resolves to no file, page, directory index or emitted asset. Absolute URLs on the site's own `siteUrl` count as internal                                                                                      |
  | `removed without redirect:`   | `redirects.removed[]`    | a page the last record wrote that this build does not, with no `aliases` entry covering its path — inbound links now 404. Needs a record; empty without one                                                                                                                                    |
  | `moved without redirect:`     | `redirects.moved[]`      | `<from> -> <to> (<id>)`: a page the record and this build share an `id` with, whose output path changed, with no `aliases` entry covering the old path. Needs a record, and an `id` on both sides — a slug rename changes a fan-out item's default id, so that case reads as a removal instead |
  | `alias collides with a page:` | `redirects.collisions[]` | an `aliases` entry a live page already answers — Netlify and Cloudflare silently ignore such a rule, so the redirect does nothing                                                                                                                                                              |

  `links` is `null` on a dev build (a scoped re-render has not rewritten every page) and when `links.check` is `false`. Fix a broken link in the template or model that wrote it; fix a removal or a move by adding the old path to that page's `aliases`, or by saying out loud that the old URL is meant to be gone.

  A site that has never recorded reports `aikb: null` and none of the note findings. The engine never writes the `subject-hash:` stamp — the `kiss-memory` plugin's `kiss-branch-close` and `kiss-memory-consolidate` skills do, copying it from `site-map.json`'s `subjects`.

**Neither changes the exit code.** They are readings, not gates — exit 0 with `ok: true` on every report is still the only passing result. And `check` never writes `AIKB/`: recording is the separate `aikb` command.

## Reading a failure

Each entry in `failures` is `{ view, buildTo, message }`.

- **`view` names the source.** A `.pages()` fan-out item appears as `<view> [item N: <slug>]`, because a page that never got as far as an output path cannot be named by one.
- **The fix is almost always in the model or the controller**, not the view — a record missing a field the template dereferences, a controller that throws on one item, a model file that does not exist. Read the failing item's model before you touch the template.
- **`Page already processed` is a slug collision**, not a render error: two pages resolved to one output path. Dedupe before registering.
- **Re-run until `ok` is true.** The check is cheap; run it after each fix rather than batching guesses.
- **Never "fix" a failure by removing the page.** Dropping the `.page()` call, or setting `generate: false`, turns a reported failure into a missing page nobody is told about — which is the exact failure mode `complete()`'s rejection exists to prevent. Fix the data or the controller, and if a page genuinely should not exist, say so and get it confirmed.

`pages` is the whole page list, so it is also how you answer "did this build produce what the last one did" — compare the list, not just the exit code.
