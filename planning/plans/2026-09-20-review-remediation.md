# Review remediation — 2026-09-20

Eleven defects, found by a Codex review plus two `/code-review` passes, all re-derived locally in this
session before being accepted. Nine were introduced by this branch today. The full suite passes, so
**every item here is something the gates do not reach** — that is the through-line, not an aside.

Work top to bottom: the correctness items first, the design decision they depend on already made.

## Decision already taken (operator, 2026-09-20)

`folders.helpers` **stays on by default**. Convention over configuration is the point, and an opt-in
key is a questionnaire. The upgrade hazard is handled by P3 rather than by weakening the default, and
`kiss-site-migrate` widens from "v1 → v2" to "upgrade a kiss site across any version boundary",
because a point release can now change what a folder means.

---

## P0 — Widen `kiss-site-migrate` beyond v1 → v2

The skill is titled "Migrate a site built on kiss-ssg v1 to v2" and is the only place an upgrading
site is told what changed. `folders.helpers` proves a minor release can need the same treatment.

- Retitle and re-describe: an upgrade utility for any version boundary, v1 → v2 included.
- Add a step that reads the installed version, compares it to `package.json`'s dependency range, and
  works through the CHANGELOG entries between them.
- Add the `folders.helpers` hazard explicitly: a root `helpers/` folder that predates 2.5 is now
  imported and its export inspected.

## P1 — `.txt` partial throws when the call is indented `[correctness]`

`lib/partials.js` `literalPartial` returns `new hbs.SafeString(...)`. Handlebars' `invokePartial`
calls `result.split('\n')` when `options.indent` is set, so `<pre>\n  {{> "x"}}\n</pre>` throws
`TypeError: result.split is not a function` and the page produces **no output**. Reproduced.

- A partial's return value is inserted raw (`tracingPartial` returns the compiled string), so the
  escaping does not need `SafeString` — return the escaped **string**.
- The hazard is named verbatim in the comment directly below the function. Read it.
- Tests: indented **and** flush-left, and inside a layout block. Seen red first.

## P2 — Helper reload is dishonest in two ways `[correctness]`

Both reproduced. This is the failure mode the whole branch exists to remove, shipped inside the
feature built to remove it, and `folders.helpers` is exempted from the restart notice that would
have caught it.

**P2a — a sibling module the entry imports never reloads.** `loadSiteHelpers` busts only the entry
(`require.cache` + `?v=<mtime>`); `helpers/index.js`'s own `import './format.js'` resolves to the
un-busted URL and comes from the ESM cache. Editing `format.js` re-registers the _old_ helper while
every page re-renders and the browser reloads.

ESM has no cache-invalidation API, so a full reload is not available without a loader hook. Apply the
branch's own principle instead: **make the failure honest**. The watcher knows which file changed —
if it is the entry, bust and reload as now; if it is any other file in the folder, print the restart
notice and do **not** present a successful rebuild.

**P2b — removing a registration leaves the old helper live.** Reload calls `register(kiss)` against
the existing registry; a helper the new source no longer registers stays. Snapshot the helper names
the site's registrar added on the previous load and `unregisterHelper` any the new load does not
re-register.

## P3 — The default breaks an existing site on upgrade `[correctness]`

An existing site with an unrelated root `helpers/index.js` (utilities, not a registrar) now fails its
whole build as `<site helpers>`. Keep the default; soften the failure by **how the folder was chosen**:

- `folders.helpers` **set explicitly** → the author meant it. An entry that exports no registrar is a
  build failure, as now.
- **Defaulted** → kiss guessed. An entry that exports no registrar is a `warn` naming the file and
  the fix, and the build continues without site helpers.

Also: CHANGELOG entry and the minor bump belong to `/branch-close`, but the CHANGELOG text for this
must name the upgrade hazard.

## P4 — The asset collision warning is dead under `assets.hash` `[silent]`

`lib/assets.js`: hashing `fs.move`s the emitted file, so the second source's `fs.stat(plain)` misses
and `continue`s before the `claimed` check. Hash-on is the production configuration, so the detector
is off exactly where silent shadowing matters. Reproduced: hash off warns, hash on is silent.

