# Partial transforms (design)

Status: **ROADMAP — not started.** Written 2026-10-24 from a feasibility
conversation; listed in [`planning/ROADMAP.md`](../ROADMAP.md). Whoever picks it
up should run `/branch-open` against this document and re-check every claim
about current behaviour below against `lib/` first — they describe the engine
at `db164de` (2.8.0).

## Background

The conversation started wider: could Handlebars become a default view engine
behind an adapter, so a site could choose Liquid, Nunjucks or EJS? It is
feasible, but the coupling is deep — the dependency graph rides on Handlebars'
`data` frame through every partial and layout call, the built-in helpers are
written against `SafeString`/`options.hash`/`options.data`, layouts come from
`handlebars-layouts`, `kiss.handlebars` is public API — and the lasting cost is
that every helper, doc snippet and skill instruction multiplies per engine,
against `llms.txt`'s 16k budget. **The operator decided not to pursue
alternative view engines.** Pages and layouts stay Handlebars.

What survived is the smaller idea: an extension point at the **component**
level — partials — where kiss already has a hard-coded transform table.

## Current behaviour (measured 2026-10-24)

`registerPartials` (`lib/partials.js:129`) runs five fixed passes, and the
extension decides the processing:

| Extension            | Processing                                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| `.html`, `.hbs`      | compiled as Handlebars (`tracingPartial`)                                        |
| `.md`                | rendered by Remarkable **at registration**, then compiled (`lib/partials.js:19`) |
| `.txt`               | escaped once, never compiled (`literalPartial`)                                  |
| `.hbs` under layouts | compiled                                                                         |

Markdown also appears a second time, in the opposite order: the `{{markdown}}`
helper (`lib/handlebars-helpers.js:42`) runs inside a render, on model data.

### The defect this design fixes

Because a `.md` partial is Markdown _first_, Remarkable escapes `"` before
Handlebars sees the source. Run against the real `remarkable` and `handlebars`
packages:

```
input:     See [the course]({{link "courses/intro"}}) and {{title}} and {{> "nav"}}
after md:  …({{link &quot;courses/intro&quot;}})… {{&gt; &quot;nav&quot;}}
after hbs: Parse error on line 1
```

`{{title}}` survives; any helper or partial call with a quoted argument does
not, and a Markdown link whose URL is a `{{ }}` expression is not parsed as a
link. Since 2026-10-25 `GUIDE.md` (beside the list of partial types) and
`llms.txt` name it as a trap, with the `.hbs` + `{{#markdown}}` workaround;
single-quoted arguments survive, `{{>` never does. The shipped
`.md` partials (`examples/*/src/partials/newsletter.md`,
`examples/9-migrated-from-v1/src/partials/sourcing-note.md`) are plain prose,
which is why nothing has tripped on it.

## Proposal

Turn the fixed passes into a **table of transforms keyed by partial
extension**, with today's behaviour as the built-in entries and the `.md`
order flipped.

```js
new Kiss({
  transforms: {
    // built-ins, shown for shape — a site never writes these
    md: { render: (html, ctx) => kiss.remarkable.render(html) },
    txt: { compile: false, render: escape },
    // a site's own
    adoc: {
      setup: async () => {
        /* load the converter once */
      },
      render: (html, { name, file, page, context }) => toHtml(html),
    },
  },
})
```

- **`compile`** (default `true`): whether the file is compiled as Handlebars
  before `render` sees it. `false` is `.txt`'s behaviour — the file's own
  characters.
- **`render(output, ctx)`**: called **per partial call, after Handlebars**,
  with the rendered string and `{ name, file, page, context }` (`page` is the
  `kissPage` already in the data frame). Returns a string, inserted raw.
- **`setup()`** (optional, may be async): awaited once before the first render.
- `.html` and `.hbs` are the identity transform and stay unlisted.

### Why per call, after Handlebars

