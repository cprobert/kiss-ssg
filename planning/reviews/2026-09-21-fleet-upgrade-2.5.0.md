# Fleet upgrade to the published kiss-ssg 2.5.0 — 2026-09-21

Seven client sites moved from a `file:../../kiss-ssg` link (or, for one, a 2020-era `^0.9.1`)
onto the registry release, one subagent per site in parallel, every report re-verified in the
orchestrating session before being accepted. Written so an emergency patch can be decided from it.

## Verdict

**No emergency patch is needed.** Zero kiss-ssg engine defects across seven sites and ~1,186 pages.
Every site builds with exit 0 on the registry 2.5.0, `kiss-ssg check` reports `ok … 0 failed` on
every one, and the output after the switch was byte-identical to the pre-switch build on every site
except `sitemap.xml`'s `<lastmod>` build stamps (documented, expected). The published `lib/`, `bin/`
and `llms.txt` are byte-identical to the `v2.5.0` tag (measured with `npm pack kiss-ssg@2.5.0`).

Nothing was pushed. Every site has local commits on its branch, listed below, for the operator to
push when the deploy is wanted.

## Per site

| Site               | Branch  | Previous registry pin                  | Commits | Pages | check                            | Adopted                                                                                                                   |
| ------------------ | ------- | -------------------------------------- | ------- | ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| a1k9training       | master  | ^2.2.1                                 | 7       | 20    | ok, 0 failed, 557 links clean    | `redirects.format 'netlify'` (**restores `_redirects`**), folders.helpers, `links.canonical`, `{{asset}}` ×4, aikb script |
| pro-plumbing       | main    | ^2.4.0                                 | 7       | 7     | ok, 0 failed, 131 links clean    | folders.helpers (moved to `./helpers`), `redirects.format`, `cleanBuild 'atomic'`, aikb script, AIKB re-recorded          |
| swan-love          | master  | ^2.4.0                                 | 3       | 11    | ok, 0 failed, 167 links clean    | folders.helpers (hand call removed), AIKB re-recorded                                                                     |
| diploma-msc        | kiss-v2 | ^2.0.0                                 | 3       | 686   | ok, 0 failed                     | folders.helpers, `check` script                                                                                           |
| learna-kiss        | kiss-v2 | ^2.0.0 (never installed from registry) | 3       | 360   | ok, 0 failed                     | folders.helpers, `siteUrl` + `links.trailingSlash: false`                                                                 |
| student-handbooks  | master  | ^2.0.0                                 | 3       | 101+1 | ok, 0 failed; site tests 102/102 | `cleanBuild 'atomic'` (failure path measured), folders.helpers                                                            |
| cprobert.github.io | master  | ^0.9.1                                 | 2       | 1     | ok, 0 failed                     | full migration: `gen.js` → `router.js`, `.sitemap()`, CNAME under assets so the clean survives                            |

Commits, by site (none pushed):

- a1k9training `5aadb1e` `8d04bcd` `873e4d5` `643349f` `f67d05c` `fa68305` `df498e5`. Three pre-existing dirty `AIKB/` files were left untouched and unstaged; `npm run aikb` reproduces the re-record.
- pro-plumbing `809b843` `f9596f9` `67a182a` `bbd708d` `478024f` `b549e96` `db0d22b`.
- swan-love `0a86278` `798ff45` `0742f50`.
- diploma-msc `0ea015e2` `1d600f6e` `81131bab`.
- learna-kiss `fc65de3` `71da3fb` `be15ce5`.
- student-handbooks `195deaa` `09d2d67` `03952cf`.
- cprobert.github.io `667c0a5` `8bc4645`.

What a push does: a1k9training and pro-plumbing deploy through Netlify from a fresh build; swan-love
through GitHub Actions; cprobert.github.io serves the committed `docs/` directly, so its push is the
deploy. diploma-msc and learna-kiss are on `kiss-v2` branches with hand-run deploy scripts.
student-handbooks deploys per cohort by hand.

## Findings for kiss-ssg, ranked

None blocks a build. The first two are worth a 2.5.1; the third is a minor-version feature.

1. **Upgrade hazard: a `file:` link survives a plain `npm install` after the pin changes.** Hit on
   six of six sites. The lockfile's `"link": true` entry still satisfies `^2.5.0` because the linked
   tree IS 2.5.0, so npm keeps the junction and the site goes on building against the working tree
   while `package.json` says otherwise. `npm install kiss-ssg@^2.5.0 --save-dev` re-resolves it. Not
   an engine defect — npm behaviour — but it belongs in `kiss-site-migrate` and the CHANGELOG's
   "Upgrading?" paragraph, because it defeats the very check the paragraph asks for.
2. **The 2.4.0 redirects notice was not loud enough, measured on a real site.** a1k9training had 14
   `aliases` and no `redirects.format`; on 2.5.0 the build wrote `redirects.json` only, and the one
   cyan `notice` line was the only signal that Netlify would 404 fourteen legacy URLs plus `/find-us/`
   on the next deploy. The subagent caught it from the notice, which is the argument for keeping it
   and the argument for making it a `warn`. This is `to-verify.md`'s open judgement call, now with
   evidence: one-line change in `lib/kiss.js` `_writeRedirects()`.
