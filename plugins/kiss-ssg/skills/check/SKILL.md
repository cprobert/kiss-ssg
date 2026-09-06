---
name: check
description: Verify that a kiss-ssg site builds cleanly without publishing the output, and read the resulting report. Use after writing or editing a kiss site's build script, models, controllers or views, before declaring a build done, and when asked to "check the site builds", "verify the kiss build", or "why is this page missing".
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

## Reading a failure

Each entry in `failures` is `{ view, buildTo, message }`.

- **`view` names the source.** A `.pages()` fan-out item appears as `<view> [item N: <slug>]`, because a page that never got as far as an output path cannot be named by one.
- **The fix is almost always in the model or the controller**, not the view — a record missing a field the template dereferences, a controller that throws on one item, a model file that does not exist. Read the failing item's model before you touch the template.
- **`Page already processed` is a slug collision**, not a render error: two pages resolved to one output path. Dedupe before registering.
- **Re-run until `ok` is true.** The check is cheap; run it after each fix rather than batching guesses.
- **Never "fix" a failure by removing the page.** Dropping the `.page()` call, or setting `generate: false`, turns a reported failure into a missing page nobody is told about — which is the exact failure mode `complete()`'s rejection exists to prevent. Fix the data or the controller, and if a page genuinely should not exist, say so and get it confirmed.

`pages` is the whole page list, so it is also how you answer "did this build produce what the last one did" — compare the list, not just the exit code.
