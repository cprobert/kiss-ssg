# 9 · migrated from v1

An exemplar site: every recipe in `llms.txt` § Migrating from v1, as one script that runs. It is
the _after_ — it builds clean and exits 0 — so where a recipe is about a v1 failure mode the
page demonstrates the guarded v2 form rather than leaving a broken build behind.

## Run it

```bash
npm run eg9                     # from the repo root
node 9-migrated-from-v1.js      # from examples/
node 9-migrated-from-v1.js --dev  # live preview on http://127.0.0.1:3009
```

Eleven pages, exit 0. One warning is expected and is the point of its recipe:
`lookup: 'partial' is undefined in dynamic-partials.hbs`.

## What to copy

Whichever recipe you are migrating — each is a few lines in `9-migrated-from-v1.js` with a
comment naming the v1 idiom it replaces, and a page explaining it:

| Page                       | The v1 idiom it replaces                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| `await-complete.html`      | A chain ending at `generate()`, or `complete(cb)` with no `.catch`         |
| `folders.html`             | `folders.root` and `folders.static`, neither of which any module ever read |
| `handlebars-instance.html` | A helper reading `require('handlebars').partials`, empty under v2          |
| `dynamic-partials.html`    | `{{> (lookup … )}}` on a key one record does not carry                     |
| `duplicate-paths.html`     | Two sources claiming one output path, deduped before either is registered  |
| `pure-controllers.html`    | A controller mutating an object model in place                             |
| `smaller-changes.html`     | The `utils` named export, `export default` controllers, callback ordering  |

Start with `await-complete.html`. It is the migration that costs the most if it is missed,
because a script that never awaits `complete()` looks exactly like a working one.

## The knowledge base it ships

`9-migrated-from-v1/AIKB/` is committed — the exemplar of what a kiss site writes down about
itself. Nothing in `9-migrated-from-v1.js` writes it; one command does, and only from a build
that passed:

```bash
cd examples && npx kiss-ssg aikb 9-migrated-from-v1.js --summary
```

That run builds the site into a staging folder, throws the build away (it publishes nothing, the
way `check` does) and writes four files: `README.md` (written once, then left alone),
`site-map.md` and `site-map.json` (the pages, their models and controllers, the partials each page
rendered), and `last-build.json` (that build's report, minus its timings). All four are
byte-stable, so recording twice over an unchanged site leaves `git status` clean and any diff in
the folder is a real change to the shape of the site.

Recording is a ceremony, not a side effect of building: run it when a piece of work is finished
and commit the folder. Everything in between reads it — `npx kiss-ssg check 9-migrated-from-v1.js`
diffs this build against `last-build.json` without being asked, and says which pages the working
tree would add, remove or change since the folder was last recorded.

`AIKB/notes/controllers/shelf-item.md` is the other half, and the engine never writes it: why the
slug is derived where it is, and what bites. A record reports which subjects still have no note —
a controller **file**, a **URL** model or an asset pipeline step — and this site has exactly one
subject, so `aikb.notes.missing` is empty. The `pure-controllers.html` page's controller is a
function written inline in the build script: there is no file to attach a note to, so it is not a
subject.
