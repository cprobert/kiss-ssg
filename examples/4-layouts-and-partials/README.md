# 4 · layouts and partials

One layout, `{{#extend}}` and `{{#block}}`/`{{#content}}`, and a partials folder holding
`.hbs`, `.html` and `.md` files in nested folders — a partial's name is its path under
`folders.partials`, so `partials/boards/espresso.hbs` is `{{> "boards/espresso"}}`. The board
each page shows is chosen by its model and resolved at render time with a dynamic partial.

## Run it

```bash
npm run eg4                          # from the repo root
npx kiss-ssg build   # from examples/4-layouts-and-partials/
npx kiss-ssg dev     # live preview on http://127.0.0.1:3001
```

Inside this repository the build is `npm run eg4` and, to preview, `node ../../bin/kiss-ssg.js dev`
from this folder.

## What to copy

`4-layouts-and-partials/layouts/layout.hbs` as the shape of a page shell, and the
`partials: { board: … }` idiom in the model for anything a template must choose at run time.
When the key can be missing, guard the call — example 9's dynamic-partials page shows why.
