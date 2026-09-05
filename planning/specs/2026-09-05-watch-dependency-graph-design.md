# kiss-ssg: watch-mode rebuild scoping (design)

Status: READY FOR DECISION. Revised 2026-09-05 after an adversarial critique (scratchpad `spec-critique.md`, an Opus review commissioned against the first draft). The critique changed the recommendation; the first draft's dependency graph is now the _last_ of three steps and may never be built.

## Recommendation, up front

1. **Land the three watch-mode correctness fixes first, as their own change.** None needs a graph. Lane B of the engine review confirmed each with a repro (`planning/reviews/2026-09-05-v2-engine-review.md`, B1, B2, B3).
2. **Then land the no-graph optimisation.** A partial or layout edit cannot change the page set, any page's options, the sitemap or any output path. So the correct rebuild is: re-register partials, then `rebuildPage` every entry already in `_stack`. That skips the expensive half of a replay — re-reading every model, re-importing every controller with a cache-bust, and re-fetching every URL model over the network (`AIKB/kiss.md:45`) — and it is unconditionally correct because the stack is unchanged by construction. About five lines in `lib/kiss.js` and one in `lib/watcher.js`.
3. **Measure before building anything traced.** Split a replay's cost on a consumer-scale site into _registration_ (model, controller, fetch) and _render_ (template, minify, write). If registration dominates, step 2 already took the win and the graph is not worth building. Only if render dominates, build the tracer — and then only the partial→page half described under "Architecture", which drops registration ids, per-registration cleanup, fan-out renumbering, and most of the locking.

The operator's original idea — a graph built on generate and mapped back to URLs — is preserved in step 3. What this spec adds is the discovery that most of the pain it targets can be removed without it.

## Why

Watch mode today has two speeds. A change to a page template is matched to its stack entry by view name and re-rendered alone (`lib/watcher.js`, `lib/kiss.js` `rebuildPage`). A change to anything else under `src/` — a partial, a layout, a markdown partial, a model file, a controller — triggers `_requestReplay()`: the whole site is re-registered, re-resolved and re-rendered. That is correct, serialised and coalesced, and its cost is the whole site on every save of a shared file.

**Evidence from lane B of the v2 engine review.** Of the ten watch-mode tests in `test/integration/watch.test.js`, exactly one exercises the single-page path; every other non-template change goes through full replay, and no test anywhere edits or removes a partial or layout (B5). The reviewer hand-verified that an edited `.hbs` partial, an edited `.md` partial and an edited layout do propagate correctly through `_replay()` today — the replay path is correct, and this spec is purely about its cost. **No replay timing was measured.** The docs site is a handful of pages and would show nothing; a consumer-scale site such as `diploma-msc`, which the v2 spec names as a real user, is the only place a number would mean anything, and it was not available to this review.

Three correctness gaps sit on the same seam, all confirmed by lane B with repro scripts:

- **B1, P2** — a deleted partial keeps rendering from its stale registration: `registerPartials` only adds (`lib/partials.js:15`) and `_replay` re-registers without clearing (`lib/kiss.js:450`). Dev and a fresh production build disagree.
- **B2, P2** — `add` events are ignored (`lib/watcher.js:60`), so a new partial or page is invisible until restart; worse, a page edited to reference the new partial fails to render and the error is swallowed by `rebuildPage`'s empty catch, so the page appears stuck.
- **B3, P1** — a deleted or misspelled page view does not leave old output behind; `_getTemplate` (`lib/kiss-page.js:151–170`) initialises `viewText = view`, logs the read failure, and then **compiles the filename as the template**, so `public/gone.html` is overwritten with the literal text `gone.hbs` and `complete()` resolves. Reproduces on a plain build with a typo in `.page({ view })`; no watch mode involved. A standalone engine fix, and a prerequisite for anything below.

A fourth finding shapes the queueing rules: `close()` returns while a replay is still in flight (B6, P2), so the instance keeps writing after the caller believes it has stopped.

## Compatibility stance

