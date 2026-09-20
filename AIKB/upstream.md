# Upstream constraints

Things kiss works around, or declines to work around, in code it does not own —
Node, handlebars, chokidar, sass, eslint.

**Why this file exists.** A workaround explained only in the comment beside it
is a workaround nobody ever revisits: the reason is legible where the code is,
and invisible from the outside, so the constraint outlives the upstream bug by
years. Each entry below names the version the behaviour was observed at and
**how to re-check it**, so a sweep of this file is a mechanical task rather than
an archaeology exercise.

**The policy this file encodes.** Where upstream is wrong or missing something,
kiss documents and lives with it rather than engineering around it. Patching
around another project's defect is a commitment to keep patching: the workaround
has to be maintained against every upstream release, it is invisible to the
people who would otherwise fix the real thing, and the loop it creates consumes
more than the defect costs. A cheap local guard is fine. A mechanism is not.
The bar for building one is that the constraint makes kiss's own documented
promises unkeepable, not that it is annoying.

That cuts both ways: where an upstream project offers a **supported** mechanism
kiss does not use, the reason belongs here too. "We hand-rolled it" and "we
considered theirs and it does not fit" look identical from the outside, and only
one of them is a decision.

## Accepted constraints

### handlebars splits a partial's return value on newlines

**Observed:** handlebars 4.7. **Effect:** an indented `{{> "x"}}` throws and the
page writes nothing, because the indentation path calls `result.split('\n')` and
a `SafeString` has no `split`. **What kiss does:** `literalPartial`
(`lib/partials.js`) returns the escaped **string** rather than a `SafeString`.
This is a local guard, not a mechanism — one return type, at one call site.
**Re-check:** register a `.txt` partial, render `<pre>\n  {{> snippet}}\n</pre>`,
and see whether returning a `SafeString` still throws.

### handlebars renders a missing zero-argument helper as empty

**Observed:** handlebars 4.7. **Effect:** `{{shout "hi"}}` on a helper that is
gone throws `Missing helper`, but `{{copyright}}` — no arguments — is a missing
_property_ to handlebars rather than a missing helper, so it renders empty and
says nothing. **What kiss does:** nothing, deliberately. There is no hook that
distinguishes the two cases without replacing handlebars' lookup, which is a
mechanism. The consequence is written down instead, in `AIKB/kiss.md` and in the
code beside the helpers teardown, because "the pages fail loudly" was measured
and is only half true. **Re-check:** drop a zero-argument helper from a site's
registrar under `.watch()` and see whether the render now reports anything.

### ESM has no cache-invalidation API

**Observed:** Node 22.12–22.22. **Effect:** `import('…?v=<mtime>')` re-evaluates
the entry, and the entry's own `import './format.js'` resolves to a URL with no
query, which stays cached. So editing a **sibling** module of
`config.folders.helpers`' entry has no effect until the process restarts. **What
kiss does:** `helpersChanged` (`lib/kiss.js`) prints a restart notice for a
sibling and does **not** rebuild — the honest answer, rather than re-rendering
against the cached copy and reporting success.

**A supported mechanism exists and is declined.** Node's `module.register()`
plus a `resolve` hook that propagates the parent's `?v=` query to relative child
specifiers does evict siblings. Measured on this repo's Node:

```
before: ONE   after: TWO   siblingEvicted: true
```

So the limitation is real about the API and **false about the consequence**, and
saying "cannot be evicted" without that qualifier was wrong. It is declined
anyway, on two grounds that are about kiss rather than about Node:

1. `module.register()` is **process-global**. kiss is a library imported by
   somebody's `router.js`; installing a resolution hook into a consumer's whole
   process, to improve a dev-mode reload, is a large side effect for a small
   convenience, and it would apply to every module that project loads.
2. It re-instantiates the entry's whole module subtree on every save. The
   present behaviour leaks one module per helpers edit; this would leak the
   transitive closure, for the life of a watch session.

**Re-check:** whether Node has since added a scoped invalidation API — one that
evicts a module graph without registering a global hook. If it has, this becomes
an implementation rather than a note.

### `@eslint/js` requires a higher Node than kiss does

**Observed:** `engines.node` is 22.12; `@eslint/js` needs 22.13. **Effect:** on
22.12 exactly, `npm test` passes and `npm run lint` refuses to run. **What kiss
does:** nothing — the floor is a promise to consumers and the linter is a
development tool, so the split is stated in `CLAUDE.md` and `.nvmrc` pins the
development line. **Re-check:** whether `@eslint/js` has lowered its floor, or
whether kiss's own floor has moved past it.

## Supported alternatives not used

### chokidar's `ignoreInitial`

`lib/watcher.js` filters the initial `add`/`addDir` burst with a `scanned`
boolean set by the watcher's own `'ready'` handler. chokidar's `ignoreInitial:
true` is the supported option for exactly this, and there is no recorded reason
for preferring the hand-rolled gate — it predates this note and looks like it
was simply never revisited. Flagged rather than changed: it is a live watch path
and the two are only equivalent if chokidar's suppression covers precisely the
same events, which wants measuring rather than assuming.

### sass's `initCompiler()`

`lib/sass.js` calls `compile`/`compileString` at top level and caches results
itself, validated against `CompileResult.loadedUrls`. sass supports a reusable
compiler instance (`initCompiler()`), which matters most with `sass-embedded`,
where each top-level call pays process start-up. It is **not** a replacement for
the dependency-aware result cache — that answers "has anything this stylesheet
reads changed", which a compiler instance does not — so the two are
complementary and only the first is implemented. **Re-check:** whether a site
using `sass-embedded` shows compiler start-up in `npm run bench`'s `styled`
scenario.
