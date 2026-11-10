# 09. Scale test

**Model:** Sonnet. **Impact surface:** tooling (tests only).

## Objective

Fail the gates if build time stops growing in proportion to the number of pages.

## Paths in scope

- `test/integration/scale.test.js` (new)
- `AIKB/testing.md` (a short paragraph)

Out of scope: `scripts/bench.mjs`, `scripts/gates.mjs`, `lib/`.

## Assumptions

- The largest fixture in the suite today is 200 to 300 items. Measured by the test-quality
  review.
- Build time is linear: 805 ms at 250 pages, 2,614 ms at 1,000, 9,229 ms at 4,000, on one Linux
  container (`node scripts/bench.mjs --runs=3`, 2026-11-09). Measured. Four times the pages took
  about 3.5 times as long.
- A ratio between two sizes is steadier across machines than a time in seconds. Inferred. That
  is why the test asserts a ratio and no absolute time.

## Design (Fable, 2026-11-10)

Build the same generated site at 500 pages and at 2,000, in a temp folder, with the link check
and audit left on because they are the most likely place for a quadratic cost. Take the faster
of two runs at each size. Assert that the 2,000-page time is less than 6 times the 500-page time.
Linear is 4; quadratic is 16.

## Steps

1. Write the test. Generate the pages with `.pages()` over an in-memory array and one view whose
   template links to two other pages with `{{link}}`, so the link scan has work to do. Give the
   test a 120-second timeout.
   verify: `npx vitest run test/integration/scale.test.js` passes; print the two times and the
   ratio, and paste them into the session log.
2. Prove the test can fail: temporarily add a deliberate quadratic loop over the page list in the
   test's own controller, see the assertion fail, and remove it.
   verify: paste the failing output into the session log.
3. Run it five times.
   verify: five passes, and the five ratios are in the session log.
4. Add the paragraph to `AIKB/testing.md`: what it guards, why a ratio, and that the fix for a
   failure is in the engine, never a looser number.
5. verify: `npm run gates`.

## Stop and ask

- Any of the five runs in step 3 fails, or any ratio is above 5.
- The test adds more than 20 seconds to the suite.

## Fast feedback

```sh
npx vitest run test/integration/scale.test.js
```
