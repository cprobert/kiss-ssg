# Review: `codex/protect-source-folders` (2026-09-22)

**Reviewer:** Claude (Fable 5.1), a separate session from the one that wrote the branch.
**Scope:** the five commits since `main` (`e8632a5` → `4a934c3`): `lib/asset-manifest.js`, `lib/assets.js`, `lib/config.js`, `lib/kiss.js`, `lib/watcher.js`, their tests and docs. The working-tree `CLAUDE.md` edit and the untracked `.claude/skills/bench/` are the operator's separate bench-skill work and were not reviewed.
**Method:** an eight-angle recall pass by a subagent, then every finding re-derived by the reviewing session against the code at `4a934c3`. Each finding says which. None was executed as a test; "confirmed" means confirmed by reading the code path, not by running it. The session log correctly says no independent review had run before this one.

Overall: the branch does what it set out to do, and the docs, types, `llms.txt`, README, skill files and the `CONTRADICTIONS` table all moved with the code. The findings below are two dev-loop regressions introduced while unifying asset handling into the rebuild queue (1 and 2), one ownership gap with a content-loss shape (3), and four smaller items. Ranked most severe first.

---

## 1. Under `assets.hash`, any asset save re-renders the whole site

**Where:** `lib/kiss.js:2985`
**Status:** confirmed. `renderAssets = assets.length > 0 && this.config.assets.hash`. The `isHashable` import was removed from `lib/kiss.js` in this range, and the old per-file gate `this.config.assets.hash && isHashable(built)` with it.

**Failure:** a site with `assets: { hash: true }` and a few hundred pages; the author saves an image or a font under `--dev`. `renderAssets` is true, so `_rebuild(this._stack)` renders every page and reloads `/`. The previous code reloaded the one built asset path.

**Fix:** gate on the paths already held in `_pendingAssets`:

```js
const renderAssets =
  this.config.assets.hash &&
  assets.some(([p]) => isHashable(p) || /\.(scss|sass)$/i.test(p))
```

Note that `AIKB/kiss.md` line 39 currently documents the regression as intended ("Hashed assets re-render all pages even for Sass partial edits"). If the gate is restored, that sentence has to change with it.

## 2. A Sass entry-file edit now forces a full page reload

**Where:** `lib/kiss.js:2986-2994`, `lib/kiss.js:3262-3277`
**Status:** confirmed. `refreshPath` excludes every `.scss`/`.sass` path, so `_builtAssetPath` is never reached for Sass. Its `.scss → .css` branch at 3267-3269 is now dead code. Its manifest lookup at 3271-3275 can still execute, but only when hash is off, where the manifest maps a name to itself, so it can no longer return anything different from the plain path.

**Failure:** hash off, author edits `src/assets/main.scss`. Old path: livereload was handed `.../main.css` and swapped the stylesheet in place. New path: `refreshPath === '/'`, full reload, scroll position and form state lost on every Sass edit. Only a Sass _partial_ (`_theme.scss`) has no single built file to name; a non-partial still maps to its own `.css`.

**Fix:** either exclude only partials (`/(^|\/)_[^/]*\.(scss|sass)$/i`) so a non-partial keeps the stylesheet swap, or delete the dead branches in `_builtAssetPath` and say in the comment that Sass always reloads the page. Keeping a mapping function whose Sass branch cannot be reached is the worst of the three.

## 3. Reconcile unlinks a file another kiss producer wrote

**Where:** `lib/assets.js:210-217`, `lib/kiss.js:1061-1069`
**Status:** confirmed by reading; not executed. `protectedPaths` is built from `entry.buildTo` and its `.json` sibling only. `robots.txt`, `sitemap.xml`, `llms.txt`, `feed.xml`, `redirects.json`, `_redirects` and `dependency-graph.json` are not in the set, and nothing re-emits them until the next replay, which an asset `unlink` event does not request.

**Failure:** a site ships `src/assets/robots.txt` and also calls `.robots()`. On the first build the asset copy claims `robots.txt` for its owner, then `.robots()` overwrites it at settle, so the site serves the generated one. Under `--dev` the author deletes the static file (migrating to `.robots()`). The asset watcher fires `unlink`, `reconcile` returns `robots.txt` as stale, and `fs.unlink(public/robots.txt)` removes the file `.robots()` wrote. The preview serves 404 for `/robots.txt` until an unrelated replay.

