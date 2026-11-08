# Upstream constraints

Things kiss works around, or declines to work around, in code it does not own —
Node, handlebars, chokidar, sass, eslint, turndown and its DOM, and the
third-party skills kiss recommends.

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

**Re-checked 2026-11-06 on htmlparser2 12.0.0** (its HTML mode now follows the
WHATWG spec): `</ x>` arrives as a comment, so that gap is closed. A stray
`</span>` and an unfinished `<b` at the end still produce no event, and with
`lowerCaseTags: false` an `<IMG>` still swallows the `<P>` after it (its close
is reported as implied, at the end). The guard stays.

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

### chokidar does not re-arm a deleted root

chokidar 5.0.0, Node 22.23.3, Linux (WSL2 kernel 6.6; the GitHub `ubuntu-24.04`
runner shows the same). Watch a folder, delete it, re-create it with a file: the
watcher emits `unlinkDir` for the root and then nothing — the file's `add` never
arrives, 40 of 40 rounds, whether the folder comes back 0ms or 300ms later.
`_remove` re-adds a vanished path only when it is a **file** and the sole watched
path (`if (!isDirectory && this._watched.size === 1) this.add(…)`); a root
**directory** is closed (`_closePath`) and forgotten. And the `unlinkDir` for
the root itself is not a reliable signal either: it is reached through
`DirEntry.remove`, whose `readdir` of the emptied folder is asynchronous, so
whether the folder is seen gone depends on the order of the last file's unlink
and the `rmdir` — 1 of 40 rounds emitted no `unlinkDir` at all, and the GitHub
runner missed it on the first run of a guard keyed on it (green once, red the
next run). `add()` on a path that does not exist does watch the parent for it
(`add()` re-calls itself with the parent and the basename as target when
`_addToNodeFs` fails) — 0 of 20 missed, `add` ~84ms — but only when something
calls it, and the only trigger chokidar offers is that unreliable `unlinkDir`.
So `lib/watcher.js` does not watch the assets root at all: it watches the
folder's **parent**, which persists, with an `ignored` predicate that admits
only the parent itself and the assets subtree. The folder's deletion and return
are then child events of a live root, which chokidar handles correctly, and
the restored file's `add` arrives in ~0.3s.

Found because `test/integration/watch.test.js`'s "copies new assets, removes
renamed/deleted outputs" waited 5 seconds for a restored asset on the Ubuntu
runner and timed out (2026-10-03 once, 2026-10-17 twice on the runner image of
2026-10-12), while passing on Windows and in every local Linux run. kiss was
covering the gap by accident: the `src` watcher sees the folder return as an
`addDir` and replays the site, which re-copies assets. That route is slower and
depends on a second watcher's read of the parent; the runner lost it, and this
machine never did (~77ms). **Re-check:** a bare chokidar script — `watch(dir)`,
await `ready`, `fs.remove(dir)`, `fs.outputFile(dir/restored.txt)`, wait up to
5s for an `add` ending in `restored.txt` — on Linux, 20 rounds; the constraint
is current while it misses. The session scratchpad's `probe.mjs` was that
script, run from the repo so its chokidar is the one under test.

**chokidar 6.0.0 (taken 2026-11-06) says it fixes this**: "a deleted watched
path … is now awaited from its nearest existing parent", and "persistent
watching stopping after a watched directory was removed" (#1463). That is
chokidar's claim, not a measurement. The parent-watch above stays until the
re-check passes on Linux with chokidar 6; if it does, watching the assets root
directly is the simpler shape.

### eslint holds minimatch on 10, which a Dependabot advisory covers