- **Steps 1 and 2 change no public API.** One documented surface changes shape under step 3 and is called out there: `kiss.handlebars.partials`, which `llms.txt:63` and `README.md:266` tell consumers to read from a custom helper. Today an entry is a string until the first render and a compiled function after it (Handlebars writes the compiled partial back into the same object — `node_modules/handlebars/lib/handlebars/runtime.js:83–86`, and that object _is_ `hbs.partials` because `mergeIfNeeded(undefined, env.partials)` returns it uncopied, `runtime.js:184–192, 256–260`). Under step 3 it is a function always. Nobody can safely depend on the current shape, but the repo's blast-radius rule says name it.
- **Replay remains the correctness baseline.** Anything scoped may only ever be _faster_ than a full replay, never produce different output. "Replay equivalence" (Testing, item 3) is the acceptance test for step 2 and step 3 alike, and any decision scoped logic cannot make falls back to `_requestReplay()`.
- **Non-watch builds are byte-identical.** Nothing here runs unless a watcher exists.

## Non-goals

- No static parsing of templates. Dynamic partials (`{{> (lookup this "name")}}`) are recommended by the migration notes and cannot be resolved statically.
- No persistence of any graph across processes.
- No incremental asset pipeline; assets keep their own watcher.
- **No model or controller scoping.** The first draft specified recipes for model and controller changes, with registration ids, per-registration orphan cleanup and a `_replayRegistration`. The critique showed that is where nearly all the complexity and all the regression risk live — positional fan-out slugs renumber on any model change so every page of the registration must re-render anyway; a `Map<file, …>` index misses a folder-model's files unless it prefix-matches; stack entries must be removed before re-preparation or `_preparePage`'s `buildTo` dedupe (`lib/kiss.js:135–138`) rejects every one with `Page already processed`; `_failures` is only ever reset by `_replay` (`lib/kiss.js:448`) so a scoped failure would poison every later `complete()`; and `_promises`/`_generating` stay bounded in a long session only because replays reset them (`AIKB/kiss.md:48`). A model edit must re-resolve and re-render its own pages regardless; the only saving is not re-resolving everyone else's. Deferred until someone can point at a site where that saving is measured.
- No public graph serialisation format.

## Step 1 — the fixes (no graph)

Each is watcher- or partials-local, independently testable with the characterisation tests in "Testing", and lands before any optimisation.

- **B3 missing view.** `_getTemplate` must not fall through to compiling the filename. Return `null` (taking the existing "Skipping page generation" branch) or, better, throw so `generate()` records it in `_failures` and `complete()` rejects as documented — a missing view is a build failure, not a skip. Keep the inline-template path keyed on `!view.endsWith('.hbs')`, which is what actually distinguishes a template string from a filename.
- **B1 stale partial.** Make the registered set mirror disk: before `registerPartials()` re-runs, unregister every name the previous pass produced that the new pass does not. Not per-file: `registerPartials` runs four passes in order — partials/`html`, partials/`md`, partials/`hbs`, layouts/`hbs` (`lib/partials.js:24–29`) — all deriving the same extension-stripped name, so `foo.html`, `foo.md`, `foo.hbs` and a layout `foo` collide and last-write-wins. Re-registering or unregistering by single file would clobber or remove the winner. Re-running all four passes is a glob plus a handful of `readFileSync`s; it is cheap and it is the only recipe that is correct under collisions. `hbs.unregisterPartial` deletes from the aliased map cleanly; the critique probed that the next render then throws `The partial foo could not be found` and a re-register wins.
- **B2 added files.** Delete the `event.includes('add')` guard at `lib/watcher.js:60` and route `add`/`addDir` (outside `pagesDir` and inside it alike) to `rebuildSite()`. The guard exists because chokidar's initial scan emits an `add` burst; gate on the watcher's `ready` promise having resolved instead of on the event name. A new page `.hbs` on a `.scan()`-registered site then appears on the next replay; on an explicitly registered site the replay is a harmless no-op for it.
- **B3 watch-side.** On `unlink` of a page view, do not `rebuildPage` — route to a full replay. Two reasons the critique supplied: editors that save by rename emit `unlink` then `add`, and any recipe that deletes output on `unlink` permanently loses an explicitly-registered page on an atomic save; and `_replay` already owns orphan cleanup. Fixing `_getTemplate` first means the replay then fails the missing page loudly rather than writing its filename.
- **B6 `close()` during a replay.** `close()` sets a `_closing` flag that `_requestReplay()` honours, closes the watchers first so no new requests arrive, awaits `_replayInFlight` in a loop (the `.finally()` can start one more), then closes the dev server.

