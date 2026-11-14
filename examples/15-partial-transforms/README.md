# 15 · partial transforms

A partial's file extension says what kiss does with it. This example uses all three kinds: a
type kiss knows (`.md`), and two the site teaches it in `config.transforms` (`.csv` and
`.recipe`).

- **This week** (`src/partials/this-week.md`): Markdown that is a template first. It reads the
  page's model, links to the other pages with `{{link "prices"}}`, and calls a partial,
  `{{> "callout" tone="good" …}}`. Then it is rendered as Markdown.
- **Prices** (`src/partials/prices/*.csv`): plain CSV, the kind any spreadsheet exports,
  rendered as tables. The page calls `{{> "prices/bar" caption="At the bar"}}`.
- **Brew guide** (`src/partials/recipes/*.recipe`): a few `name: value` lines and one step per
  line, rendered as recipe cards. Each one is compiled first, so a step can link with
  `{{link}}`.

## Run it

```bash
npm run eg15           # from the repo root
node router.js         # from examples/15-partial-transforms/
node router.js --dev   # live preview on http://127.0.0.1:3001
```

Links are root-relative, so preview it served (`--dev`, or any static server rooted at
`public/`), not opened off the file system.

## What to look at

- `router.js`: `transforms: { csv, recipe }`. Each key is an extension, so with it a `.csv` or
  `.recipe` file under `src/partials/` is a partial like any other.
- `transforms.js`: the two transforms. Each is `{ render, compile? }`: `render(output, ctx)`
  gets the partial's output and returns the HTML inserted into the page.
  - `csv` sets `compile: false`, so it gets the file exactly as written, braces and all, and it
    escapes every cell. It reads its caption from `ctx.hash`, the call's arguments.
  - `recipe` leaves `compile` at its default, so the file runs as a template first, and it
    takes the card's id from `ctx.name`.

  They are in a module of their own because a function written inside `router.js` cannot be
  imported, so it cannot be tested.

- `src/partials/this-week.md`: the blank lines around `{{> "callout" …}}` are needed. A
  partial call alone on its line takes the line's newline with it, and without the blank line
  after it Markdown would run the next paragraph into the callout's HTML.

## Not shown here

A transform can also have a `setup`, awaited once before the first page renders: the place to
load a library that starts asynchronously, such as a syntax highlighter. GUIDE.md § Partial
transforms has an example. It runs once per process, so it is not the place to read the
site's content: under `--dev` an edit to that file would not be seen.
