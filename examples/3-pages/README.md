# 3 · pages

`.pages()` is `.page()` with an array: point its model at `models/roasts/` and kiss builds one
page per JSON file from a single view, with the controller deriving each slug. The listing page
is then built from the same array the fan-out already resolved, via `getModelByID` in the
`generate` callback, so the index can never disagree with the detail pages.

## Run it

```bash
npm run eg3            # from the repo root
node 3-pages.js        # from examples/
node 3-pages.js --dev  # live preview on http://127.0.0.1:3001
```

## What to copy

The `.pages()` block in `3-pages.js` — the `path` option (a fan-out does not infer an output
folder from the view's location) and the controller returning `slug`, without which the pages
land as `roast-1`, `roast-2` and so on. For a fan-out over data that can be malformed, copy
example 8 instead: it adds the validation this one does not need.
