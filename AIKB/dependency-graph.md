# dependency-graph.js

## Responsibility

A pure, per-instance index of which pages rendered which partials, populated as a side effect of rendering and read by `Kiss._handleChange` to decide which pages an edited partial or layout can affect.

## Public interface

- `new DependencyGraph()`
- `record(page, partial)` — adds the edge both ways; idempotent. `page` is the page's `buildTo`, `partial` its registered name.
- `clearPage(page)` — removes every edge of that page. A partial it used stays known, possibly with no dependents.
- `clear()` — forgets everything (a whole-site replay discards the stack, so the graph goes with it).
- `dependentsOf(partial)` → `string[] | null` — sorted page keys, or **`null` if the partial was never recorded**. `null` and `[]` mean different things to the caller: `null` re-renders every page (the safe fallback), `[]` re-renders none.
- `usesOf(page)` → `string[]` — sorted partial names that page recorded.
- `size` — how many partials are known.
- `toJSON()` → `{ [partial]: pages[] }`, keys and values sorted, so `dependency-graph.json` is stable across builds.

## Depends on

Nothing.

## Depended on by

`lib/kiss.js` (owns one per instance; dispatch and the verbose-dev dump), `lib/partials.js` (records), `lib/kiss-page.js` (clears before render; lists in the debug sibling).

## Non-obvious behavior

- **It is filled by rendering, never by parsing.** A partial is registered as a function that records the invoking page (`lib/partials.js`), so a `{{> (lookup this "name")}}` chosen at render time, a partial reached through another partial, and a layout reached through `{{#extend}}` are all recorded. An inline partial (`{{#*inline}}`) shadows the registered one and records nothing — correct, the page does not depend on the file at that call site.
- **The page identity travels in Handlebars' data frame**, not in shared state: `KissPage.generate()` renders with `{ data: { kissPage: buildTo } }` and the recording wrapper reads `options.data.kissPage`. Handlebars copies the frame into every nested partial call and handlebars-layouts passes `{ data }` through `extend`/`embed`, so the attribution is correct however many pages render at once or in whatever order. There is no "current page" marker and no ordering invariant.
- **`null` is the fallback signal.** A partial edited before any page has rendered it (a fresh dev session mid-first-build, a partial only a page that failed would reach) has no record; the dispatcher then re-renders every entry and logs a notice naming the file. A partial whose pages all stopped using it is known with `[]` dependents and re-renders nothing.
- Keys are `buildTo`, which is stable under `dev: true` (`cleanBuild: 'atomic'` degrades to `true` there, so no staging paths).
