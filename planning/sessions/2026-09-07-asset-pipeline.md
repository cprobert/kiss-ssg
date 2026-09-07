---
branch: claude/a1k9-bootstrap-tailwind-m1uwni
base: main
status: open
opened: 2026-09-07
---

# Session — 2026-09-07: Asset Pipeline Hook

## Intent (captured at /branch-open)

**Objective:** Give kiss-ssg a generic, documented asset pipeline hook —
`config.assets.pipeline` — so a consuming site can run an external tool
(Tailwind first, anything with a command line next) before the asset copy, in
production builds and under `watch`, without kiss knowing what the tool is.

**Success criteria:**

- [ ] `config.assets.pipeline` accepts an ordered list of steps
      `{ name?, run, watch?, cwd? }`. Every `run` executes, in order, before the
      construction-time asset copy, and again before the copy on every whole-site
      `watch` rebuild. A non-zero exit fails the build: `complete()` rejects and the
      failure is named `<pipeline: name>` in `err.failures` and `report().failures`.
- [ ] In `dev: true`, a step's `watch` command (when given) is spawned once, after
      its `run` succeeds, kept alive for the session, and killed by `close()`. Its
      output goes through the logger. A watch process that dies on its own is
      logged, not a build failure.
- [ ] Each command inherits `process.env` plus `KISS_BUILD`, `KISS_ASSETS` and
      `KISS_DEV`, and runs in `cwd` (default `process.cwd()`).
- [ ] `report()` gains an additive `pipeline: [{ name, ok, duration }]` field.
- [ ] `kiss-ssg check` runs the pipeline like a build does.
- [ ] `lib/pipeline.js` has a `test/unit/pipeline.test.js` sibling; the wiring in
      `lib/kiss.js` is covered by an integration test (report field, failure path,
      dev-mode watch spawn and close).
- [ ] `examples/10-asset-pipeline.js` demonstrates the hook with a dependency-free
      `node -e` step, wired as `npm run eg10`.
- [ ] `AIKB/pipeline.md` exists and is in CLAUDE.md's table; `llms.txt`, `README.md`
      and `types/` describe the new config key; `npm run gates` is green.
- [ ] Proven on a real site: `Gaynor-Probert/a1k9training` builds its Tailwind
      stylesheet through the hook, and a template edit under `watch` reaches the
      browser (Playwright-verified from the a1k9 repo).

**Non-goals / out of scope:**

- An image pipeline, a PostCSS binding, or any tool-specific integration.
- Re-running `run` on scoped (single page / partial) re-renders; tools that must
  see template edits use `watch`.
- Changing how `copyAssets`, the manifest or `assets.hash` work.
- The version bump and CHANGELOG entry (`/branch-close`, operator-run).

**Impact surface:** public API — a new `config.assets` key and a new report
field, observable by every consuming site. Obliges `llms.txt`, `README.md`,
`types/`, and a minor (prerelease) bump at close.

**Expected shape:** planned — the shape was designed against a1k9's needs before
the branch opened; the route (new `lib/pipeline.js`, wiring at the three points
in `lib/kiss.js` where the asset copy is queued, replayed and closed) is mapped.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-09-07 — directory index URLs gain a trailing slash.** Found on `Gaynor-Probert/a1k9training` while proving the pipeline hook: a page built to `courses/index.html` canonicalised to `https://site/courses` — `toURLKey` dropped the trailing `index` segment and `toAbsoluteUrl` then trimmed the trailing slash — and the sitemap `<loc>` matched it. Netlify, GitHub Pages and nginx all serve that directory at `/courses/` and answer the bare `/courses` with a 301, so every canonical and every section-index sitemap entry pointed at a redirect, against Google's guidance that a canonical must be the URL that returns 200. a1k9training was regex-patching its own `sitemap.xml` after each build to work around it. Fixed in the engine instead: `toAbsoluteUrl` now preserves a trailing slash and turns a trailing `index(.ext)?` segment into one, and `canonical`/`lib/sitemap.js` reduce the page URL with a new `utils.toCanonicalPath` (extension only) rather than `toURLKey`. `toURLKey` and `isActive` are untouched — page identity is unchanged. **This is a behaviour change on every consuming site**: emitted canonical and `<loc>` URLs for index pages now end in `/` (and under `extensionLess: true` that is every page but the home page), so it must be called out in the CHANGELOG entry at close. Absorbed on this branch rather than split off, because the operator's brief for this branch is to make kiss meet client-site needs, and this is one of them.

## Pulse log

- **2026-09-07 — proven on a1k9training.** Tailwind v4 runs through `config.assets.pipeline` for `npm run build`, `kiss-ssg check` (reports the step) and `npm run dev`. Playwright gate `qa/dev-watch.mjs` in that repo: 9/9 — server up, hashed stylesheet served, watch spawned, an edited partial produced a new utility in the compiled CSS, the re-copied asset got a new hash, livereload showed the edit, the style applied, no process left after `close()`. One lesson folded back into the docs: Tailwind's watch needs `--watch=always` because the child has no stdin. Decision: continue; remaining criteria are the operator's close.

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