Record the claim from the glob iteration **before** the hash/move, not after. Test both settings.

## P5 — Example build output now ships in the tarball `[silent]`

`examples/*/public/` is inside the `files` whitelist, which overrides `.gitignore`: `npm pack
--dry-run` lists **75** such files. Directly contradicts `CLAUDE.md`'s "never ships".

Exclude it (`!examples/**/public/**` in `files`, or `.npmignore`), and add a `pack`-gate assertion
that no path under `examples/*/public/` is in the tarball — the gate currently only checks for
_missing_ paths, which is why this passed.

## P6 — `registerPartials(): any[]` in the published types `[regression]`

`_loadHelpers` was inserted between `registerPartials`' JSDoc block and its definition, orphaning it —
the exact displacement hazard `CLAUDE.md` names. Move the method, regenerate `types/`, confirm the
signature is `string[]` again.

## P7 — `helpersEntry` returns a native-separator path `[portability]`

`path.resolve` where the rest of kiss is posix-normalised. Fails `test/unit/site-helpers.test.js` on
Windows and puts a backslash path into `_failures[].buildTo`. Run it through `posixPath`.

**Also record honestly:** this branch's repeated "all five gates green" was true on Linux and never
qualified. CI is the only place the other platform is exercised.

## P8 — The helpers watcher misses creation and deletion `[edge]`

`lib/watcher.js` installs it only when the folder already exists at `watch()` time and subscribes only
to `change`. Creating a first `helpers/index.js` mid-session gets no watcher, no rebuild and no notice
(the restart notice is suppressed for that folder). Watch the path regardless of existence, handle
`add`/`unlink`, and apply the empty-file guard the `src` watcher uses.

Check, unverified so far: a truncate-then-write save may push a `<site helpers>` entry onto
`_failures` that only `_replay()` clears, so a phantom failure could persist in `kiss.report()`.

## P9 — Example 9 registers its helpers twice

`examples/9-migrated-from-v1/router.js` imports and calls `registerHelpers(kiss)` while
`folders.helpers` auto-registers the same folder. Its `helpers/index.js` also still asserts the
ordering claim `1348d47` measured false. Remove the call, fix the comment, re-record its `AIKB/`.

## P10 — `llms.txt` contradicts itself on helper registration

Line 9 says the router holds "one `registerHelpers(kiss)` call"; the tier-1 bullet says "You do not
call it: kiss does". Also a duplicated sentence: "Returns the list of registered names; returns the
list of registered names."

## Done when

Every item above fixed with a test seen red first where a test is possible, `npm run gates` green,
and the downstream session asked to pull and re-run Codex against the new tip — because this list is
what a review found that the gates could not, and the same review is the only thing that can say the
fixes hold.

## Outcome — 2026-09-20

Every item worked in order, one commit each, each with a test seen red against the unfixed code
where a test could be red at all. `npm run gates` green after every commit, **on Linux** (see P7).

| Item | Commit    | Red-first evidence                                                               |
| ---- | --------- | -------------------------------------------------------------------------------- |
| P0   | `7d82ac4` | `plugin-manifests` failed on the CHANGELOG citation; two `skill-coverage` rows   |
| P1   | `790863d` | `TypeError: result.split is not a function`, twice                               |
| P2   | `922131d` | sibling-edit notice timed out; three `site-helpers` units; the end-to-end drop   |
| P3   | `3755306` | the guessed-folder warn (unit and end-to-end); the named-folder cases are guards |
| P4   | `67f61d5` | zero warnings under `hash: true` on the files that warn under `hash: false`      |
| P5   | `ee60a93` | `forbiddenPackedFiles is not a function`                                         |
| P6   | `b45bae7` | `registerPartials(): any[]` in the emitted declaration                           |
| P7   | `30f31e6` | **none available here** — the assertion can only fail on Windows                 |
| P8   | `f0f4656` | two watcher units timed out; the stale `<site helpers>` failure; the delete      |
| P9   | `b9169fb` | not a test: output proven byte-identical with and without the change             |
| P10  | `ff5b3e9` | not testable — a contradiction between two sentences                             |

