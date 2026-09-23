# Fleet check: `codex/protect-source-folders` at `6d24494` against the consuming sites (2026-09-22)

**Question:** does this branch break any of the operator's real kiss sites?
**Answer:** no. Four sites build identically on the registry 2.5.0 they run today, on unreleased `main` (2.5.1) and on the branch. Every page is unchanged by content hash on every pairing, every build exits 0 with no failures, and the branch's new output-ownership registry engaged on all four with zero collisions.

## Method

Sites under `C:\Code\kiss\` with a `kiss-ssg` 2.x dependency: `a1k9training`, `pro-plumbing`, `swan-love`, `metacarpus`. (`medulla` is on 1.x and cannot run on any 2.x; three other folders have no `package.json`. The fleet-upgrade review's `diploma-msc`, `learna-kiss` and `cprobert.github.io` are not under this folder and were not run.)

For each site, a harness (session scratchpad, `fleet-check.mjs`, not in the repo) ran `node C:/Code/kiss-ssg/bin/kiss-ssg.js check <script>` three times from the site's own folder, swapping `node_modules/kiss-ssg` between runs: the registry 2.5.0 copy, a junction to a temporary worktree of `main` at `bf6878d`, and a junction to the branch working tree at `6d24494`. The check publishes nothing. The engine line on stderr confirmed which copy each run resolved. The three JSON reports were diffed pairwise with the check command's own `diffReports` (pages by content hash). `git status` was recorded before and after; the registry copy was restored in a `finally`. pro-plumbing was run by the orchestrating session; the other three by one Sonnet subagent each, every claim then re-derived by the orchestrating session from the harness files.

## Results

| Site         | Script                                                                    | Pages         | registry 2.5.0 | main bf6878d | branch 6d24494 | Pairwise page diffs | Branch-only stderr lines |
| ------------ | ------------------------------------------------------------------------- | ------------- | -------------- | ------------ | -------------- | ------------------- | ------------------------ |
| a1k9training | `router.js` (Tailwind pipeline, hash, netlify redirects, llms, 557 links) | 20            | exit 0, ok     | exit 0, ok   | exit 0, ok     | `= 20 unchanged` ×3 | none                     |
| pro-plumbing | `router.js` (atomic, hash, netlify, robots, llms)                         | 7             | exit 0, ok     | exit 0, ok   | exit 0, ok     | `= 7 unchanged` ×3  | none                     |
| swan-love    | `router.js` (atomic into ./docs, sitemap, robots)                         | 11            | exit 0, ok     | exit 0, ok   | exit 0, ok     | `= 11 unchanged` ×3 | none                     |
| metacarpus   | `new-cohort.js test` (atomic, Tailwind pipeline, CommonJS)                | 0 (see below) | exit 0, ok     | exit 0, ok   | exit 0, ok     | `= 0 unchanged` ×3  | none                     |

On every site, `main` versus branch stderr is identical once timing numbers, the random staging suffix and the engine line are normalised. The branch report alone carries `"outputs": { "collisions": [] }`, the key Codex's round-two commit added; it is empty on all four.

The only difference between registry and the later engines is one log line, `Copied assets: ./src/assets to ./docs` instead of the staging path, plus relative rather than absolute Sass output paths on swan-love. Both come from 2.5.1's "the staging folder stays out of `config.folders.build`" change on `main`, and are identical between `main` and the branch.

**metacarpus is a partial result.** Its page models live in gitignored `src/models/`, fetched from a CMS with credentials not on this machine, so the folder is empty. All three engines logged `Invalid model studentHandbooks` twice and built zero pages, identically. What that run does prove: the branch's folder-safety checks accept the site's layout (`build: './handbooks/test'`), the Tailwind pipeline step ran and reported `ok` on every engine, and the ownership registry engaged. What it does not prove: page rendering for that site.

## Site-level findings for the operator (not branch defects)

1. **`npm ci` fails on a1k9training and metacarpus.** Both lockfiles are out of sync with `package.json` (`Missing: picomatch@4.0.7 from lock file`). A host that installs with `npm ci` would fail the deploy. For this test they were installed with `npm install --no-package-lock --ignore-scripts`, which read and wrote neither lockfile; the resolved kiss-ssg was 2.5.0 and Tailwind 4.3.3 either way. `npm install` in each site would resync the lock.
2. **metacarpus's Tailwind step rewrites a tracked file.** The pipeline writes `src/assets-cohort/css/output.css`, which is committed, so every `check` dirties the tree (a1k9training's equivalent is gitignored). The check is documented as not read-only over the source tree. The file was restored to HEAD after the run; the change was byte-level minifier output, same on all three engines.
3. **A zero-page build passes `check`.** With no models, metacarpus reports `ok: true`, zero pages, zero failures, and `check` exits 0. The engine treats an invalid `.pages()` model as a warning. Whether "built nothing" should ever be a passing check is a policy question for kiss-ssg, noted here rather than judged.

## What was not verified

Dev mode on any real site (builds and `check` only; the branch's watcher changes were verified separately in a headless browser on example 4, see `2026-09-22-protect-source-folders-review-2.md`). No CMS data fetched. No deploy. `medulla` (1.x) and the three fleet sites outside `C:\Code\kiss` not run.

## Housekeeping

Every site's `node_modules/kiss-ssg` is the registry 2.5.0 copy again (a real folder, not a link, no aside folder left), and every site's `git status` is clean. All four sites now have `node_modules` installed; they had none before, and the folder is gitignored. The temporary `main` worktree and its junction were removed; `git worktree list` shows only the repo. Nothing was committed or pushed in any site.
