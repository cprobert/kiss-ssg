# 10. Pin actions and restrict the CI token

**Model:** Sonnet. **Impact surface:** tooling.

## Objective

Make CI run the exact action code that was reviewed, with no more access than it needs.

## Paths in scope

- `.github/workflows/ci.yml`
- `.github/workflows/static.yml`

Out of scope: `.github/dependabot.yml`, every other file.

## Assumptions

- Both workflows name actions by major tag: `actions/checkout@v7`, `actions/setup-node@v7`,
  `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`.
  Measured.
- `ci.yml` has no `permissions:` block; `static.yml` has one. Measured.
- Dependabot is configured for `github-actions`, weekly (`.github/dependabot.yml`). Measured.
  Dependabot updates a pinned commit and its version comment together. Inferred from memory of
  its documentation.

## Steps

1. For each action, find the commit its current major tag points at.

   ```sh
   git ls-remote https://github.com/actions/checkout 'refs/tags/v7*'
   ```

   Use the commit of the newest full release under that major, and note its full version.
   verify: the session log lists each action, its version and its 40-character commit.

2. Replace each `uses:` with the commit, followed by the version as a comment:
   `uses: actions/checkout@<40 characters> # v7.x.y`.
   verify: `grep -n "uses:" .github/workflows/*.yml` shows no `@v` tag.
3. Add to `ci.yml`, at the top level:

   ```yaml
   permissions:
     contents: read
   ```

   verify: the file still parses. Push the branch and see both CI legs pass.

4. verify: `npm run gates`.

## Stop and ask

- `git ls-remote` is blocked by the network policy. Do not guess a commit.
- A CI leg fails after the change.
- An annotated tag gives two lines (one ending `^{}`): the commit is the `^{}` line. If unsure
  which to use, stop and ask.

## Fast feedback

```sh
grep -n "uses:\|permissions" .github/workflows/ci.yml .github/workflows/static.yml
```
