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
