# Upstream constraints

Things kiss works around, or declines to work around, in code it does not own —
Node, handlebars, chokidar, sass, eslint, turndown and its DOM.

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

### fs-extra re-copies an existing file by deleting it first

**Observed:** fs-extra 11.4.0's `copy`, with its default `overwrite: true`, unlinks an existing
destination file and then copies the new one in, as two separate steps
(`node_modules/fs-extra/lib/copy/copy.js`, `onFile`). **Effect:** every watch-mode asset re-copy
(`lib/assets.js` `copyAssets` → `fs.copy` over the whole folder) leaves each already-copied asset
briefly absent. A reader in that gap — a test's `readFile`, or a dev-server request — gets
`ENOENT`, or a 404. Two integration tests hit it under full-suite load on Windows (2026-10-02,
`AIKB/testing.md`).

**Why it is accepted rather than worked around (measured 2026-10-02, Windows 11, Node 22):** five
seconds of continuous re-copying against one continuous reader, three ways —

| Strategy                    | Whole reads | Reader failures                        | Writer failures                        |
| --------------------------- | ----------- | -------------------------------------- | -------------------------------------- |
| fs-extra `copy` (today)     | 4,495       | `ENOENT` 694, `EBUSY` 13,177           | none                                   |
| `fsp.copyFile` in place     | 7,005       | **370 truncated reads**, `EBUSY` 1,574 | none                                   |
| temp file, then `fs.rename` | 10,385      | none                                   | **`EPERM` 4,020 — the update is lost** |

