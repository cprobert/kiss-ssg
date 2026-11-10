# 11. Publish from CI with provenance

**Model:** Sonnet. **Depends on:** 10. **Impact surface:** tooling and docs.

## Objective

A published version is built by CI from a tagged commit and carries an npm provenance
attestation, so no tarball exists that a commit does not account for.

## Before starting: the operator

This cannot be done by an agent. The operator sets up npm trusted publishing for the `kiss-ssg`
package, naming this repository and the workflow file `publish.yml`, or decides to use a token
stored as a repository secret instead. The implementer does not start until the session is told
which. How npm's side is configured is from Fable's memory, not checked: read npm's current
documentation first.

## Paths in scope

- `.github/workflows/publish.yml` (new)
- `scripts/tag-release.mjs`, `test/unit/tag-release.test.js`
- `package.json` (`scripts` only)
- `.claude/skills/branch-merged/SKILL.md`
- `CLAUDE.md` (the Commands entry for `tag-release.mjs`, and the sentence on `prepublishOnly`)

Out of scope: `ci.yml`, `lib/`, the version rule.

## Assumptions

- Today publishing is `npm publish` on the operator's machine; `prepublishOnly` runs the gates
  and `postpublish` runs `scripts/tag-release.mjs`, which tags and pushes
  (`package.json:42-44`). Measured.
- `tag-release.mjs` already skips when the tag exists (`scripts/tag-release.mjs:43-52`).
  Measured.
- No published version has an attestation, and the package has one maintainer. Measured by the
  security review with `npm view`, 2026-11-09.

## Design (Fable, 2026-11-10)

The order reverses. Today: publish, then tag. After: the operator pushes the tag `v<version>`
on the merged commit, and the workflow publishes. The tag is the release decision and stays the
operator's.

## Steps

1. Write `publish.yml`: triggered by a pushed tag matching `v*`; `permissions` of
   `contents: read` and `id-token: write`; actions pinned by commit as work order 10 did;
   `npm ci`; a step that fails unless the tag equals `v` plus `package.json`'s version;
   `npm run gates`; `npm publish --provenance --access public`.
   verify: the tag-equals-version check is a script with a unit test, not shell in the workflow.
2. Keep `prepublishOnly`. Change `postpublish` so that in CI it does nothing, since the tag
   already exists, and locally it still tags.
   verify: `npx vitest run test/unit/tag-release.test.js`.
3. Update `/branch-merged` and `CLAUDE.md`: the release is now "push the tag", given as a
   copy-paste command on its own line.
   verify: `npx vitest run test/unit/skill-code-blocks.test.js test/unit/skill-coverage.test.js`.
4. verify: `npm run gates`.
5. Do not push a tag. The first real release under the workflow is the operator's to make.

## Stop and ask

- The operator's choice (trusted publishing or a token) has not been given.
- Anything would publish, tag or push a tag from the implementing session.
- The workflow would need a secret printed, echoed or passed on a command line.

## Fast feedback

```sh
npx vitest run test/unit/tag-release.test.js
```
