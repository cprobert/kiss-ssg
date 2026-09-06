# 1 · scan

`.scan()` walks `pages/` and registers every `.hbs` file it finds, matching each one to the
model and controller of the same name — `pages/about/us.hbs` finds `models/about/us.json` with
no line of script naming either. It is the whole of a conventional site: add a file, get a page.

## Run it

```bash
npm run eg1            # from the repo root
node 1-scan.js         # from examples/
node 1-scan.js --dev   # live preview on http://127.0.0.1:3001
```

## What to copy

`1-scan.js` — twelve lines, and the shortest complete kiss script there is. Copy the folder
convention with it: `pages/`, `models/` and `controllers/` mirroring each other under
`folders.src`, with `layouts`, `partials` and `assets` named explicitly when they live
somewhere else (here, the shared theme in `_shared/`).
