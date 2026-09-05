# kiss-ssg: watch-mode dependency graph (design)

Status: DRAFT — mechanics verified against the installed Handlebars, handlebars-layouts and the engine source on 2026-09-05; the "Why" evidence and the bundled-fix verdicts come from lane B of the v2 engine review (`planning/reviews/2026-09-05-v2-engine-review.md`), same day. Awaiting an adversarial critique of the design and the operator's decision to build.

## Why

Watch mode today has two speeds. A change to a page template is matched to its stack entry by view name and re-rendered alone (`lib/watcher.js`, `lib/kiss.js` `rebuildPage`). A change to anything else under `src/` — a partial, a layout, a markdown partial, a model file, a controller — triggers `_requestReplay()`: the whole site is re-registered, re-resolved and re-rendered. That is correct, serialised and coalesced, and its cost is the whole site on every save of a shared file.

The idea the operator has carried for years is to build a dependency graph during `generate()` and map it back to URLs, so a change rebuilds only what depends on it. The part never thought through — and the reason this spec exists — is the **set of things that must already be in place before a page builder can be invoked for one page**, which turns out to differ by what changed. Section "Rebuild recipes" is the answer.

**Evidence from lane B of the v2 engine review.** Of the ten watch-mode tests in `test/integration/watch.test.js`, exactly one exercises the single-page path (`rebuilds a changed page`); every other non-template change in the suite goes through full replay, and no test anywhere edits or removes a partial or layout (finding B5). The reviewer hand-verified that an edited `.hbs` partial, an edited `.md` partial and an edited layout do propagate correctly through `_replay()` today — so the replay path is correct, and this spec is purely about its cost. **No replay timing was measured.** The docs site is a handful of pages and would show nothing; a consumer-scale site such as `diploma-msc`, which the v2 spec names as a real user, is the only place a number would mean anything, and it was not available to this review. Under the repo's simplicity rule this feature waits for that number; the spec is written so the decision to build can be made on evidence rather than assumption, and so that if the number is small the right outcome — fix the bugs below, do not build the graph — is cheap to take.

Three correctness gaps sit on the same seam. Lane B confirmed all three with repro scripts, and one turned out to be a different and worse bug than hypothesised:

- **B1, confirmed P2** — a deleted partial keeps rendering from its stale registration: `registerPartials` only adds (`lib/partials.js:15`) and `_replay` re-registers without clearing `hbs.partials` (`lib/kiss.js:450`). Dev and a fresh production build disagree.
- **B2, confirmed P2** — `add` events are ignored (`lib/watcher.js`), so a new partial or page is invisible until restart; worse, a page edited to reference the new partial fails to render and the error is swallowed by `rebuildPage`'s empty catch, so the page appears stuck.
- **B3, confirmed P1, and not what was hypothesised** — a deleted or misspelled page view does not leave old output behind; `_getTemplate` (`lib/kiss-page.js:151–170`) initialises `viewText = view`, logs the read failure, and then **compiles the filename as the template**, so `public/gone.html` is overwritten with the literal text `gone.hbs` and `complete()` resolves. This reproduces on a plain build with a typo in `.page({ view })`, no watch mode involved. It is therefore a standalone engine fix, not a graph feature, and this spec only depends on it being fixed first.

A fourth lane-B finding shapes the coalescing rules below: `close()` returns while a replay is still in flight (B6, confirmed P2), so the replay keeps writing after the caller believes the instance has stopped.

## Compatibility stance

- **No public API change by default.** Everything here is engine internals. An optional additive inspector, `kiss.dependencies()` returning the reverse index, is proposed as a debugging aid and would be a minor bump; it is not required by the design.
- **Replay remains the correctness baseline.** The graph may only ever be _faster_ than a full replay, never produce different output. "Replay equivalence" (Testing, item 3) is the acceptance test, and any decision the graph cannot make falls back to `_requestReplay()`.
- **Non-watch builds are byte-identical.** Tracing is enabled only when a watcher exists (`dev: true` or `.watch()`), so a production `generate()` pays nothing and changes nothing.
- Consumers who register partials directly on `kiss.handlebars` (a documented, supported path in `llms.txt`) are outside the graph. Their partials are not files under the watcher's `src/` tree in any case; if a change the watcher sees is not in the graph, the fallback rule applies.

## Non-goals

