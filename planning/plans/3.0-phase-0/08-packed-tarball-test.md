# 08. Packed-tarball test

**Model:** Sonnet. **Impact surface:** tooling (tests only).

## Objective

Prove on every gate run that the package as published can be imported and can build a site,
using only the dependencies it declares.

## Paths in scope

- `test/integration/packed.test.js` (new)
- `test/helpers/` (one new helper file, if the test needs it)
- `AIKB/testing.md` (a short paragraph)

Out of scope: `scripts/gates.mjs`, `package.json`, `lib/`. The test runs inside the existing
`test` gate; there is no new gate.

## Assumptions

- The `pack` gate checks a file list from `npm pack --dry-run` and installs nothing
  (`scripts/gates.mjs:20-30`, `278`). Measured.
- `npm pack` writes a tarball whose contents sit under a top-level `package/` folder. Inferred
  from npm's behaviour.
- A dependency linked into a temp project's `node_modules` resolves its own dependencies from
  the repo's `node_modules`, because Node resolves a link to its real path. Inferred. Step 1
  proves or disproves it.
- On Windows a directory link needs the `junction` type to work without extra rights. Inferred.

## Design (Fable, 2026-11-10)

No network. In a temp folder: unpack the tarball into `node_modules/kiss-ssg`. For each name in
`package.json`'s `dependencies`, and only those, link `node_modules/<name>` to the repo's copy.
A module that kiss imports but does not declare then fails to resolve, which is the point.

## Steps

1. Do it by hand once in a temp folder, following the design.
   verify: `node -e "import('kiss-ssg').then(m => console.log(typeof m.default))"` prints
   `function` there.
2. Write the test. It packs once in `beforeAll` with a 120-second timeout, then asserts:
   - `import('kiss-ssg')` gives a class, and `require('kiss-ssg')` gives the same class
   - the starter, copied from `node_modules/kiss-ssg/starter`, builds with `node router.js`,
     exits 0, and writes `public/index.html`
   - `node node_modules/kiss-ssg/bin/kiss-ssg.js check router.js` exits 0
     verify: `npx vitest run test/integration/packed.test.js` passes.
3. Prove the test can fail: temporarily remove one name from the list of linked dependencies in
   the test and see the import fail; restore it.
   verify: paste the failing output into the session log.
4. Clean up the temp folder in `afterAll`. Add the paragraph to `AIKB/testing.md`.
5. verify: `npm run gates`.

## Stop and ask

- Step 1 does not work without installing from the network.
- The test takes more than 60 seconds locally.
- It fails on one operating system only.

## Fast feedback

```sh
npx vitest run test/integration/packed.test.js
```