**Observed** (2026-11-06, eslint 10.10.0, latest 10.14.0, `@eslint/config-array`
0.23.5): eslint and `@eslint/config-array` both depend on `minimatch` `^10`.
GHSA-g3hv-75wg-m249 (moderate, a denial of service through pattern
amplification) covers minimatch 7.0.0 to 11.0.0 and is fixed only in 11.0.1.
**Effect:** `npm audit` reports four moderate findings, all one chain
(minimatch → `@eslint/config-array` → eslint → `@eslint/js`). Its suggested
fix is a downgrade to eslint 9. **What kiss does:** nothing. eslint is a
`devDependency`, it lints this repository's own files and never reaches a
site's install. The runtime copy of minimatch, under glob 14, is 11.x. The
Dependabot alert was dismissed as tolerable risk (dev-only, no upstream fix).
An `overrides` entry was considered and rejected, because it would run eslint
on a major version it does not declare. **Re-check:**
`npm view eslint dependencies.minimatch` and
`npm view @eslint/config-array dependencies.minimatch`. When either says `^11`,
take that eslint and expect `npm audit` to report 0.

### npm redacts a UUID-like path segment in `npm prefix`, and `npm config` refuses a workspace member

**Observed (npm 11.9.0, Windows, 2026-11-01):** run from a workspace member, `npm prefix`
prints the workspace root, but with a path segment that looks like a UUID replaced by `***`
(the folder was a Claude Code session scratchpad, `…\C--Code-kiss-ssg\<uuid>\scratchpad\ws`).
The printed path does not exist, so a process started in it fails with `ENOENT`. In the same
member, `npm config get registry` exits 1 with `ENOWORKSPACES` ("This command does not support
workspaces"). **Effect:** `npm prefix` cannot be trusted for the project root wherever a
path holds such a segment (temp folders, CI workspaces), and a member has no registry answer.
**What kiss does:** `kiss-ssg upgrade` does not call `npm prefix`. The project is the folder it
runs in, and its lockfile is that folder's own. A workspace member is recognised by npm's own
`ENOWORKSPACES`, and the install is blocked with the command to run from the workspace's root;
`--plan` still prints the notes (`AIKB/upgrade.md`). Re-implementing npm's workspace
resolution to support members would be the mechanism this file exists to avoid. **Re-check:**
in a folder whose path has a UUID segment, make a root `package.json` with
`"workspaces": ["packages/*"]` and a `packages/site/package.json`, then from `packages/site` run
`npm prefix` (is the path whole?) and `npm config get registry` (does it still exit 1?).

### domino's type declaration names the wrong module

**Observed:** `@mixmark-io/domino` 2.2.0 (turndown 7.2.4's DOM, imported directly
by `lib/markdown-copy.js`, 2026-10-07). **Effect:** its type declaration
(`node_modules/@mixmark-io/domino/lib/index.d.ts`) is
`declare module 'domino' { … }` — an ambient declaration under the package's old
name, not a module — so `tsc --checkJs` fails the import with TS2306 ("is not a
module") and `npm run typecheck`, a gate, goes red. The runtime is unaffected.
**What kiss does:** names the specifier through a variable
(`const DOMINO = '@mixmark-io/domino'`; `import(DOMINO)`), which `tsc` does not
resolve, so the module is typed `any`. A local guard at one call site; no
shim `.d.ts`. **Re-check:** `head node_modules/@mixmark-io/domino/lib/index.d.ts`
after an upgrade — if it exports rather than declares, import the string
literal again and run `npm run typecheck`.

### PurgeCSS removes a selector made of pseudo-classes alone, and splits Tailwind class names

**Observed:** `purgecss` 8.0.0 (2026-11-08, issue #78 and the a1k9training clean room).

**Effect, part 1:** `shouldKeepSelector` keeps a selector whose only parts are pseudo-classes when it is `:where`, `:is`, `:has` or `:not` (`isPseudoClassAtRootLevel`). Any other pseudo-class part falls through to `continue`, so the selector counts as absent and is removed. That includes `:focus-visible { outline: … }` and `:-moz-focusring:where(…)`. Such a selector means `*:focus-visible` and matches every element. On a1k9training, purged with no safelist, every keyboard focus ring went: 62 computed-style differences in focus states. A catch-all safelist (`/[^a-zA-Z0-9_-]/`) had kept it by accident.

**Effect, part 2:** its default extractor, `/[A-Za-z0-9_-]+/g`, cuts every class holding `/ [ ] . :` into pieces that are not the class, so Tailwind sites lost every such rule (#78).

**What kiss does:** two cheap guards in `lib/css-purge.js` `purgeCss`.

- For part 1, `PSEUDO_PART` in PurgeCSS's own `standard` safelist: a pseudo part counts as present, and every tag, class, id and attribute part is still checked, so `.unused:focus-visible` still goes.
- For part 2, its own extractor, plus the pages' exact `class` values as a content item.

Both use PurgeCSS options, not patches. **Re-check:** after a PurgeCSS upgrade, comment out `standard: [PSEUDO_PART]` and run `npx vitest run test/unit/css-purge.test.js -t "every element"`. If it stays green, PurgeCSS keeps these itself and the guard can go. The extractor is kiss's for good: Tailwind's own class syntax is not PurgeCSS's to follow.

### Remarkable never starts an HTML block with `<h1>`–`<h6>`

**Observed:** `remarkable` 2.0.1 (2026-10-31). Its HTML-block rule matches an
opening tag with `/^<([a-zA-Z]{1,15})[\s\/>]/`, which allows no digit, so
`<h3 id="x">` never matches, although `h1`–`h6` are on its `html_blocks`
list. The line is parsed as a paragraph, and renders as
`<p><h3 id="x">…</h3></p>`. **Effect:** the docs site's guide pages, cut from
GUIDE.md by `src/controllers/guide.js`, put each section and sub-heading in
as a raw `<hN>` line, and every one came out inside a `<p>`; the minifier
turned that into an empty `<p></p>` before each heading (code review,
2026-10-31, round 21). The engine is not affected: it renders a page's own
Markdown headings as Markdown. **What kiss does:** a cheap local guard in
`renderWithTargets`, which unwraps exactly `<p><hN …>…</hN></p>` after
rendering, pinned by `test/unit/guide-controller.test.js`. **Re-check:**
`node -e "console.log(new (require('remarkable').Remarkable)({html:true}).render('<h3>x</h3>'))"`
prints `<h3>x</h3>` without a `<p>` when it is fixed; then the guard can go.

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

### Anthropic's `webapp-testing` skill: `file://`, and a server it cannot stop on Windows

**Observed:** `anthropics/skills`, `example-skills` plugin at commit
`8a1541c4a3ff`, on Windows 11 with Python 3.14.6 and Playwright 1.63.0,
2026-10-13. kiss recommends the skill as an optional companion (README, the docs
home page) and has three of its skills hand off to it. Two of its defaults are
wrong for a kiss site:

- **`file://` for static HTML.** Its `SKILL.md` decision tree sends static HTML
  to "Read HTML file directly", and `<skill>/examples/static_html_automation.py` opens a
  `file://` URL. A kiss build is static HTML with root-relative links and
  assets, so from `file://` every one of them resolves against the drive.
- **`<skill>/scripts/with_server.py` orphans the server on Windows.** It starts the
  command with `subprocess.Popen(..., shell=True)` and stops the shell. With
  `--server "npm run dev" --port 3011` on example 11's copy it printed "Server 1
  stopped", and `node router.js --dev` was still listening on 3011 and 35741.
  The next run failed to bind. This happened on two runs out of two. It also
  pipes the server's output without reading it, and checks readiness with a TCP
  connect to `localhost`. A first run aimed at port 3001 timed out because the
  site listens on 3011, not because of either of those.

**What kiss does:** documents, does not engineer around. The handoff lines in
`kiss-site-review` (step 3), `kiss-site-import` and `kiss-site-new` say to serve
the build folder over HTTP, start and stop the server themselves, and read the
site's own port. `test/unit/skill-coverage.test.js` pins those three rules.
Nothing in kiss wraps or patches the skill.
**Re-check:** fetch the skill's current `SKILL.md` and
`<skill>/examples/static_html_automation.py` and look for `file://`. (`<skill>`
is the skill's own folder in `anthropics/skills`, `skills/webapp-testing`.) Then, on Windows,
in a built kiss site:

```
python <skill>/scripts/with_server.py --server "npm run dev" --port <the site's port> -- python -c "print(1)"
Get-NetTCPConnection -LocalPort <port> -State Listen
```

A listener after the script exits means it still orphans. Stop that `node`
yourself, and revisit the handoff line if it no longer happens.

### Moodle's SCORM 1.2 API forgets a commit that failed in transit

**Observed:** Moodle 5.0 (`MOODLE_500_STABLE`,
`mod/scorm/datamodels/scorm_12.js`), read in source on 2026-10-25 after a Codex
adversarial review reproduced it. **Effect:** `LMSCommit` and `LMSFinish` send
only the elements whose value differs from a per-element baseline
(`datamodel[scoid][element].defaultvalue`). `CollectData` moves that baseline to
the current value _while it builds the request_, before `StoreData`'s
`DoRequest` sends it, and nothing rolls it back when the request fails. So
after a commit lost in transit (`'false'`, error 101), the next commit sends
nothing for those values, the server accepts the empty request, and it
returns `'true'`: a learner's bookmark or state the bridge wrote and committed
is not on the server, and every later commit says all is well. Writing the same
value again does not help: `LMSSetValue` keeps no changed flag, and the
comparison is made against the moved baseline. **What kiss does:** nothing
Moodle-specific (the operator's decision, 2026-10-25). The bridge's retry of a
failed commit (`AIKB/scorm-bridge.md`) is kept: it is right for an LMS that
sends its whole buffer, and costs one empty request on Moodle. The commit soon
after each bookmark or state still stands: it is what keeps a place from
depending on the request a browser may block at dismissal, which is a
different failure. The workaround weighed and not built: after a failed commit,
set each unsaved value to a placeholder, commit, set it back and commit again,
so Moodle sees a change; two requests a retry, a wrong value briefly persisted,
and a mechanism to keep in step with every Moodle release. **Re-check:** in
`CollectData`, see whether `defaultvalue` is still assigned before
`DoRequest` runs, and whether `StoreData` restores it when the request
returns `false`; or, in a Moodle course, block the `datamodel.php` request once
(the browser's request blocking), bookmark, let the commit fail, unblock, and
see whether the next commit's request carries `cmi.core.lesson_location`.

### Moodle opens a completed attempt in review mode, where nothing is saved

**Observed:** Moodle 4.5 (`MOODLE_405_STABLE`, `mod/scorm/lib.php`,
`scorm_check_mode()`). A consumer's session read it in source and found it in a
Moodle test ("resume does not work", 2026-10-26). This repo confirmed it the same
day only through a fetch tool's summary of that function, not by reading the
raw source. **Effect:** at launch, Moodle checks every SCO of the attempt. If all
are `completed`, `passed` or `failed` and "Force new attempt" is No, the mode is
`review` (`if ($incomplete === true) { $mode = 'normal'; } else { $mode =
'review'; }`), and the player shows a "Review mode" heading. In review mode it
still delivers `cmi.core.entry` `resume`, `cmi.core.lesson_location` and
`cmi.suspend_data` (`mod/scorm/datamodels/scorm_12lib.php`), so a page restores
the first launch's place, while a SCO in review records nothing. A page marked
complete on its first launch therefore reopens on launch 1's place forever. The
other "Force new attempt" settings start a new attempt with no saved place, so
no setting makes completion on load work for a page that bookmarks or saves.
**What kiss does:** the bridge leaves completion to the page by default
(`complete="manual"`, `AIKB/scorm-bridge.md`). `complete="seen"` is kept for
pages with no place to keep. Rustici's SCORM Driver, behind Articulate
Storyline, does the same: it holds the attempt `incomplete` until the course's
own completion rule is met. **Re-check:** read `scorm_check_mode` in
`https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/mod/scorm/lib.php`
(or the current stable branch). Or, as an enrolled student, launch a package whose
page uses `complete="seen"` and bookmarks three times, moving somewhere
different each time: the third launch shows "Review mode" and opens on the
first launch's place.

### A revived script never sees `DOMContentLoaded`, and runs out of order unless queued

**Observed:** Chromium (playwright-core 1.64), 2026-11-03, contract `planning/plans/2026-11-02-consent-manager.md` Appendix A, S2–S3.

**Effect:** a gated `type="text/plain"` script cloned into a live one after consent runs after the page has parsed.

- It misses `DOMContentLoaded`: a deferred original that listened for it never heard it, while the ungated control did. Revived after a click, it also misses `load`.
- Clones inserted all at once run out of document order. A dynamically inserted external script is forced async, and `async=false` orders the externals among themselves only: inline and module scripts ran before an earlier external.
- `document.write` in a revived script replaces the whole document, and in a serial queue `load` never fires.
- An inline `type="module"` script runs after the code that inserts it and fires no `load` event (the HTML spec fires `load` only for a script from an external file). A classic inline script queued after it ran first: `['N', 'M']` (2026-11-03, found by the Codex review, measured by `test/browser/consent.test.js`).

**What kiss does:**

- `lib/consent-client.js` revives scripts through one serial queue: an external holds the queue until `load` or `error`, or 10 seconds. An inline module holds it too, released by a call kiss appends as the module's last statement, or by `error` or the timer.
- `kissConsent.when()` is the documented way for site code to wait for a service.
- `{{consentScript}}` refuses `document.write` in an inline body.

**Re-check:** the spike scripts' shape is in Appendix A. Serve a page whose gated scripts log their order (a slow external, an inline, a module, a `defer` that listens for `DOMContentLoaded`), revive them at `DOMContentLoaded`, and compare with the same page ungated.

### Which `<script>` types a browser runs: `module` is not trimmed

**Observed:** Chromium 156.0.8078.4 (playwright-core), 2026-11-03, a parser-inserted page of one `<script>` per case.

**Effect:** as the HTML spec says, an empty or absent type (with no or an empty `language`) runs, and so does any JavaScript MIME type (`application/x-javascript`, `text/javascript1.5`, `text/jscript`, `text/livescript`, …) after ASCII whitespace is stripped and case ignored; `language="javascript"` runs as `text/javascript`, and a `type` wins over `language`. A type with parameters (`text/javascript; charset=utf-8`), a whitespace-only type, `application/ld+json` and `text/plain` do not run. One difference from a plain reading of the spec: `module` is matched without case (`MODULE` runs), but **not stripped** (` module` and `module ` do not run).

**What kiss does:** `scriptKind` in `lib/consent.js` encodes exactly this, and the consent gate, the wiring check and the audit all ask it.

**Re-check:** write a page with one `<script>` per type/language pair, each pushing its index to an array, load it in Chromium and read the array; the cases are in `test/unit/consent.test.js`'s `scriptKind` table.

### Consent Mode governs Google's tags, not a container's other tags

**Observed:** Chromium, 2026-11-03, against diploma-msc's live container `GTM-NXRHGJ8`, with every request but the container scripts aborted (Appendix A, S1 and S1b).

**Effect:**

- **Basic mode** (GTM loaded only after the choice): every Google hit carries `gcs=G111` after Accept, whether `update` ran before or after GTM was inserted.
- **Advanced mode** (GTM loaded before a choice): GA4 sends `G100` pings before any choice.
- **Partial consent:** with only `analytics_storage` granted, the container still loaded Clarity, Bing UET, ActiveCampaign and OpenAI scripts, because Consent Mode reaches only Google tags and tags given consent checks in GTM.

**What kiss does:**

- The `gtm` preset defaults to `marketing`.
- Basic mode is the default.
- Advanced mode is opt-in, with an audit finding.
- Each change also pushes a `kiss_consent` event, so a container can trigger on it.

**Re-check:** load a GTM container with the Consent Mode default denied, grant `analytics_storage` alone, and list the hosts it requests.

### Node's fetch quotes the URL and a header value in its errors, and says a network failure only in its cause

**Observed:** Node 24.14.0 on Windows, 2026-11-06, through the real `fetch` against a local server. CI ran the same tests on Node 22.23.4, on Ubuntu and Windows, and they passed once (run 42295436638).

**Effect:** `fetch` raises `Failed to parse URL from <url>` and `Request cannot be constructed from a URL that includes credentials: <url>`, with the URL again in the cause's `input`; `Headers.append: "<value>" is an invalid header value.` for a header holding a line break or a NUL; and `response.json()` quotes the start of a body that is not JSON. A network failure is a bare `fetch failed` whose detail is in `cause`: a `code`, `address` and `port` (`ECONNREFUSED`), a `hostname` (`ENOTFOUND`), an `AggregateError` with an empty message and one entry per address for a host with several (`localhost`), or a message with no code at all (`redirect count exceeded`, `bad port`, `unknown scheme`; `other side closed` carries `UND_ERR_SOCKET`).

**What kiss does:** `lib/fetch-policy.js` passes none of that text on. It refuses a URL that does not parse or holds credentials, and a header the fetch would refuse, before the fetch can quote either, and writes each failure's message from the redacted URL, the status, and the cause's code and address, each checked against the shape Node's value has. The constant cause messages are shown only by exact equality with `CONSTANT_CAUSES`. So a Node that rewords one, or adds a cause with no code, loses nothing but detail: the message ends `→ an error kiss cannot describe (TypeError)`.

**Measured 2026-11-07, Node 24.14.0, Windows** (a scratch probe through the real `fetch`, each against a local server or a closed port; the floor, Node 22.23.4, is measured only by CI running the test file):

| Case                                      | Error, and its `cause`                                                                                                                                  | kiss says                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| a port fetch will not use (`:1`)          | `fetch failed`; `Error: bad port`, no code                                                                                                              | `bad port`                                                   |
| `httpx://host/`                           | `fetch failed`; `Error: unknown scheme`, no code                                                                                                        | `unknown scheme`                                             |
| an invalid port (`https://host:99999/`)   | `Failed to parse URL from <url>`; `TypeError: Invalid URL`, `ERR_INVALID_URL`, the URL in `input`                                                       | `not a URL that can be fetched`, before any fetch            |
| a self-signed certificate                 | `fetch failed`; `self-signed certificate; if the root CA is installed locally, try running Node.js with --use-system-ca`, `DEPTH_ZERO_SELF_SIGNED_CERT` | that message, with its code                                  |
| a host with no address (`.invalid`)       | `fetch failed`; `getaddrinfo ENOTFOUND <host>`, `ENOTFOUND`, `hostname`                                                                                 | `ENOTFOUND <host>`                                           |
| a refused connection                      | `fetch failed`; `connect ECONNREFUSED <address>:<port>`, `ECONNREFUSED`, `address`, `port`                                                              | `ECONNREFUSED <address>:<port>`                              |
| a redirect loop                           | `fetch failed`; `redirect count exceeded`, no code                                                                                                      | `redirect count exceeded`                                    |
| a socket closed before the headers        | `fetch failed`; `SocketError: other side closed`, `UND_ERR_SOCKET`                                                                                      | `other side closed (UND_ERR_SOCKET)`                         |
| a socket closed in the middle of the body | `response.json()`: `terminated`; `SocketError: other side closed`, `UND_ERR_SOCKET`                                                                     | `200, but the body could not be read: other side closed (…)` |
| an abort after the headers                | `response.json()`: `AbortError: This operation was aborted`, `code` the number `20`, no cause                                                           | kiss's own timeout message wins the race                     |

A socket closed before the headers gave `other side closed` 200 times of 200, whether the server called `socket.destroy()` or `socket.end()`, and so did a socket closed mid-body. The test's `/drop` row, when it used `destroy()`, was reported to give `ECONNRESET` instead (the plan of 2026-11-07, item 8); it was not reproduced here, 20 runs of the file of 20 green before the change. A `destroy()` can reach the client as a reset, so the row now uses `end()`, a FIN, which has no reset in its path (inferred, not reproduced).

**Re-check:** on a new Node, run `npx vitest run test/unit/fetch-policy.test.js`. The block "a failure's message is written by kiss" drives each shape it can through the real `fetch` and asserts the exact message, so a reworded cause turns its row red and says what the new text is; the self-signed row is a stub shaped as measured, so re-measure it with a local `https` server and a throwaway certificate (`openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=127.0.0.1`). For the `/drop` row, run the file twenty times in a loop and count the runs whose drop row reads `ECONNRESET`. A message ending `→ an error kiss cannot describe (TypeError)` in a real build's log is the same signal: measure that failure's `error.cause` and add its message to the list if it is a constant.

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
