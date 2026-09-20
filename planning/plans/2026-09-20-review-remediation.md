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