Three things the plan did not anticipate, all folded in:

- **P0 grew a tarball change.** `CHANGELOG.md` was not in `files`, so the skill's new §0 cited a
  path a consumer does not have. The existing whitelist test caught it, which is what it is for.
- **P8's "unverified" check was real.** `_failures` is cleared by `_replay()` and nothing else, and
  a helpers reload is a scoped rebuild — so a broken save stayed in `report()` for the rest of the
  session after the file was fixed. Each load now replaces the last one's outcome.
- **P8 also needed a decision the plan left open**: what a _deleted_ entry means. It unregisters
  the site's helpers, for the same reason P2b unregisters a dropped one.

Left unverified, stated rather than buried:

- **P7 has no red on this machine.** `helpersEntry`'s separator only goes wrong on Windows, and
  every "gates green" reported on this branch was a Linux checkout. CI's `windows-latest` leg is
  the only thing that can confirm it.
- **The restart notice for a sibling module is the honest answer, not a working one.** An author
  editing `helpers/format.js` still has to restart. A loader hook could make it reload; nothing
  here tries.
- **P10 is a reading, not a test.** Nothing fails if llms.txt contradicts itself again.

## Second round — 2026-09-20, after the peer re-review

The remediation above introduced six defects of its own, found by a downstream Codex review and a
peer session's probe harness. Every one was re-derived here by execution before being acted on, per
the repo's rule on relayed findings — and the worst of them was real.

| Finding | Commit    | What it was                                                                    |
| ------- | --------- | ------------------------------------------------------------------------------ |
| R1a     | `43186e2` | **the feature was inert in its own default configuration** (see below)         |
| R1b     | `43186e2` | deleting the active entry never activated an existing `index.mjs` fallback     |
| R1c     | `43186e2` | a data file beside the helpers was told to restart, when a rebuild picks it up |
| R2a     | `0ab339c` | a registrar that threw part-way left its own registrations behind, untracked   |
| R2b     | `0ab339c` | "continues without site helpers" kept the previous load's helpers registered   |
| R3a     | `3eb949b` | rendering was not ordered against the reload's empty-registry window           |
| R3b     | `3eb949b` | a helpers folder inside `src` was dispatched by both watchers                  |

**R1a is the one that matters.** `resolveConfig` leaves `./helpers` relative, chokidar emits relative
events, and `helpersEntry` returns an absolute path; `posixPath` swaps separators and resolves
nothing. So every edit to the **entry** took the sibling branch: restart notice, no reload, no
rebuild. Reproduced here in a temp cwd with the shipped default, and confirmed independently by the
peer on Windows and on a real site.

The coverage gap that hid it is the lesson, not the bug. Every test in the suite named the folder
absolutely — `grep -rn "'./helpers'" test/` returned nothing — so **the tested path and the shipped
path were different paths**, and all five gates stayed green through a feature that did not work.
A convention with a default needs a test that uses the default.

Two more things corrected rather than fixed:

- **"Pages fail loudly" was overstated**, in a commit message and in `AIKB/kiss.md`. Measured:
  `{{shout "hi"}}` throws and is logged; `{{copyright}}` with no arguments renders **empty**,
  because Handlebars treats an argument-less mustache as a missing property rather than a missing
  helper; and `_rebuild` catches per page, so the stale file stays on disk. The console is loud, the
  served bytes are stale. Corrected in place.
- **P7's Linux-only caveat is retired.** The peer ran the full gates on Windows: green, and
  `test/unit/site-helpers.test.js` was 1-failed at the old tip and 14-passed after the fix. That is
  the evidence this session could not produce.

Still open, and honestly so: Codex's objection to P3's `required` line — that treating _any_ import
exception as evidence the folder is kiss's own is wrong, with a browser-utility barrel touching
`window` at top level as the counterexample. It predates this remediation and is not fixed here.

## Third round — 2026-09-20, the multi-session verification loop

A peer session running OpenAI Codex, a real-site variance harness across six kiss sites, and a
clean-room conversion of spirit-of-boogie (an agent working only from the published docs, never
reading `lib/`). Thirteen more fixes, `3810fe5`..`9a6a82a`. Full narrative and the transferable
lessons are in `planning/sessions/2026-09-20-dev-rebuild-honesty.md`; this is the index.