## Step 2 — the no-graph optimisation

On `change` of any file under `folders.partials` or `folders.layouts`: re-run `registerPartials()` (with the unregister-vanished behaviour from step 1), then `rebuildPage` every entry in `_stack`, tracked on `_generating` exactly as today's single-page path is (`lib/kiss.js:517–519`). Everything else — models, controllers, the entry script, `unlink` of anything, directory events, unknown files — keeps calling `_requestReplay()`.

Why it is safe without a graph: a partial edit cannot change `_registrations`, `_stack`, any page's resolved options, `buildTo`, or the sitemap. The only thing that can differ from a replay is which pages are re-rendered, and this re-renders all of them. The stack is unchanged by construction, so orphan cleanup, dedupe and `_failures` are untouched.

Why it is worth doing: it removes model re-resolution, controller re-import with cache-bust, and URL-model re-fetch from the partial-edit path. Whether that is most of a replay's cost is exactly what the measurement in the Recommendation decides, but it is the half the graph could never have removed.

**Queueing.** This introduces a second kind of rebuild work, and the critique showed the dangerous race is not "events during a replay" (which `_requestReplay` already coalesces) but _scoped work in flight when a replay starts_, and _two scoped rebuilds racing each other_. The rule, adopted verbatim: **all rebuild work goes through one serial queue with one in-flight slot and one pending slot.** The pending slot is a set of scoped targets plus a "replay" bit. Requesting a replay sets the bit and clears the set — a replay supersedes every scoped rebuild. Requesting a scoped rebuild while the bit is set is a no-op. `_requestReplay()` becomes a thin wrapper that sets the bit and returns the in-flight promise, so `test/integration/watch.test.js:88` (`expect(b).toBe(a)`) still holds. A partial edit arriving during a replay is upgraded to a follow-up replay rather than a scoped rebuild, because whether the in-flight replay already re-read the edited file is a race nobody can reason about; pessimism is the right call and this is why.

## Step 3 — the traced graph, partial→page half only, if the measurement says so

Everything in this section is conditional on render time dominating registration time in the measurement. If built, it replaces step 2's "every entry in `_stack`" with "the entries that used the edited partial", and step 2 is its fallback.

### Graph model

Nodes: **file** — a partial or layout, keyed by the posix path `registerPartialsFrom` derives from; **page** — a stack entry, keyed by `buildTo`. Edges: file → page, one per partial or layout actually invoked while that page rendered, plus the page's own view. A reverse index `Map<file, Set<page>>`. There are no registration nodes and no model or controller edges in this design.

### Tracing

`registerPartialsFrom` (`lib/partials.js:15`) registers a function instead of a string:

```js
const compiled = hbs.compile(source) // once, at registration
hbs.registerPartial(name, (ctx, opts) => {
  try {
    sink.record(name) // name captured by closure — see caveat
  } catch {
    /* tracing must never affect rendering */
  }
  return compiled(ctx, opts) // a raw string, verbatim — see contract
})
```

Verified against the installed source (first draft and critique probes):

- Handlebars calls a function partial as `partial(context, options)` — `runtime.js:398–399`. Dynamic partials resolve to the function and are traced. Nested partials go through the same environment and are traced.
- handlebars-layouts `extend` accepts a function partial and calls it as `template(context, { data })` — `index.js:124–132` — **with no `options.name`**, so the name must be captured by closure. `embed` delegates to `extend` (`index.js:152`) and behaves identically; probed.
- **Return contract:** the wrapper must return exactly `compiled(ctx, opts)`. Returning `undefined` makes `invokePartialWrapper` try to compile the function (`runtime.js:83`) and throw; returning a `SafeString` throws on an indented partial call because `runtime.js:92` splits the result on newlines. Never short-circuit on a trace failure.
- **Inline partials** (`{{#*inline "p"}}`) shadow the registered `p` and record nothing. Correct — the page does not depend on the file at that call site — but "the whole tree is traced" is not literally true.
- A string partial is compiled with the calling template's `compilerOptions` (`runtime.js:84`); the wrapper compiles with none. Identical here because `lib/kiss-page.js:164` is the only compile and passes no options; a future `compile(view, { strict: true })` would silently diverge. `hbs.compile` is lazy, so compiling at registration does not move a parse error earlier.

