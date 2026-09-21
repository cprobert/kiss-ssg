# To verify on a laptop

Things `npm run gates` cannot judge and Claude should not self-certify. Raised at
`/branch-close` Step 5a (operator eyeball) for branch
`claude/learna-kiss-session-communication-d1uv1d` (v2.4.0); deferred because the
operator was on mobile.

Delete an item once you have looked. Delete the file once it is empty.

**Status, 2026-09-21** — verified on the operator's Windows laptop at `eb67929` (the
2.5.0 tip). Items 1, 2, 4 and 5 all behaved exactly as written and are deleted per
the rule above; the evidence is in the "Verified" section at the bottom so the
deletion is not a claim. What is left is the one item that needs a repo this
machine does not have, one judgement call only the operator can make, and the three
open decisions with their current state.

---

## 3. learna-kiss on Firebase — the site that started this

The whole branch came from that site's session. Nothing here has been run against
the real repo, and the repo is not on this machine (`C:\Code` holds no learna-kiss
checkout; the only kiss consumer on disk is `cprobert.github.io`, pinned to
`kiss-ssg ^0.9.1`).

- [ ] set `links: { trailingSlash: false }` and `redirects: { format: 'firebase' }`
- [ ] build and confirm `<loc>` entries have **no** trailing slash — the ~19
      `slug: "index"` pages were the original finding
- [ ] confirm `{{canonical}}` and `{{link}}` agree on the same page (the split this
      branch exists to prevent)
- [ ] then the site's hand-rolled `canonical` helper can be deleted — check that
      removing it changes no output

## Judgement call: is a `notice` loud enough?

Measured on example 11 with `redirects.format` removed:

- `verbose: true` — the cyan notice is line 60 of a 61-line log, directly after the
  green `./public/redirects.json` line.
- `verbose: false` — line 17 of 18, same position; only the grey `Links:` summary
  follows it.

So it survives a scroll only because the build ends right after it. In a CI log
nobody reads to the end it is one cyan line among green ones. If that is not loud
enough for a change that silently breaks live redirects, it is a one-line change:
`lib/kiss.js` `_writeRedirects()`, `notice` → `warn`. Your call; not made here.

---

## Open decisions, not verification

- **2.4.0 is a minor carrying a behavioural break.** Your call, recorded. 2.5.0
  then did the same thing three times over, and its CHANGELOG entry now opens with
  a "⚠️ Breaking changes, in a minor release" section saying so. That is the
  pattern now, stated in `CLAUDE.md`'s design philosophy; nothing left to decide.
- **`AIKB/testing.md`** documents that `examples.test.js` self-heals on a
  report-shape change (`AIKB/testing.md:50`). Still true at `eb67929`:
  `test/integration/examples.test.js:255-268` asserts the committed
  `examples/*/AIKB/` files are byte-identical before and after a re-record, so a
  report-shape change rewrites two tracked files and goes green on the second run.
  Today's full run left `git status` clean — which means nothing healed, not that
  the trap is gone. Still worth its own branch.
- **`config.js` imports `redirects.js`** — unchanged (`lib/config.js:2`,
  `HOST_FORMATS`). No cycle. Still the only feature module the config resolver
  depends on; still a direction you may want to reverse.

---

## Found while verifying, 2026-09-21

Not on the original list. Each measured here, none fixed here.

1. **Every example README tells the reader to run a file that no longer exists.**
   All 11 of 11 `examples/*/README.md` say `node <n>-<name>.js  # from examples/`,
   and `examples/11-blog/router.js:36` says `npx kiss-ssg check 11-blog.js`.
   Those entry files were removed by the router convention (#17, 2.3.0); the
   real command is `cd examples/<n>-<name> && node router.js`, which is what
   `npm run eg<n>` and `CLAUDE.md` say. `AIKB/check.md:48` cites the old shape
   too. **Impact:** docs only, but `examples/` and `AIKB/` ship in the tarball and
   are read by agents in consuming projects — following the README fails with
   ENOENT on the first command. No test covers a README's commands.
2. **Example 10's README names the tool's fallback path, not the path kiss uses.**
   `examples/10-asset-pipeline/README.md:5` says `tools/tokens.js` compiles into
   `assets/css/generated.css`. Under kiss it writes to `src/assets/css/generated.css`
   because kiss sets `KISS_ASSETS` (`lib/kiss.js:904`); `<site>/assets/` is the
   tool's no-environment fallback (`tools/tokens.js:22-24`), which nothing copies.
   The untracked `examples/10-asset-pipeline/assets/css/generated.css` on this
   machine (written 2026-09-18 10:25) is that fallback having been exercised by a
   bare `node tools/tokens.js`. **Impact:** cosmetic — one wrong path in a README
   and one stray untracked file. Not an engine defect. Fix is the README line,
   deleting the stray file, and either pointing the fallback at `src/assets` or
   removing it.
3. **2.5.0 is merged but not released.** `package.json` and both plugin manifests
   read 2.5.0; npm's latest is 2.4.0 (modified 2026-09-18); there is no `v2.5.0`
   tag; the installed marketplace plugins are 2.4.0, and the cached 2.4.0
   `kiss-page-add` and `kiss-site-new` skills still teach `registerHelpers(kiss)`
   and `src/helpers/`. **Impact:** a consuming agent installs the version whose
   skill text contradicts the engine it is about to get. Not a bug — it is the
   pending `npm publish`, which the `postpublish` hook then tags. Publishing also
   closes the remediation plan's "version string" item.

---

## Verified 2026-09-21 — the deleted items, with evidence

All on example 11 (`examples/11-blog`), Windows 11, Node per `.nvmrc`, commit `eb67929`.

| Item | What was checked                                                  | Result                                                                                                                                                               |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `redirects.format` removed from `router.js`, non-dev build        | `public/redirects.json` written, no `_redirects`; the notice printed verbatim (see the judgement call above for where it sits)                                       |
| 2    | `redirects: { format: ['netlify', 'firebase'] }`                  | `_redirects`, `redirects.firebase.json` and `redirects.json` all written, all carrying the one `cascara-notes.html → the-cascara-experiment/` rule                   |
| 4    | `.sitemap().robots()` as shipped; then `.sitemap()` removed       | `Sitemap: https://asterandoak.example/sitemap.xml` present; absent, and no `sitemap.xml`, when `.sitemap()` is not called                                            |
| 4    | `robots.txt` in `src/assets/` under `{ overwrite: false }`        | Not reproduced by hand; pinned by `test/unit/robots.test.js:215` and `test/integration/robots.test.js:143`, both green in today's run                                |
| 5    | `npm pack` → install the 2.5.0 tarball into a scratch consumer    | `typeof m.renderRedirects` is `function`; `import('kiss-ssg/lib/redirects.js')` rejects `ERR_PACKAGE_PATH_NOT_EXPORTED`; 0 `examples/*/public/` paths in the tarball |
| —    | Full suite on this machine (the Windows leg the branch never had) | 69 files, 1514 passed, 2 skipped, 18.6s; CI run 35569913921 `gates (windows-latest)` also green on the merge                                                         |
