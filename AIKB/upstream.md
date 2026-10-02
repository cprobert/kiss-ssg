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

### handlebars treats a partial call alone on a line as "standalone"

**Observed:** handlebars 4.7.9. **Effect:** a `{{> "x"}}` alone on a line
indented by N spaces has every line of the partial's output indented by N
spaces, and the line's own newline is swallowed — its documented "standalone"
rule. Both are invisible in ordinary markup; the first changes the page inside
a multi-line `<pre>` or `<textarea>`, and the second removes whitespace that
renders between two inline-block elements. **What kiss does:** nothing
globally — it does not compile with `preventIndent` or `ignoreStandalone`,
which would change every existing site's output. `lib/html-split.js`'s
`LineWriter` writes the calls it generates so the rule adds and removes
nothing: column 0 when a call starts a line, a line break written twice after
one (Codex review, 2026-10-01 and 10-02). A local guard at one call site.
**Re-check:** render `{{> "p"}}` indented two spaces, with `p` registered as
`<pre>a\nb</pre>`, and see whether `b` gains the indent; render
`{{> "p"}}\nx` and see whether the newline survives.

### htmlparser2 drops malformed input and needs lower-cased tags

**Observed:** htmlparser2 10.1.0, the tokenizer under `lib/html-split.js`
(added 2026-10-02). **Effect:** two things. It reports no event at all for
some malformed source — `</ x>` (a bogus comment to a browser), a stray
`</span>`, an unfinished `<b` at the end of input — so a tree built from its
events alone silently loses those bytes. And with `lowerCaseTags: false` it
stops recognising void and raw-text elements written in capitals: `<IMG>` was
treated as open and swallowed the `<P>` after it. **What kiss does:**
`parseHtml` fills every gap between two events with the source between them,
so each byte lands in exactly one node, and runs the tokenizer with
`lowerCaseTags: true`, keeping the spelling from the source slice it stores
as `open`/`close`. A local guard in one function. **Re-check:** parse
`text </ x> more` and `<SCRIPT>a<b</SCRIPT><IMG SRC=x><P>q</P>` with a bare
`Parser` and see whether every byte has an event and `<P>` is a sibling of
`<IMG>`.

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
plus a `resolve` hook that propagates the parent's `?v=` query to **relative**
child specifiers does make an edited sibling take effect. **Nothing is
evicted** — that word was wrong here, and an independent review was right to
say so: a distinct URL instantiates a _new_ module and the old instance stays
in the registry for the life of the process. The propagation follows relative
specifiers only, so a bare package import (`import x from 'lodash'`) keeps the
instance it already had. What the probe measured is the new code running, which
is the consequence that decides the question. Measured here on Node 22.22.2:

```
before: ONE   after: TWO   siblingEvicted: true
```

(The `siblingEvicted` label is the probe's own and is loose in exactly the way
above: what it observed is the second instance's value, not a cache entry
disappearing.)

So the limitation is real about the API and **false about the consequence**, and
saying "cannot be evicted" without that qualifier was wrong. It is declined
anyway, on two grounds that are about kiss rather than about Node:

1. `module.register()` is **process-global**. kiss is a library imported by
   somebody's `router.js`; installing a resolution hook into a consumer's whole
   process, to improve a dev-mode reload, is a large side effect for a small
   convenience, and it would apply to every module that project loads.
2. It re-instantiates the entry's **relative** module subtree on every save —
   every sibling reached by a relative specifier, but not the bare package
   imports the propagation does not touch. The present behaviour leaks one
   module per helpers edit; this would leak that closure, for the life of a
   watch session.

**Re-check:** whether Node has since added a scoped invalidation API — one that
evicts a module graph without registering a global hook. If it has, this becomes
an implementation rather than a note.

### graceful-fs retries a locked rename on Windows for 60 seconds

**Observed:** graceful-fs 4.2.11 (via fs-extra 11.4.0) wraps `fs.rename` on
Windows to retry `EACCES`/`EPERM`/`EBUSY` until 60 s have passed
(`node_modules/graceful-fs/polyfills.js`, the `rename` wrapper). **Effect:** a
rename of a folder another program holds a file open in — VS Code's Live
Server, an editor, antivirus — waits silently for a minute before failing. An
`'atomic'` build's promotion is that rename, so the build stalled for 60136 ms
(measured 2026-09-28) and then failed with a bare `EPERM`. **What kiss does:**
a cheap local guard, not a mechanism — the promotion's renames call
`node:fs/promises` directly and retry for about 1.5 s themselves, then fail
naming the folder and the likely holder (`Kiss._renameForPromote`,
`AIKB/kiss.md`). Every other fs-extra call keeps graceful-fs's behaviour.
**Re-check:** read the `rename` wrapper in `node_modules/graceful-fs/polyfills.js`
for the 60000 ms window; and on Windows, hold a file open inside a folder with
`fs.openSync` and time `fs-extra`'s `rename` of it (`fs.watch` on the folder
does not block the rename, so it is not a stand-in).

### `@eslint/js` requires a higher Node than kiss does

**Observed:** `engines.node` is 22.12; `@eslint/js` needs 22.13. **Effect:** on
22.12 exactly, `npm test` passes and `npm run lint` refuses to run. **What kiss
does:** nothing — the floor is a promise to consumers and the linter is a
development tool, so the split is stated in `CLAUDE.md` and `.nvmrc` pins the
development line. **Re-check:** whether `@eslint/js` has lowered its floor, or
whether kiss's own floor has moved past it.

## Supported alternatives not used

### parse5 for `lib/html-split.js`

parse5 is the spec-exact HTML parser (jsdom's). It was considered beside
htmlparser2 (2026-10-02) and not used: it builds the browser's tree, inserting
`<html>`, `<head>`, `<body>` and `<tbody>` the page never wrote, and a
conversion whose promise is to give back what it was given would then have to
tell implied nodes from written ones through its location data. htmlparser2
never implies an element (it only closes them, as a browser does), and its
event positions were enough to keep every source byte.

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

### Live-reload reconnect window after navigation

Fable measured this on 2026-09-22 at `c69c2a7`, using Python Playwright 1.58 and headless Chromium 145 against example 4. A save immediately after a page reload at DOM-ready was rebuilt and available over HTTP but never fetched by the browser. The fresh page's live-reload socket connected about 200 ms later; the earlier broadcast had no connected recipient and was not replayed. Waiting for the socket before each edit made all thirteen checks pass. Footer clearing/restoration, Sass swapping without navigation, and page edits were verified; the console was empty and fixture files were restored byte-for-byte.

The reconnect explanation is supported by that probe. Attribution to the pre-existing upstream mechanism is inferred: Fable did not compare against `main`. We accept this window and add no replay mechanism. **Re-check:** start example 4 in dev mode, count browser navigations, compare an HTTP fetch with the rendered DOM after each save, and compare a second edit immediately at DOM-ready with one after the live-reload socket opens. The reviewer's `eg4_browser_check.py` is in its session scratchpad, not a repository dependency or checked-in script.

Prior art, checked 2026-09-23: Vite's client reloads the page whenever its HMR socket reconnects (vitejs/vite#5675 is the complaint about the needless reloads that causes), which covers a lost message; Eleventy's dev server runs its own WebSocket server and updates the DOM by diffing, so the page rarely reloads and the window rarely opens. Neither is adopted: the reload-on-reconnect would be a change to livereload-js's client, which kiss does not own, and a DOM-diffing server is a different server. `AIKB/design.md` § Prior art has the wider comparison.