**The current-page marker lives in the single render seam, not in `Kiss.generate()`.** The first draft set it around `entry.page.generate()` inside `Kiss.generate()`'s `forEach`. The critique showed that leaves `rebuildPage` (`lib/kiss.js:517–519`), which calls `page.generate()` directly, unmarked — so every single-page rebuild renders with stale edges, `dependentsOf()` confidently returns the wrong set, and no fallback fires. The marker is set and cleared inside `KissPage.generate()` around `template(this.options)` (`lib/kiss-page.js:97`), and a page's edge set is cleared there before its render. It is a field on the per-instance trace sink injected through `deps`, never module scope: `AIKB/kiss.md:39` and `test/integration/isolation.test.js:22` make per-instance Handlebars isolation a pinned invariant.

**Why one marker is safe.** Rendering is synchronous until the first `await` (`template()` at `lib/kiss-page.js:97`, first suspension at `:104`), Handlebars has no async surface, and handlebars-layouts' `extend`/`block`/`content` are lazy in ordering but not in time — the block stack is drained inside the same synchronous `template()` call (`index.js:15–21, 129, 169`). `Kiss.generate()` starts pages from a synchronous `forEach` (`lib/kiss.js:353–367`), so two pages' renders cannot interleave. The `forEach` is the load-bearing half, and it is the half a future refactor is most likely to change (`for await`, a concurrency limiter); the invariant test below pins it.

### Dispatch

