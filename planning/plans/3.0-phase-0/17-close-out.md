# 17. Close-out

**Model:** Sonnet. **Depends on:** every other work order. **Impact surface:** docs.

## Objective

Leave Phase 0 with no stale to-do list in the repo, a recorded fleet baseline, and a recorded
answer to "can the weakest implementer work here?".

## Paths in scope

- `TODO.md`, `to-verify.md` (deleted)
- `planning/plans/3.0-phase-0/` (deleted, once every work order is done)
- `planning/plans/2026-11-10-roadmap-to-3.0.md` (Phase 0 marked done, budgets re-stated)
- `planning/reviews/<date>-phase-0-exit.md` (new)

Out of scope: everything else.

## Assumptions

- `TODO.md` has six rows; two say "Implemented and tested" and four say "Open". Measured,
  2026-11-10. Of the four: the staging sweep is work order 03; the hashed imports are work
  order 07; the fetch body timeout is already fixed in the code (`lib/fetch-policy.js:218-241`)
  and the row is stale; "auxiliary output can fail while the build reports `ok: true`" has no
  work order and has not been checked.
- `to-verify.md` has not changed since early October and holds one item that needs the
  learna-kiss repository, which is not on any machine an agent uses. Measured.
- The fleet's sites are on the operator's machine only. Measured: none is in this repository.

## Steps

1. For the unchecked `TODO.md` row, build the case: request a sitemap or feed in a way that
   fails, and see what `report().ok` says.
   verify: the session log holds the script and the output. If the defect is real, write it up
   as an issue draft with `npx kiss-ssg issue`; do not fix it here.
2. For each remaining row in `TODO.md` and `to-verify.md`, record one of: fixed (with the
   commit), disproved (with the evidence), or filed as an issue.
   verify: every row has one of the three.
3. Delete both files and remove any link to them.
   verify: `npx vitest run test/unit/corpse-collector.test.js test/unit/markdown-links.test.js`.
4. Write the exit report: each work order and its outcome, the budgets table from
   `node scripts/budgets.mjs`, and the two operator items below.
5. verify: `npm run gates`.

## For the operator

These need machines and judgement an agent does not have. The exit report leaves a space for
each result.

1. **Fleet baseline.** For each real site, run the fleet check against the last release and keep
   the output:

   ```sh
   node scripts/fleet-check.mjs <site folder> --base v2.14.0
   ```

2. **Clean rooms on Sonnet.** Run the review's two briefs (a new helper from a fresh clone; the
   bakery site from the packed tarball) with `scripts/arms.mjs` on Sonnet, and record attempts to
   green and where it guessed. The review's 4 out of 5 came from a more capable model.
3. **An independent review** of Phase 0 by Codex, with the scope and stop condition written
   first.

## Stop and ask

- Step 1 shows the defect is real and affects an ordinary site: tell the operator before
  finishing, because it may belong in Phase 0.
- Any work order is not done. Do not delete the folder.

## Fast feedback

```sh
npx vitest run test/unit/corpse-collector.test.js
```