**Altitude:** the pulse log records that the `.json` sibling was found and patched once already during the branch. That is the usual sign the list of special cases is not closed. `protectedPaths` is one fix for a general problem, two producers claiming one output path, which the Sass-versus-`.css` collision warning at `lib/assets.js:200` already handles by _saying so_. A build-level "asset output collides with page or auxiliary output" warning at claim time would cover pages and auxiliaries alike and make the protected set unnecessary. Short of that, the auxiliary writers could register their outputs in the same set.

## 4. `record()` has no caller left in `lib/`

**Where:** `lib/asset-manifest.js:63`, `AIKB/asset-manifest.md:14,33`, `types/asset-manifest.d.ts`
**Status:** confirmed by grep. `recordEmitted` switched to `reconcile`; the only remaining call to `manifest.record` is `test/unit/asset-manifest.test.js:93-100`. The AIKB doc says "The `record` primitive remains available for direct callers", so this was a deliberate keep, not an oversight.

**Why it still matters:** a mapping written through `record` is not owned by any reconcile owner, so the next `reconcile` for that owner neither deletes nor keeps it deliberately. An agent reading the doc or the types reaches for the primitive and gets a file the cleanup pass does not know about. Either remove `record`, its test and the doc bullet, or state in the doc that `reconcile` is the only writer and `record` is for tests.

## 5. A cwd realpath failure is blamed on `folders.src`

**Where:** `lib/config.js:443`, `lib/config.js:409-420`
**Status:** confirmed. `folderLocations(process.cwd(), 'src')` passes the label `src`, so `realFolder(cwd)` throwing produces `Cannot safely resolve folders.src (C:\...): ...` even when `folders.src` is fine or null.

**Failure:** process started in a directory later removed or made unreadable (a CI workspace torn down mid-run, EACCES on an ancestor). The error names a setting that is not at fault.

**Fix:** pass a distinct label, or resolve the cwd outside the `folderLocations` wrapper with its own message.

## 6. A test plants a junction to the live repo inside a folder that gets `fs.remove`d

**Where:** `test/integration/config.test.js:127-137`, `test/helpers/site.js:22`
**Status:** confirmed. The alias test creates a junction (Windows) or symlink to `process.cwd()` inside `site.root`, and `site.cleanup()` is `fs.remove(dir)`, recursive. Safe today because Node's `rm` unlinks reparse points without following them. The test's own comment shows the author saw the hazard.

**Failure mode if anything changes:** a future `makeSite` cleanup that walks manually, a `readdir({ recursive: true })` snapshot the way `expectPreserved` already takes, or an fs-extra major that follows junctions on Windows, turns a test failure into `rm -rf` of the checkout.

**Fix:** cheap guard. Unlink the alias explicitly (`fs.unlink` or `fs.rmdir` on the link itself) before `cleanup`, or point the alias at a temp sibling that realpaths to a different root and assert on that instead of the live repo.

## 7. The asset watcher logs "changed" for every event, before settle

**Where:** `lib/watcher.js:231`, `lib/watcher.js:89-104`
**Status:** confirmed. `logger.info('Asset changed: ', p)` runs for `add`, `change`, `unlink` and `unlinkDir` alike, and runs before `notifyAssets`, which is the `settled()` wrapper that holds an empty-file event for 200 ms and coalesces a follow-up.

**Failure:** deleting `src/assets/old.txt` logs "Asset changed". An editor that truncates then writes logs two lines for the one event that is dispatched.

**Fix:** move the log into the settled callback and name the event (`Asset ${event}: ${p}`), the way the source watcher leaves the wording to `_handleChange`.

---

## Notes

- Findings 1 and 2 are both one-line gates on data `_pendingAssets` already carries. Fixing 1 needs the `AIKB/kiss.md` sentence updated in the same commit.
- Finding 3 is the only one with a content-loss shape in a watch session. It is also the one where the fix is a design choice rather than a patch.
- Nothing in the range violates a quotable `CLAUDE.md` rule. `llms.txt`, `README.md`, `types/`, the AIKB docs, the skill files and `skill-coverage.test.js` (including `CONTRADICTIONS` bans for the two now-wrong empty-file sentences) all moved in the same range.
- The pulse log's outstanding item, the example-4 dev-mode eyeball (clear and restore the footer partial, confirm the preview follows both saves), is still pending and is the manual checkpoint `/branch-close` will ask for.
- Out of scope but worth knowing before the next commit: the working-tree `CLAUDE.md` edit references `.claude/skills/bench/SKILL.md`, which is untracked. Committing one without the other leaves a dangling reference `/corpse-collector` will flag.