| Item | Commit    | What it was                                                                                            |
| ---- | --------- | ------------------------------------------------------------------------------------------------------ |
| R4   | `3810fe5` | ownership deleted a name instead of restoring what it displaced — an overridden built-in was destroyed |
| R5   | `a2846f5` | ownership observed rather than diffed; the redundant hand-call diagnostic                              |
| R6   | `c19529f` | a guessed helpers folder trusted by name, not by shape                                                 |
| R7   | `4000458` | the watch dispatch covered under the shipped relative defaults                                         |
| R8   | `e9ba3f8` | **a stylesheet that will not compile now fails the build** (was silent-green)                          |
| R9   | `acaac84` | the Windows-only fixture, and an ESLint rule banning the idiom                                         |
| R10  | `3dfbc8a` | the helpers discriminator moved before the import                                                      |
| R11  | `1f2998b` | **`isActive` was documented as a helper kiss does not have** (docs only)                               |
| R12  | `cf6bb8f` | R8 broke standard Sass partials; R10 silently dropped valid registrars                                 |
| R13  | `9a6a82a` | the Sass fixes stop losing output and failures silently                                                |

Three of those (R6, R10, R12's Sass half) were fixes for defects the previous round's fixes
introduced. That ratio is the branch's own warning about turnaround speed.

**Closed since `9a6a82a`:**

- `753bca2` **R14** — `_replay()` emptied `_failures` and rebuilt the list from the work it
  re-runs, which is honest only for the work it actually re-runs. It never re-imports the helpers
  entry, never restarts the dev server, and recompiles stylesheets only when an `assets.pipeline`
  step is configured. Measured: a site whose `site.scss` would not compile reported `ok` on the
  next controller save. The replay now sweeps rather than empties, carrying `<sass: …>`,
  `<site helpers>` and `<dev server>`.
- `1bcf059` **R15** — R13's copy-scoped Sass identity was a prefix of the view string, so a copy
  of a parent asset root cleared a nested root's unresolved failure (found by the QA session,
  reproduced here). Identity is now the resolved `(source, target)` pair and the failures are
  owned by object identity. Also splits the Sass parse and write diagnostics, which both read
  "Error parsing sass file".
- `bfc577d` **R16** — nine clean-room documentation findings, each re-derived locally. `.html`
  partials documented as uncompiled; `{{asset}}` documented as failing the build; the
  `redirects.format` default; "3 methods" and a first example that exits 0 on a broken build; the
  150-line rule contradicting llms.txt; `{{root}}`; examples cited as files; the minifier's inline
  JS/CSS; and `AIKB/assets.md` asserting the pre-R8 behaviour beside its replacement. Six new
  CONTRADICTIONS rows, and `AIKB/` added to the scanned set — it ships in the tarball.

- `5b44f11` **R17** — R14's carry introduced its mirror image, found by the QA session, plus two of
  the same family from an independent review. One fix, not four: a second asset root's failure was
  unclearable (nothing re-ran that copy); a page whose inline-template `view` began `<sass: ` was
  carried for ever (the carry decision was pattern-matching a string the author writes); the copy
  key preserved the path's spelling, so two spellings of one directory were two owners on a
  case-insensitive filesystem; and a successful copy stored an empty map entry. Carriage is now
  recorded on the failure object (a `WeakSet`), the key is canonicalised through `realpath`, and a
  replay re-runs the copies still holding a failure. Also corrects an `{{asset}}` claim R16 itself
  introduced — the helper strips a leading slash from an unknown path.
- `5e427b0` **R18** — the last folder test in `_handleChange` that compared path spellings
  rather than resolving. A site naming `src` relatively and `pages` absolutely lost the scoped
  page re-render on every page edit: safe (it fell through to the replay fallback) and therefore
  invisible. Measured on that config before the fix. This is the QA session's long-standing
  finding (e), which its own premise had outlived — `isInside` was fixed in R10; this is the one
  test beside it that was never converted.