- It fixes the defect: `{{link "x"}}` is `/x/` before Markdown sees it.
- Components take parameters: `{{> callout tone="warn"}}` works in a `.md`
  partial.
- `DEFAULT_MARKDOWN` already sets `html: true`, so HTML that Handlebars inserts
  passes through Remarkable.

**The constraint:** Handlebars renders synchronously, so `render` must return a
string, never a promise. Anything async goes in `setup()`. Its promise must be
caught before it joins `Kiss._promises` (`AIKB/kiss.md`'s rule), and a failed
setup fails every page that calls a partial of that extension, named in the
report, rather than failing silently.

### Optional second surface

`{{#transform "md"}}…{{/transform}}`, a block helper over the same table, for
content written inline in a page. It generalises the `{{markdown}}` helper to
any registered transform. Not required for the first cut; decide at
`/branch-open`.

### What does not change

- **Dependency graph.** The transform runs inside `tracingPartial`'s wrapper,
  so `graph.record(page, name)` still fires and scoped rebuilds still work.
- **Watcher.** `partialNameFor` (`lib/partials.js:98`) and the partial branch
  of `lib/rebuild.js:441` do not filter by extension, so a `.adoc` edit
  already re-registers and re-renders its dependents.
- **Pages, layouts, the page-level output chain** (minify, live reload, the
  Markdown copy, link and audit extraction).

## Behaviour changes (minor bump, upgrade note)

1. **`.md` partials render after Handlebars.** Text that Handlebars inserts is
   now read as Markdown: a value containing `*` or `_` can become emphasis, and
   an inserted line indented four spaces becomes a code block. Escaped output
   (`&amp;`) is unaffected. A partial that relied on Markdown-first (none
   known) moves to `.hbs` with `{{#markdown}}` or the block form.
2. **Partial name collisions fail the build.** `foo.md` and `foo.hbs` both
   register `foo`; today the fixed pass order silently picks the `.hbs` one,
   and `test/unit/partials.test.js:79` pins that. With an open list of
   extensions the order would be arbitrary, so a collision becomes a build
   failure naming both files.
3. **The shipped examples' prose is wrong afterwards.** Every
   `newsletter.md` and `sourcing-note.md` says "kiss renders `.md` partials to
   HTML as it registers them". They ship in the tarball as statements of
   practice, so they change in the same commit (add a `CONTRADICTIONS` row for
   the old sentence — see CLAUDE.md's Rules).

## Touch list (expected)

- `lib/partials.js` — the table, the per-call render, collision detection.
- `lib/config.js` — `transforms` resolved over the built-ins; validation of
  unknown keys and of `render`/`setup` types.
- `lib/kiss.js` — the Remarkable instance becomes the built-in `md` transform;
  `setup()` promises queued, caught.
- Tests: `test/unit/partials.test.js` (the collision test flips; it must be
  seen red first), `test/integration/markdown.test.js` (a `{{link "id"}}` in a
  `.md` partial renders — red against today's code), a site transform with an
  async `setup`.
- Docs: `GUIDE.md` (partials section and the `config.markdown` paragraph at
  ~line 378–390, which describes registration-time rendering), one index line
  in `llms.txt`, `README.md`, `AIKB/partials.md` and `AIKB/config.md`,
  `types/` via `npm run types`, `CHANGELOG.md`, and the `kiss-site-migrate`
  skill's upgrade note.

## Open questions

- Should `render` output be memoised on `(name, output)`? Markdown now runs on
  every call rather than once; measure with `npm run bench` before adding a
  cache.
- Does a transform's `render` get the call's hash arguments separately, or only
  through `context`?
- Do layouts take transforms? Proposed: no — layouts stay `.hbs`.
- Markdown _pages_ (`about.md` as a view) become easy once Markdown runs after
  Handlebars. Out of scope here; worth a roadmap line of its own if wanted.

## Non-goals

- Alternative view engines (decided against, above).
- A page-level output-transform chain.
- Changing the `{{markdown}}` helper's behaviour.
