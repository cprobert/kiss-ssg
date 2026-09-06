# 4 · layouts and partials

One layout, `{{#extend}}` and `{{#block}}`/`{{#content}}`, and a partials folder holding
`.hbs`, `.html` and `.md` files in nested folders — a partial's name is its path under
`folders.partials`, so `partials/boards/espresso.hbs` is `{{> "boards/espresso"}}`. The board
each page shows is chosen by its model and resolved at render time with a dynamic partial.

## Run it

```bash
npm run eg4                          # from the repo root
node 4-layouts-and-partials.js       # from examples/
node 4-layouts-and-partials.js --dev # live preview on http://127.0.0.1:3001
```

## What to copy

`4-layouts-and-partials/layouts/layout.hbs` as the shape of a page shell, and the
`partials: { board: … }` idiom in the model for anything a template must choose at run time.
When the key can be missing, guard the call — example 9's dynamic-partials page shows why.