- No static parsing of templates. Dynamic partials (`{{> (lookup this "name")}}`) are recommended by the migration notes and cannot be resolved statically; only runtime tracing sees them.
- No persistence of the graph across processes. It is rebuilt by the first `generate()` of a session.
- No incremental asset pipeline. Assets keep their own watcher and `copyAssets` path.
- No change to `.scan()` discovery semantics beyond what the "add" recipe requires.
- No public graph serialisation format.

## Architecture

### Graph model

Nodes, keyed by posix path (`utils.posixPath`) for files and by identity for the rest:

- **file** — a page view, a partial (`.hbs`/`.html`/`.md`), a layout, a model file or folder, a controller file, the entry script.
- **registration** — one entry in `Kiss._registrations`, identified by an id assigned when it is pushed. A `.pages()` fan-out is one registration producing many pages.
- **page** — one stack entry, identified by `buildTo`, and carrying its `registrationId`.

Edges:

- file → registration: the model source and the controller file, recorded in the page chain (they are resolved there, after auto-mapping; `_registrations` itself is snapshotted before auto-mapping and never carries them — verified at `lib/kiss.js:177–200`).
- file → page: the view, and every partial and layout actually invoked while that page rendered.
- registration → page: fan-out membership.

A reverse index, `Map<file, Set<registration | page>>`, is the structure a change is looked up in.

### Edge sources

**1. The page chain** (`Kiss.page()`, after `resolveModel` and `applyController`): record the model path/folder/URL and the controller file against the registration id. Two engine changes: `_registrations` entries get an id at push time, and `_preparePage` writes that id onto the stack entry (today an entry is `{ view, buildTo, page, runCount }` — verified at `lib/kiss.js:118–148`).

**2. Render tracing.** `registerPartialsFrom` (`lib/partials.js:15`) registers each partial as a string today. It will register a function instead:

```js
const compiled = hbs.compile(source) // once, at registration
hbs.registerPartial(name, (ctx, opts) => {
  trace.record(name) // name captured by closure
  return compiled(ctx, opts)
})
```

Why this works, each point verified against the installed source:

- Handlebars calls a function partial as `partial(context, options)` (`node_modules/handlebars/lib/handlebars/runtime.js:398–399`).
- handlebars-layouts' `extend` accepts a function partial and calls it as `template(context, { data })` (`node_modules/handlebars-layouts/index.js:124–132`). **It passes no `options.name`, so the tracing function must capture its name by closure and never read it from options.** This is the one caveat in the mechanism.
- Nested partials invoked from inside a partial go through the same environment, so the whole tree under a page is traced. Dynamic partials are resolved at runtime and therefore traced.
- `.md` partials are rendered to HTML at registration (`partials.js:14`) and then compiled like any other; the wrapper is identical.

**The load-bearing invariant: rendering is synchronous until the first `await`.** `KissPage.generate()` does `template(this.options)` before its first `await htmlMinify(...)` (`lib/kiss-page.js:96–104`), and `Kiss.generate()` starts every page's `generate()` from a synchronous `forEach` (`lib/kiss.js:353–367`). So page A's template has fully rendered before page B's `generate()` is entered. A single module-level "page being rendered" is therefore safe: `Kiss.generate()` sets it immediately before calling `entry.page.generate()` and clears it immediately after the call returns (which happens at the first `await`, after the render). A page's edge set is cleared before its render so a page that stops using a partial drops the edge. Section "Testing" pins this invariant with a test, because a future `await` inserted before `template()` would silently mis-attribute every edge.

**3. The view file** is known to the page directly and recorded without tracing.

### Rebuild recipes

What must already be in place before a page builder can be invoked depends on the kind of node that changed. This table is the design's centre.