On `change` of a partial or layout: re-register (step 1's recipe), then `rebuildPage` for `dependentsOf(file)`. If the file is not in the index, or the index is empty, or any error occurs in graph code: step 2's behaviour (every stack entry), then step 2's fallback (replay). Never silent: a fallback logs why.

### Where it lives

- **New:** `lib/dependency-graph.js` — pure: `record(page, file)`, `clearPage(page)`, `dependentsOf(file)`. Name derivation for files reuses `lib/partials.js`'s own slice-and-strip, never a copy of it. Ships with `test/unit/dependency-graph.test.js`, `AIKB/dependency-graph.md` and a `CLAUDE.md` table row in the same commit (repo rule).
- `lib/partials.js` — registers tracing functions; takes the sink via `deps` like `markdown` and `logger`. `AIKB/partials.md` updated in the same commit.
- `lib/kiss-page.js` — marker set/clear around the render. `AIKB/kiss-page.md` states the sync-render rule.
- `lib/kiss.js` — the serial rebuild queue from step 2; the scoped dispatch. `AIKB/kiss.md` and `AIKB/watcher.md` updated; `llms.txt:15` and `README.md`'s watch paragraph describe the new rebuild behaviour in consumer-facing prose.
- `lib/watcher.js` — hands `(event, path)` to `Kiss` instead of deciding.

## Testing

The v2 rewrite's discipline applies: characterise, then change.

1. **Characterisation tests first, before any engine code**, in `test/integration/watch.test.js`, asserting **rendered output**: edit a partial; edit a layout; edit a `.md` partial; delete a partial (pins B1: output still contains the deleted content); add a partial then reference it (pins B2: page stuck at old content, error swallowed); delete a page view (pins B3: output becomes the literal filename); add a page view on a scanned and on an explicitly registered site (pins "nothing happens" today — do not write these to expect a rebuild); an atomic save (`unlink` + `add`) of a registered page; `close()` during a slow replay (pins B6). Today none of these exist. The fixes in step 1 flip them deliberately.
2. **Unit tests** for `lib/dependency-graph.js` if step 3 is built.
3. **Replay equivalence.** For a fixture site, apply a scripted sequence of edits twice: once through the scoped path, once with every event forced to full replay. After each step the build directory contents must be identical. Applies to step 2 as much as step 3, and stays in the suite permanently.
4. **Invariant tests** (step 3): (a) the marker is set and unchanged for the whole synchronous render, asserted by a test that wraps `template`; (b) two pages using different partials rendered in one `generate()` attribute each partial to the right page; (c) a page rebuilt alone via `rebuildPage` gains a new edge and loses a dropped one; (d) a page that stops using a partial loses the edge.
5. **Queue tests** (step 2): a scoped rebuild in flight when a replay is requested is superseded; two scoped rebuilds of the same target coalesce; `watch.test.js:88`'s `expect(b).toBe(a)` unchanged.
6. The existing ten watch tests stay green and unedited. In particular `watch.test.js:176` (`.json` sibling of a removed orphan) — the first draft's per-registration cleanup would have broken it, which is one reason model scoping is now a non-goal.

## Rollout order

Each step is its own green commit with `npm run gates`, and `/branch-pulse` runs between steps.

1. Characterisation tests (Testing 1). Merges alone; changes no behaviour.
2. The fixes: `_getTemplate` (B3), unregister-vanished in `registerPartials` (B1), `add` routing gated on `ready` (B2), page-view `unlink` → replay (B3 watch-side), `close()` quiesce (B6). Flips the step-1 tests. `AIKB/kiss-page.md`, `AIKB/partials.md`, `AIKB/watcher.md`, `AIKB/kiss.md`, and `llms.txt`/`README.md`'s watch prose in the same commit.
3. The serial rebuild queue, landed while every path still requests a full replay — behaviour-neutral, exercised by the queue tests.
4. The no-graph optimisation: partial/layout `change` → re-register + rebuild the stack. Replay-equivalence test lands here.
5. **Measure** on a consumer-scale site: registration time vs render time per replay. Record the numbers in this spec. Stop here if registration dominates.
6. Only if render dominates: `lib/dependency-graph.js` with its unit tests and docs, unused for dispatch. Then tracing partials and the marker in `KissPage.generate()`, graph populated but unused, visible in dev mode's debug `.json` sibling. Two internal changes to state explicitly: `hbs.partials` entries are functions always (documented surface, above), and handlebars-layouts stops recompiling a layout on every `{{#extend}}` (`index.js:124–126` compiles per invocation for string partials today) — output unchanged, probed for whitespace, `this` binding and indentation.
7. Scoped dispatch through the graph, with step 4 as its fallback. Invariant tests land here.

Any step that fails its equivalence or invariant test is reverted, not patched forward.

## Model delegation

Following `planning/specs/2026-09-02-v2-solid-refactor-design.md` § Model delegation: Fable writes no implementation code; one task per subagent; self-contained briefs; Fable reviews from `git diff` and test output.

| Tier                                         | Work items                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sonnet** — mechanical, well-specified      | Characterisation tests from Fable's case list (rollout 1); `lib/dependency-graph.js` from this spec's function list plus its unit tests (rollout 6); AIKB docs, `CLAUDE.md` row, `llms.txt`/`README.md` watch prose; the measurement harness (rollout 5) |
| **Opus** — judgement about current behaviour | The five fixes (rollout 2); the serial rebuild queue (rollout 3); the no-graph optimisation (rollout 4); tracing wrapper, marker in `KissPage.generate()`, scoped dispatch (rollout 6–7)                                                                 |
| **Fable** — cross-cutting                    | This spec; the queue rule and the invariant/equivalence test designs; review of every diff; reading the measurement and making the stop/continue call at rollout 5 with the operator                                                                     |

## Open risks

- **The sync-render invariant is one `await` away from breaking**, and the `forEach` in `Kiss.generate()` is the other half of it. The invariant test is the guard; `AIKB/kiss-page.md` must state the rule.
- The `hbs.partials` shape change is small and defensible, but it is a documented surface; if a consumer helper is found to depend on string entries, step 6 gains a compatibility note in `llms.txt`.
- A URL model cannot be watched; nothing here changes that. Document, do not solve.
- `.scan()`'s own dedupe filters against `_stack`, which is empty during a synchronous `.page(…).scan()` chain (`lib/kiss.js:294–298` vs `:262`), so a view can be registered twice and rejected by the `buildTo` dedupe. Pre-existing; surfaced by the critique; not this spec's to fix, but any `add` handling must check `_registrations`, not `_stack`.
- Scope of benefit is unproven until rollout 5. This spec is written so that stopping there is the cheap and respectable outcome.

Closed since the first draft: `embed` verified (delegates to `extend`); `unregisterPartial` verified clean (the compile cache writes into the same aliased map, so nothing else retains a compiled copy).

Impact surface: engine internals; steps 1–2 add no module; step 3 adds one `lib/` module; no public API change beyond the `hbs.partials` entry shape.
