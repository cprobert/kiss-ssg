# 5 · helpers

The six helpers kiss registers on every instance, all six doing real work on one page:
`markdown` (a block, a model string and a `.md` partial), `sass` (a file and an inline block
compiled into the page head), `offset`, `isActive`, `env` and `stringify`. It also runs on its
own ports, so it can be served alongside another example.

## Run it

```bash
npm run eg5            # from the repo root
node 5-helpers.js      # from examples/
node 5-helpers.js --dev  # live preview on http://127.0.0.1:8080
```

## What to copy

The helper call you need, from `5-helpers/pages/index.hbs`. `stringify` is the one to reach for
first when a page is wrong — it dumps whatever is in scope. Register your own helpers on
`kiss.handlebars`, the instance's private Handlebars environment; example 9 shows what happens
when a migrated project reaches for the global module instead.