On Windows no strategy gives a reader a clean result while a copy is in flight: in place trades
the missing file for a half-written one, and rename-into-place cannot replace a file a reader
holds. The gap is a dev-mode, mid-rebuild state that the next request or reload resolves, so it
is documented here and tests wait for the rebuild to settle (or treat a missing file as "not
yet") before reading.

**Re-check:** read `onFile` in `node_modules/fs-extra/lib/copy/copy.js` for the
`unlink` before `copyFile`. To re-measure, race a loop of `fs.copy(srcDir, existingDestDir)`
against a loop of `fs.readFile(destFile)` with no wait, and count error codes; the three-way
harness above was a scratch script of about sixty lines and is described here rather than kept.

### `@eslint/js` requires a higher Node than kiss does

**Observed:** `engines.node` is 22.12; `@eslint/js` needs 22.13. **Effect:** on
22.12 exactly, `npm test` passes and `npm run lint` refuses to run. **What kiss
does:** nothing — the floor is a promise to consumers and the linter is a
development tool, so the split is stated in `CLAUDE.md` and `.nvmrc` pins the
development line. **Re-check:** whether `@eslint/js` has lowered its floor, or
whether kiss's own floor has moved past it.

### domino's type declaration names the wrong module

**Observed:** `@mixmark-io/domino` 2.2.0 (turndown 7.2.4's DOM, imported directly
by `lib/markdown-copy.js`, 2026-10-07). **Effect:** its `lib/index.d.ts` is
`declare module 'domino' { … }` — an ambient declaration under the package's old
name, not a module — so `tsc --checkJs` fails the import with TS2306 ("is not a
module") and `npm run typecheck`, a gate, goes red. The runtime is unaffected.
**What kiss does:** names the specifier through a variable
(`const DOMINO = '@mixmark-io/domino'`; `import(DOMINO)`), which `tsc` does not
resolve, so the module is typed `any`. A local guard at one call site; no
shim `.d.ts`. **Re-check:** `head node_modules/@mixmark-io/domino/lib/index.d.ts`
after an upgrade — if it exports rather than declares, import the string
literal again and run `npm run typecheck`.

### turndown-plugin-gfm is unmaintained

**Observed:** `turndown-plugin-gfm` 1.0.2, last published 2022 (npm
`time.modified`, checked 2026-10-07). **Effect:** none yet — it adds GFM
tables, strikethrough and task lists to turndown, and those rules do not move.
**What kiss does:** uses it, as an accepted risk chosen on the branch that
added Markdown copies. The measured fallback is `node-html-markdown` 2.0.0,
which converts tables itself but pads every cell to its column's width, costing
tokens on a wide config table. **Re-check:** `npm view turndown-plugin-gfm
time.modified`, and whether a turndown major has broken its plugin API.

### Codex enables plugins per project, installs them per user

**Observed:** Codex CLI 0.157.1 on Windows, 2026-10-02, against a throwaway
`CODEX_HOME` (the operator's own config never touched), with the Codex source
(`codex-rs/core-plugins`) read first. `codex plugin marketplace add
cprobert/kiss-ssg` reads kiss's existing `.claude-plugin/marketplace.json`
unchanged, so one marketplace serves both agents. **Effect:**

| Setup                                                                                       | Result                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A trusted project's `.codex/config.toml` declares `[marketplaces.kiss-ssg]` and the plugins | Codex merges it as a config layer; the marketplace is listed from the project                                                                                                |
| …with the marketplace as `source_type = "git"`, before any install                          | `codex plugin list` / `add` fail ("marketplace root does not contain a supported manifest"): the clone lives in the user's home. A plain `codex` session still runs (exit 0) |
| …then the three `CODEX_STEPS` lines, run in the project                                     | All succeed, from GitHub; a session lists all 11 skills (listed — invocation is for a clean room to show)                                                                    |
| Plugin cached, user-level `enabled` removed, only the project declares it                   | Skills appear in the project only; an unrelated folder lists none                                                                                                            |
| `codex plugin add` run inside the project                                                   | Writes `enabled = true` to the **user** config (it has no project flag), so the plugins are then on in every folder                                                          |
| Project not trusted                                                                         | The project config is ignored (inert, harmless)                                                                                                                              |

So Codex _enables_ plugins per project (a trusted project's
`.codex/config.toml`) but _installs_ them per user, and `codex plugin add` also
enables them for the user. An earlier reading (same day) that a project's file
did not load plugins was wrong: its trust entry was malformed (a forward-slash
path). **What kiss does:** `init` writes `.codex/config.toml` beside
`.claude/settings.json` — the marketplace and both plugin tables, in the form
Codex writes itself, appending to an existing file only the tables it lacks —
prints the three `codex plugin` lines (`CODEX_STEPS` in `lib/init.js`) to run
once per user, and writes them into `AGENTS.md`.
**Re-check:** point `CODEX_HOME` at an empty folder holding only a copy of
`auth.json`. In a scratch folder with `init`'s `.codex/config.toml`, mark the
folder trusted in `$CODEX_HOME/config.toml` **in the form Codex itself writes**
— on Windows, measured 2026-10-02:
`[projects.'c:\users\me\scratch\site']` then `trust_level = "trusted"`, the
path lowercase with backslashes inside a single-quoted (literal) key. A
forward-slash path is silently ignored, which is what made the first run
report "not shown to work"; if in doubt, let Codex write it by trusting the
folder when it asks, and copy that. Then run the three `codex plugin` lines and
`codex exec --skip-git-repo-check -s read-only "list skills whose names start with kiss-"`.
Remove the user-level `enabled` lines and list again in the project and in an
unrelated folder. Revisit if `codex plugin add --help` grows a project flag, or
if a git-sourced project marketplace starts resolving without a user install.
Delete the copied `auth.json` afterwards.

## Supported alternatives not used

### Codex project skills in `.agents/skills/`

Measured with the entry above (Codex CLI 0.157.1): a skill folder copied into a
project's `.agents/skills/` is picked up, project-scoped, with no install step.
Not used (operator, 2026-10-02): it means shipping the skills in the npm
tarball and copying eleven folders into every site, which go stale on upgrade
because `init` never overwrites a file. The per-user plugin keeps one copy that
updates with the marketplace.

### The npm package as a local plugin marketplace

**Observed:** Claude Code 2.1.288 and Codex CLI 0.157.1 on Windows, 2026-10-03,
each against a throwaway config (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`; the
operator's own never touched), with a scratch site whose
`node_modules/kiss-ssg` carried only the core plugin and a marketplace file.
The question was whether shipping the core skills in the npm package, and
installing them from there, would give each site the skills that match the
engine it has. **Effect:**

| Setup                                                                                                                  | Result                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude: `marketplace add ./node_modules/kiss-ssg --scope project`, then `install`                                      | Works; the session lists the six `kiss-ssg:*` skills once each, and the plugin's path is `node_modules` itself, not the plugin cache                           |
| Claude: `node_modules` replaced by a newer version, no command run                                                     | The next session reports the new version: a local-folder marketplace is read live                                                                              |
| Claude: `--scope project` declaration                                                                                  | Writes an **absolute** path into `.claude/settings.json`, which cannot be committed                                                                            |
| Claude: that path edited to `./node_modules/kiss-ssg`, fresh config                                                    | `install` fails ("not found in marketplace"); `marketplace update` cannot find it                                                                              |
| Claude: `--scope local` declaration, `install --scope project`                                                         | Works: the absolute path lands in `settings.local.json`, and the committed `settings.json` holds only `enabledPlugins`                                         |
| Claude: settings written by hand, no commands, fresh config                                                            | Nothing loads, and `install` alone fails: only `marketplace add` registers a marketplace (in the **user's** `known_marketplaces.json`)                         |
| Claude: two sites register one marketplace name                                                                        | The last one wins for **every** site: site A's session loaded site B's 2.9.0 from site B's folder                                                              |
| Claude: a per-site marketplace in `.kiss-marketplace/`, plugin source `../node_modules/…`                              | Refused: a plugin source must start with `./`                                                                                                                  |
| Claude: a per-site marketplace at the site root (`.claude-plugin/marketplace.json`, unique name), `marketplace add ./` | Works: two sites on one machine each load their own version, and an update to `node_modules` is read live. (`marketplace add .` is refused; `./` is accepted.) |
| Codex: the same per-site marketplaces, `marketplace add ./` and `plugin add`                                           | Works, but the plugin is **copied into the cache by version**, and `plugin add` enables it for the user                                                        |
| Codex: in site B's folder                                                                                              | Lists `kiss-ssg:kiss-build-check` **twice**, 2.7.4 from site A and 2.9.0 from site B                                                                           |
| Codex: `node_modules` replaced by a newer version                                                                      | The session still reports the cached version                                                                                                                   |

So the mechanism is sound for Claude Code with one marketplace per site, and
unsound for Codex as it stands: its per-user install turns one-copy-per-site
into every-copy-everywhere, and its cache means an `npm update` does not reach
the agent. **Not used (operator, 2026-10-03):** Claude Code and Codex both
keep installing the plugins from the GitHub marketplace. Splitting the two
agents across two routes was weighed and declined. The package may still ship
the core skills as plain files for agents with no kiss plugin, pointed at from
`AGENTS.md`; that is a separate piece of work.
**Re-check:** build the scratch site the same way (a copy of `plugins/kiss-ssg`
under `node_modules/kiss-ssg/plugins/`, a site-root
`.claude-plugin/marketplace.json` with a unique name and source
`./node_modules/kiss-ssg/plugins/kiss-ssg`). For Claude, read the session's
`system`/`init` line from `claude -p ok --output-format stream-json --verbose
--max-turns 1`: its `plugins` entry carries the path and version, with no model
call needed. For Codex, follow the auth-copy procedure in the entry above and
ask `codex exec` which kiss-ssg versions it has. Revisit Codex if `codex plugin
add` grows a project scope, or if a local marketplace stops being cached.

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
