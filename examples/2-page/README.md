# 2 · page

`.page()` four ways: a view on its own (its model and controller matched by filename), the same
three parts named explicitly, an object model with an inline controller and `ext: 'xml'` to
land at `feed.xml`, and a template string used as the view itself. Nothing here is scanned —
every page is registered by hand.

## Run it

```bash
npm run eg2            # from the repo root
node 2-page.js         # from examples/
node 2-page.js --dev   # live preview on http://127.0.0.1:3001
```

## What to copy

The `.page()` call that matches your case, from `2-page.js`. The `ext` option is the one to
remember for anything that is not HTML — a feed, a manifest, a `.txt` — and the object-model
form is how a page gets data that has no file behind it.
