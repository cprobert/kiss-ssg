# 13. Stop committing the built docs

**Model:** Sonnet. **Impact surface:** tooling and docs.

## Before starting: the operator

A yes or no: should `docs/` stop being tracked in git? Fable recommends yes. If the answer is
no, this work order is replaced by one line in `/branch-close` that rebuilds `docs/` after the
version bump.

## Objective

Remove a build output from version control, so that building the docs never dirties a clean
checkout and no commit carries a stale copy.

## Paths in scope

- `docs/` (removed from the index, kept out by `.gitignore`)
- `.gitignore`
- `CLAUDE.md` (the sentences that describe `docs/`)
- `README.md` (only if it links into `docs/`)
- Any test in the list step 1 produces

Out of scope: `docs.js`, `src/`, `.github/workflows/static.yml`.

## Assumptions

- `docs/` holds 84 tracked files. Measured (`git ls-files docs`).
- The deploy workflow runs `node docs` from a clean checkout before uploading
  (`.github/workflows/static.yml:32-34`), so the deployed site never uses the committed copy.
  Measured.
- On a clean checkout of `0ab9c7e`, `node docs` changes 14 tracked files, and the difference is
  the `generator` tag: the committed pages say `kiss-ssg 2.13.3` and the build says `2.14.0`.
  Measured, 2026-11-10. The build is reproducible; the committed copy is stale.
- Five test or script files mention `docs/`: `test/integration/packages.test.js`,
  `test/unit/handlebars-helpers.test.js`, `test/unit/fleet-check.test.js`,
  `test/unit/watcher.test.js`, `test/unit/guide-controller.test.js`. Measured by grep. Whether
  any of them reads a committed file under `docs/` is not checked.

## Steps

1. For each of the five files, find what it does with `docs/`.
   verify: the session log says, for each, whether it reads a tracked file there.
2. If none does: `git rm -r --cached docs`, add `docs/` to `.gitignore`, and replace the
   narrower `docs/*.json` line.
   verify: `git status --short` shows the removals and nothing else under `docs/`.
3. Run `node docs`.
   verify: it exits 0 and `git status --short` shows no change from it.
4. Update `CLAUDE.md`: `docs/` is build output, ignored, built by the deploy workflow.
5. verify: `npm run gates`.

## Stop and ask

- The operator's answer has not been given.
- Step 1 finds a test that needs a committed file under `docs/`.
- GitHub Pages is found to be serving from the branch's `docs/` folder and not from the workflow
  artifact. That is a repository setting an agent cannot read; if in doubt, ask.

## Fast feedback

```sh
git status --short docs
```