3. **`{{canonical}}` has no per-page override.** `canonicalUrl` (`lib/handlebars-helpers.js:139`)
   reads only `pageURL`. learna-kiss has 104 pages (`/c/*`, `/profession/*`, `new-course-idea`) whose
   canonical must point at `https://www.diploma-msc.com/…` — a cross-domain canonical set by the
   controller — so the site cannot drop its hand-rolled helper (measured: 106 files change). A page
   option (`canonical: '<absolute url>'`, honoured by the helper; the sitemap's `<loc>` is a separate
   decision) would close the gap. Feature, not a bug.
4. **Home-page canonical carries a trailing slash under `trailingSlash: false`.** The built-in emits
   `https://www.learna.ac.uk/`; the site's helper emits no slash. Documented ("the home page is
   `siteUrl` with one trailing slash") and Firebase serves `/` either way. Note only.
5. **The installed plugin cache is 2.4.0.** Every subagent's `kiss-site-migrate` came from
   `~/.claude/plugins/cache/kiss-ssg/kiss-ssg/2.4.0/`, and the marketplace clone is also at 2.4.0 —
   so the 2.5.0 skill text the CHANGELOG points upgraders at ("walks each break by the error text")
   is not what an agent sees until the plugins are updated. Operator action: update the marketplace
   and both plugins. No code change.
6. **Generated `AIKB/README.md` wording.** It says the subject hash is "sha1 of the controller
   file's bytes"; `lib/aikb.js:320-323` hashes LF-normalised bytes, deliberately, for Windows clones
   (measured on pro-plumbing: raw CRLF sha1 ≠ recorded). Behaviour right, sentence imprecise.
7. **Under `check`, a site's own `complete()` callback sees the staging path.** student-handbooks
   prints `Handbooks generated to: ./handbooks/test.kiss-staging-…`. The report maps staging back to
   the real folder; `this.config.folders.build` inside the callback does not. Cosmetic; a site that
   logs the path is the only reader.
8. **Advisory broken-link volume on partially built sites.** diploma-msc reports 2,771 and learna-kiss
   1,484 advisory lines under `check`, nearly all for files that grunt or Tailwind write in a later
   step this run did not perform. Expected and advisory, but it buries the handful of real ones. An
   ignore pattern on `links.check` would help; ergonomic, not a defect.

## Site-level findings, for the operator (not kiss defects)

- **diploma-msc — live sitemap advertises redirects.** The deployed `sitemap.xml` (fetched) has 16
  `<loc>`s ending in `/` that Firebase 301s to the bare form (`curl -I /blog/` → 301). The site's own
  `canonical` already emits the bare form, so canonical and sitemap disagree on those 16 pages. Fix is
  `links: { trailingSlash: false }` (the 2.4.0 feature); not adopted because it changes emitted URLs.
  Recommend adopting.
- **student-handbooks — the live homepage stylesheet 404s.** `src/pages/index.hbs` links
  `2025-september/css/output.css`; the cohort folder is `2025-sept`. `check` reports it every run as
  `broken link: ./public/index.html -> 2025-september/css/output.css`. Which folder it should name is
  the decision.
- **learna-kiss — the documented Tailwind `-i` trap is live in production.** `tailwind-minify` (used by
  `deploy:uat`/`deploy:production`) runs `npx tailwindcss -o … --minify` without `-i`; measured, the
  shipped CSS loses the `@font-face` (0 `icomoon` refs vs 7) and the three `.btn` `@apply` rules.
  Fixing changes shipped CSS, so it was left. Recommend fixing.
- **learna-kiss** — `/blog/meet-our-experts/-meet-the-programme-leader-acute-medicine` is linked from
  two built pages and has no `firebase.json` redirect (only the `neurosurgery` sibling does).
- **cprobert.github.io** — the deployed page has shipped an empty LinkedIn `href=""` since 2020 (the
  source was fixed in 279b53f and `docs/` never rebuilt). The rebuild fixes it; a push deploys it.
  Note the wall-clock `<lastmod>` gives a committed-output site a one-line diff per rebuild —
  `sitemapLastmod` on the page, or dropping `.sitemap()` for a one-page site, settles it.
- **a1k9training** — `.robots()` not adopted: the hand-written `robots.txt` carries 17 named
  AI-crawler blocks and a comment block that the helper cannot emit. Operator's call.
- **swan-love** — `readme.md` says `docs/` is committed and served by GitHub Pages; `.gitignore`,
  `CLAUDE.md` and the Actions workflow say it is built and uploaded. Stale doc. `.llms()` is
  ready to add if the site wants an AI index.
- **Helpers folder convention diverged.** a1k9training kept `src/helpers` by naming it in
  `folders.helpers`; every other site moved to the default `./helpers`. Both valid; the engine's
  comment prefers the folder outside `src` because `src` is watched for content.

## What was not verified

No dev server was run on any site (builds and `check` only), so 2.5.0's helper hot-reload and the
`atomic`-degrades-in-dev notice are documented rather than exercised here. No CMS data was fetched
(diploma-msc, learna-kiss, student-handbooks built from the model data already on disk). No deploy
was performed. The three data-fed sites' post-steps (grunt, Tailwind minify, the hand-rolled llms
generator) were deliberately not run so the output diff isolated kiss.
