# 2 · page

`.page()` four ways: a view on its own (its model and controller matched by filename), the same
three parts named explicitly, an object model with an inline controller and `ext: 'xml'` to
land at `feed.xml`, and a template string used as the view itself. Nothing here is scanned —
every page is registered by hand.

## Run it

```bash
npm run eg2            # from the repo root
npx kiss-ssg build     # from examples/2-page/
npx kiss-ssg dev       # live preview on http://127.0.0.1:3001
```

Inside this repository the build is `npm run eg2` and, to preview, `node ../../bin/kiss-ssg.js dev`
from this folder.

## What to copy

The `.page()` call that matches your case, from `router.js`. The `ext` option is the one to
remember for anything that is not HTML — a feed, a manifest, a `.txt` — and the object-model
form is how a page gets data that has no file behind it.