- `a964336` **R19** — restores the ESLint coverage the narrowing dropped (an explicit
  `new URL('file:///C:/x').pathname`) as a second selector, and pins all three cases — both
  file-URL forms caught, the http form deliberately not — in `test/unit/eslint-config.test.js`.
  The coverage was lost silently because a lint rule that stops matching is indistinguishable
  from a codebase with nothing to match; asserting what is NOT caught is what tells them apart.

- `47ba4bd` **R20** — pins R17's copy-identity canonicalisation two ways: a symlink (runs
  everywhere, and mutation-tested against the refactor that would actually happen — swapping
  `realpathSync.native` for `path.resolve`) and a Windows-gated case test. Corrects the belief
  that CI is Linux-only: the gates run on `ubuntu-latest` AND `windows-latest`, so a
  `skipIf(win32)` test is a real gate. `AIKB/testing.md` carries the convention.
- `271b416` **R21** — four more of R17's family, each reproduced here first. The copy key changed
  when its target came into existence (`realpath`'s ENOENT fallback recorded the spelling, then
  the canonical form once the folder existed) — R17's own fix returning by a new route, and
  reproducible on Linux through a symlinked parent rather than only on Windows. A relative copy
  lost its obligation when the working directory moved. `_assetCopies` grew without bound. And the
  lint selector missed `FILE:` and a leading space — a ban that did not cover the spellings of the
  thing it banned.

- `4f23b76` **R22** — `report()` stops lagging the log between settles. Courtenay overruled the
  decision to document this rather than fix it, and the overrule was right: the cost objection
  ruled out re-running `_finishBuild()` per keystroke, not re-deriving the report.
  `_refreshReport()` re-derives it wherever the failure list moves without a build settling (the
  asset copy, the helpers reload) and deliberately does not touch `_finishBuild()`'s once-per-build
  side effects — a test asserts `KISS_REPORT` still has one line after a save that flips `ok`.
  Both call sites read one `_reportInputs()`.

