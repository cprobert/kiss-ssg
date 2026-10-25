# Review: issues already in kiss, found by a clean-room run (2026-10-25)

**For:** a session working on kiss-ssg's main line. None of these came from the learning-packages branch (`feat/learning-packages`, worktree `C:\Code\kiss-ssg-learning-packages`), and that branch leaves them alone on purpose.
**Found by:** a clean-room run on 2026-10-25. A fresh agent got only the packed tarball (`npm pack` of `feat/learning-packages` at `8be80b4`) and the docs that ship in it. It built a small two-lesson course in a scratch project, then reported every place it had to guess. Its findings about learning packages were fixed on the branch (`f106eac`). The ones below were already on `main`.
**Method:** each item was confirmed by the session that ran the clean room, against the files named, at `f106eac`. Every one is also on `main` (checked with `git show main:<file>`), unless the item says otherwise. Ranked by how much each costs a newcomer.

---

## 1. GUIDE and llms.txt disagree about `{{root}}`, and two statements are wrong

- `GUIDE.md:188-190` (§ Building a site well) says a build opened off the file system uses "`{{root}}` plus a relative path (see `asset` under **Helpers**, and `examples/11-blog`)".
- `llms.txt:23` says the same: "a build opened off the file system (`{{root}}` plus a relative path, `examples/11-blog`)".
- `GUIDE.md:332` (§ Assets) says the opposite of example 11: "`examples/11-blog` shows the other road: every link through `{{link}}` and `/{{asset …}}`, root-relative, no `root` at all."

**Line 332 is right.** `examples/11-blog/src/layouts/layout.hbs:16` is `href="/{{asset 'css/site.css'}}"`, and no file under `examples/11-blog/src` contains `{{root}}`. The pattern lines 188-190 and `llms.txt:23` mean is in the small examples (`examples/3-pages/src/pages/roasts/roast.hbs`, `{{#extend "layout" root="../"}}`).

**Why it matters:** an undefined `{{root}}` renders empty without a warning (`GUIDE.md:332` says so). An agent sent to example 11 for the off-the-file-system pattern finds root-relative links instead, and has to guess.

**Fix:** point lines 188-190 and `llms.txt:23` at `examples/3-pages` (or any small example that sets `root` on the extend), not at `examples/11-blog`.

## 2. `llms.txt` tells the reader to call `reportBuildFailure`, and never defines it

`llms.txt:13` ends the build-script recipe with "`await kiss.complete().catch(reportBuildFailure)`". No doc a user reads defines the function. The agent found it in `starter/router.js` and in the examples (for example `examples/10-asset-pipeline/router.js`: print `err.message` and each `err.failures[]` entry, then set `process.exitCode = 1`). The same line names `build`/`dev`/`check`/`aikb` scripts without giving the `dev` one (`node router.js --dev`, read as `process.argv.includes('--dev')`).

**Fix:** give the function's few lines in `llms.txt` § The build script (or point at `starter/router.js`), and the `dev` script with the others.

## 3. kiss's `prepare` script tries to run in every consumer's install

`package.json:36`: `"prepare": "git config core.hooksPath .githooks || exit 0"`. npm runs `prepare` when a package is installed from a tarball or a git URL. In the clean room, `npm install ../kiss-ssg-2.8.0.tgz` (npm 11) reported it among the blocked install scripts:

```
npm warn install-scripts   kiss-ssg@2.8.0 (prepare: git config core.hooksPath .githooks || exit 0)
```

It is blocked by default, so it did nothing here. But it names kiss as a package with an install script, and a consumer who approves install scripts, or runs an older npm, gets a `git config` run in their own project. That would set `core.hooksPath` to a `.githooks` folder their repository does not have, and turn off their hooks.

**Fix:** keep the hook setup out of `prepare`. A guard that does nothing unless the current folder is kiss's own checkout would do, or a script developers run once (`npm run hooks`). Check that the registry install no longer lists kiss under `install-scripts`. (`@parcel/watcher`'s native build is listed beside it. That one is a dependency's, and dev watch needs it.)

## 4. GUIDE's `.llms()` and `.feed()` examples use a real business

`GUIDE.md:570-598` (§ .llms()) and `GUIDE.md:644-665` (§ .feed()) use A1K9 Training, "Dog behaviour and obedience training in South Wales", with real `https://a1k9training.co.uk/…` URLs. `GUIDE.md:727` (§ Host URL policy) names `www.a1k9training.co.uk` as where Netlify was verified.

The examples folder uses a fictional business throughout (Aster & Oak, a Bristol roastery: `examples/README.md`). The guide is the one place that names a real one, and a reader copies the guide's examples. The Netlify row is a factual record of where a behaviour was verified, so it may reasonably stay. The worked examples would read better in the examples' fictional theme.

**Fix:** rewrite the `.llms()` and `.feed()` examples with Aster & Oak (`https://asterandoak.example/`, as `examples/10-asset-pipeline` uses), and decide whether line 727 keeps the real domain.

## 5. Two typos in GUIDE § .page()

- `GUIDE.md:409`: "Instead (in in conjunction) of using the .scan() method". The intended phrase is probably "Instead of (or in conjunction with) the .scan() method".
- `GUIDE.md:426`: "Views: can se a .hbs file or a string". The intended phrase is probably "can be".

## 6. The check summary says "1 assets"

`lib/build-report.js:536`: `` `${report.assets.length} assets, ${report.duration}ms` ``. A one-asset site prints `ok ./public (check) — 3 pages, 0 failed, 1 assets, 413ms`. "pages" has the same shape on that line. Every other count line in the build log (`Links:`, `Audit:`, `Package:`) already chooses singular or plural.

**Fix:** pluralise both. Check `test/unit/build-report.test.js` and any snapshot of `formatReport` for the old text.

## 7. A Markdown copy runs button labels together

A page with a question built from `<button>`s gets a Markdown copy in which the labels run into one line. From the clean room's `public/inspections/index.md`, line 24:

```
A queen laid in the last three days The colony is about to swarm The bees need more space
```

The HTML had three `<button type="button">` elements with those labels (one multiple-choice question). The converter, `lib/markdown-copy.js`, treats `<button>` as inline, so adjacent buttons join with only a space. An agent reading the copy cannot tell where one option ends. This matters more now that a page can be an interactive lesson.

**Fix:** decide what a `<button>` becomes in a copy: its own line or list item, or nothing when it is a control rather than content. Add a case to the copy's tests. A `<button>` inside a `<form>` may need its own answer.

## 8. AIKB pages point at `planning/`, which does not ship

`package.json` `files` ships `AIKB/` but not `planning/`. Seven AIKB pages reference `planning/…` paths:

- `AIKB/assets.md`, `AIKB/kiss.md` and `AIKB/testing.md`, from before the packages branch;
- `AIKB/package-manifest.md`, `AIKB/packages.md`, `AIKB/scorm-bridge.md` and `AIKB/zip.md`, added by that branch, which followed the existing habit.

In an installed package these are dead references. The clean-room agent noticed one.

**This is a convention question rather than a bug.** AIKB is written for kiss's maintainers, who have `planning/`. The packages branch followed the habit rather than change it alone. **Decide** one of: AIKB may cite planning (and then say so in `CLAUDE.md`, so readers of the installed copy know the paths are history); AIKB carries what it needs and cites no planning file; or `planning/` ships. Whichever is chosen, the packages branch's four pages follow it.

---

**Not in this list, and why:** the README's "Built with it" showcase names real sites (the agent noted it). That is a normal showcase, not a worked example, so it is left as it is.