| Changed node                    | Must be present first                                                                                   | Then                                                                                                                                                                      | Also                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Partial or layout (change)      | That one partial re-read and re-registered                                                              | Re-render every dependent page via `rebuildPage`                                                                                                                          | Nothing else: the model, controller and page set are unchanged                 |
| Partial or layout (unlink)      | `hbs.unregisterPartial(name)`                                                                           | Re-render dependent pages — they now fail loudly, which is correct                                                                                                        | Fixes "stale partial on delete"                                                |
| Partial or layout (add)         | Register it                                                                                             | Full replay                                                                                                                                                               | A page may have been failing for its absence; the graph cannot know which      |
| Page view (change)              | Nothing                                                                                                 | `rebuildPage` for its stack entries                                                                                                                                       | Today's fast path, unchanged                                                   |
| Page view (unlink)              | Nothing                                                                                                 | Remove its stack entries, delete their output and `.json` siblings, re-run sitemap if ever requested                                                                      | Fixes "deleted page leaves output"                                             |
| Page view (add)                 | Nothing                                                                                                 | If the site called `.scan()` (a `_scanned` flag), register it via `page({ view })` and render; otherwise ignore, since explicitly registered sites do not want auto-pages | Fixes "added files ignored" for scanned sites                                  |
| Model file or folder            | Fresh model resolved, controller re-applied (`fresh`), pages re-prepared **for that registration only** | Render them; run orphan cleanup scoped to the registration's previous `buildTo` set; re-run sitemap                                                                       | Fan-out count may change, so the unit is the registration, not the stack entry |
| Controller file                 | As model, with the `fresh` cache-bust                                                                   | As model                                                                                                                                                                  | As model                                                                       |
| Entry script                    | Nothing you can trust                                                                                   | Full replay                                                                                                                                                               | Unchanged                                                                      |
| Unknown file (not in the graph) | —                                                                                                       | Full replay                                                                                                                                                               | The fallback rule                                                              |