- `6b61866` **R24** — four P2s from the Codex round. A report refresh counted idle session time as
  build time (R22 introduced it and R22's own docs denied it); the INITIAL copy ran against the cwd
  at drain time, not registration time; the copy key is computed after the copy runs, when the
  target exists. Finding 20 closed by construction, finding 18 unreproducible on Linux — both said
  so rather than claimed. `report()`'s claim narrowed to "never behind `failures`", because a
  scoped page re-render records nothing and that gap is real.
- `22ef312` **R25** — **breaking.** `{{asset}}` on a path no copy emitted fails the build, matching
  `{{link}}`; dev warns and renders the path as written. Taken under the operator's steer that
  architectural elegance outranks compatibility — the old behaviour shipped a 404 on a green build,
  and R16/R21 had corrected its documentation twice without either of us asking whether the
  behaviour was right.
- `3d2e216` **R26** — `AIKB/upstream.md`, and the two standing policies behind it: upstream is
  documented rather than engineered around (with the version observed and how to re-check it), and
  architectural elegance is the prime objective, not compatibility. The ESM entry records that
  `module.register()` DOES evict siblings (measured) and is declined anyway, rather than asserting
  the limitation is absolute — which is what the docs used to do.
- `eaa8311` **R27** — finding 20 converted from closed-by-construction to closed-by-demonstration,
  using the deterministic fixture the QA session produced after I said I could not build one.

**Open at `eaa8311`:**

- **Three fixes are verified on one machine only.** Finding 18's not-yet-created destination,
  R20's case test and R21's canonicalisation all assert a property that is meaningful only on a
  case-insensitive filesystem. They run on CI's `windows-latest` leg once this merges; until then
  the QA session's Windows box is the single point of verification. The symlink half covers the
  same mechanism portably, which is why this is a note rather than a risk.
- **A scoped page re-render records no failure at all.** `_rebuild` catches each page's rejection
  and pushes nothing, so a page that starts failing under `.watch()` is loud in the console and
  absent from both `_failures` and `report()`. Pre-existing, found by Codex while checking R22's
  claim, and the reason that claim is now scoped to "never behind `failures`" rather than "never
  behind the log". Fixing it changes what a watch rebuild reports rather than how, so it wants a
  decision rather than a patch.
- **The version string does not distinguish the branch from the release.** `package.json`,
  both plugin manifests and the installed 2.4.0 plugin cache all read `2.4.0` while carrying
  materially different skill text — so a consuming agent cannot tell which it has, and the cached
  copy still teaches `src/helpers/` and a `registerHelpers(kiss)` call. Raised by the QA session.
  Not acted on here: the version bump belongs to `/branch-close`, which this branch has not been
  asked to run. Worth deciding whether `/branch-open` should bump to a prerelease tag so the two
  copies are distinguishable mid-branch.
- Not a defect, recorded so it is not re-found: the examples hand-type internal URLs against
  llms.txt's opening rule. The rule was wrong, not the examples — `{{link}}` emits a leading slash,
  which cannot resolve in a build opened straight off the file system, which is what those
  examples are for. The rule now carries the exception.

## Verified 2026-09-21 — every open item re-checked at `eb67929` (main, after the 2.5.0 merge)

Operator's Windows laptop, the platform this branch never had. Each line says what was measured;
"closed" means the code was read and the evidence seen here, not that a log said so.

- **Three fixes verified on one machine only — closed.** CI run 35569913921 on the merge commit:
  `gates (windows-latest)` and `gates (ubuntu-latest)` both success. Full suite here: 69 files,
  1514 passed, 2 skipped. The Windows-gated cases ran as real tests, not skips, on this box.
- **A scoped page re-render records no failure — closed by R29 (`a9ffaa7`)**, which landed after
  this list was written. `_rebuild` now drops the entry's previous failure and records a new one
  (`lib/kiss.js:2433`, `AIKB/kiss.md:25`); the accepted cost is `ok: false` on a transient mid-edit
  error until the next save. The 2.5.0 CHANGELOG names it.
- **The version string — open, and now a release action rather than a design one.** `package.json`
  and both plugin manifests read 2.5.0; npm's latest is still 2.4.0 (modified 2026-09-18); no
  `v2.5.0` tag exists; the installed marketplace plugins are 2.4.0, and the cached 2.4.0
  `kiss-page-add` and `kiss-site-new` skills still teach `registerHelpers(kiss)` and `src/helpers/`.
  `npm publish` closes it (the `postpublish` hook tags). The mid-branch prerelease question for
  `/branch-open` stays open; nothing decided here.
- **Codex's objection to P3's `required` line (second round, "still open") — closed by R6/R10.**
  A guessed folder is gated on its source mentioning `registerHelpers` **before** any import
  (`lib/site-helpers.js:248`); an unrelated barrel that throws on import is never imported, and a
  guessed folder that does declare the export and then throws is a build failure because it named
  itself kiss's. The `window`-at-top-level counterexample is the fixture at
  `test/unit/site-helpers.test.js:619`.
- **"Left unverified" from the first round:** P7's Linux-only caveat was already retired on the
  peer's Windows run and is now retired again on this one. The sibling-module restart notice is
  still the honest answer, not a working reload (`lib/kiss.js:3067`), and `AIKB/upstream.md:61`
  records `module.register()` as considered and declined. P10 is still a reading, not a test.
- **Session-log non-goals:** F2 (sass/css collision) and F5(b) (leading-slash `dangling`) were
  absorbed and fixed on the branch; their tests are in `test/unit/assets.test.js` (the collision
  detector, `:315`) and `test/unit/aikb.test.js`. F4 (`{{url}}`) is not built — no such helper is
  registered — and is a feature request, not a defect. The bench-baseline contradiction (CLAUDE.md
  names `planning/benchmarks/baseline-main.json` as the baseline; the 09-06 follow-up says a
  committed record is history) has now been asked in three logs and is still the operator's one
  sentence.

Found while verifying, not on this list — recorded in `to-verify.md` § "Found while verifying":
every example README and `examples/11-blog/router.js:36` cite the pre-router `node <n>-<name>.js`
entry files (removed in #17), example 10's README names the tool's fallback output path rather than
the one kiss uses, and 2.5.0 is merged but unpublished.