Two consequences the current code does not yet support and the design adds: **per-registration orphan cleanup** (today `_replay` diffs the whole previous stack against the whole new stack, `lib/kiss.js:444, 464–475`), and **re-running one registration** (a `_replayRegistration(id)` that mirrors `_replay`'s loop for a single entry, reusing `_replaying`/`fresh`).

### The fallback rule

Any decision the graph cannot make, any node it does not know, and any error inside the graph code itself resolves to `_requestReplay()`. The graph is an optimisation layered on a correct baseline and is never allowed to be the reason output is wrong. It is also never silent: a fallback logs why at `notice` level so a developer can see the graph declining to act.

### Where it lives

- **New:** `lib/dependency-graph.js` — pure. `addEdge`, `clearPage`, `dependentsOf(file)`, `kindOf(file, config)`, `recipeFor(kind, event)`. No I/O, no Handlebars, no Kiss. Per repo rules it ships with `test/unit/dependency-graph.test.js`, `AIKB/dependency-graph.md` and a `CLAUDE.md` table row in the same commit.
- `lib/partials.js` — registers tracing functions; takes the trace sink via `deps` like it takes `markdown` and `logger` today.
- `lib/kiss.js` — registration ids on stack entries; set/clear the current page around each render; `_rebuildFor(event, path)` replacing the watcher's `view === lookup` decision; `_replayRegistration(id)`; per-registration orphan cleanup; the `_scanned` flag.
- `lib/watcher.js` — stops deciding what to rebuild and hands `(event, path)` to `Kiss`. The assets watcher and `isInside` are unchanged.

## Behaviour fixes bundled

All verdicts are in (lane B, 2026-09-05). Two of the original three live on the seam this design touches and are cheaper to fix inside it than around it. The third is a prerequisite, not a bundle.

1. **B1 stale partial on delete (P2)** — recipe "Partial or layout (unlink)": `hbs.unregisterPartial(name)` then re-render dependents. Until the graph exists, the interim fix is to clear every registered partial before `_replay()` re-registers, so the registered set mirrors disk rather than accumulating every state disk has ever been in.
2. **B2 added files ignored (P2)** — recipes "(add)" for partials, layouts and pages. Interim fix without the graph: route `add`/`addDir` to `rebuildSite()` once the watcher's `ready` promise has resolved (the initial-scan `add` burst is the reason the guard exists, so gate on readiness, not on the event name).
3. **B3 missing view compiles its own filename (P1) — prerequisite, fix first and separately.** `_getTemplate` must return `null` (taking the existing "Skipping page generation" branch) or, better, throw so `generate()` records it in `_failures` and `complete()` rejects as documented. Only once a missing view is a loud failure does the "Page view (unlink)" recipe make sense: remove the stack entries, delete the output and `.json` siblings, re-run the sitemap.
4. **B6 `close()` during a replay (P2)** — folded into "The fallback rule" and the coalescing rule: `close()` sets a `_closing` flag that `_requestReplay()` honours, closes the watchers first, awaits `_replayInFlight` in a loop (the `.finally()` can start one more), then closes the dev server.

## Testing

The v2 rewrite's discipline applies: characterise, then change.

1. **Characterisation tests first, before any engine code**, in `test/integration/watch.test.js`, asserting **rendered output**, not just that a rebuild fired: edit a partial; edit a layout; edit a `.md` partial; delete a partial; delete a page view; add a partial; add a page view with and without `.scan()`. Today no test anywhere edits or removes a partial or layout in watch mode (verified across `test/` on 2026-09-05). These tests pin current behaviour, including the three bugs, so the fixes flip them deliberately.
2. **Unit tests** for `lib/dependency-graph.js`: edge bookkeeping, reverse lookup, recipe selection for every row of the table, and the unknown-node fallback.
3. **Replay equivalence.** For a fixture site, apply a scripted sequence of edits (one of each recipe kind) twice: once under the graph, once with the graph disabled and every event forced to full replay. After each step the build directory contents must be identical. This is the acceptance test and stays in the suite permanently.
4. **Invariant tests.** (a) A test that wraps `template` to assert the current-page marker is set and unchanged for the whole synchronous render. (b) Two pages using different partials rendered in one `generate()` attribute each partial to the right page. (c) A page that stops using a partial loses the edge on its next render.
5. The existing ten watch tests stay green and unedited.

## Rollout order

Each step lands as its own green commit with `npm run gates`, and `/branch-pulse` runs between steps.

1. Characterisation tests (Testing 1). Merges alone; changes no behaviour.
2. Registration ids and the `registrationId` field on stack entries. No behaviour change.
3. `lib/dependency-graph.js` with its unit tests, AIKB doc and `CLAUDE.md` row. Unused by the engine yet.
4. Tracing partials and page-chain edges; graph populated but **unused** for dispatch. Visible in dev mode via the debug `.json` sibling so it can be inspected. No behaviour change; tests assert graph contents.
5. Switch watcher dispatch to `_rebuildFor` with the replay fallback; add the replay-equivalence test.
6. Bundled fixes (unlink and add recipes), flipping the characterisation tests from step 1.

Any step that fails its equivalence or invariant test is reverted, not patched forward.

## Model delegation

Following `planning/specs/2026-09-02-v2-solid-refactor-design.md` § Model delegation: Fable writes no implementation code; one task per subagent; self-contained briefs; Fable reviews from `git diff` and test output.

| Tier                                         | Work items                                                                                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sonnet** — mechanical, well-specified      | Characterisation tests from Fable's case list (step 1); `lib/dependency-graph.js` from this spec's function list plus its unit tests (step 3); `AIKB/dependency-graph.md`, `CLAUDE.md` row, `llms.txt` note if the inspector ships        |
| **Opus** — judgement about current behaviour | Registration ids and stack-entry field (step 2); tracing wrapper in `partials.js` and page-chain edges (step 4); `_rebuildFor`, `_replayRegistration`, per-registration orphan cleanup, watcher hand-off (step 5); bundled fixes (step 6) |
| **Fable** — cross-cutting                    | This spec; the invariant and equivalence test designs; review of every diff; the final equivalence run on a consumer-scale site                                                                                                           |

## Open risks

- **The sync-render invariant is one `await` away from breaking.** A future edit that awaits anything before `template(this.options)` in `KissPage.generate()` silently mis-attributes every edge. The invariant test is the guard; `AIKB/kiss-page.md` must state the rule.
- handlebars-layouts `embed` was not verified, only `extend`; verify it takes function partials the same way at step 4.
- Handlebars caches compiled string partials in `options.partials` (`runtime.js:82–84`); after `unregisterPartial` confirm nothing else holds a compiled copy.
- A model that is a URL cannot be watched; its registration only ever rebuilds by replay or by a dependent controller/template change. Document, do not solve.
- Coalescing: a burst of events across kinds must still collapse to one replay if any of them demands one. `_requestReplay` already coalesces replays; the per-page recipes must not race a queued replay. Rule: while `_replayInFlight` is set, every event is folded into the queued replay.
- Scope of benefit is unproven until measured on a real site. If lane B and a measurement show replay cost is negligible for every known consumer, the right decision is to bundle the three fixes and **not** build the graph. This spec is written to make that decision cheap.

Impact surface: engine internals; one new `lib/` module; optional minor public API.
