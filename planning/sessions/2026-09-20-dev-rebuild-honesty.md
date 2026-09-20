---
branch: claude/fresh-build-feedback-9x9asm
base: main
status: open
opened: 2026-09-20
---

# Session — 2026-09-20: Dev Rebuild Honesty, and the Docs a Fresh Build Needed

## Intent (captured at /branch-open)

**Objective:** Stop kiss-ssg claiming a dev rebuild it cannot deliver, and close the documentation
gaps that a real conversion onto 2.4.0 found — so the next fresh build is misled by neither the
engine nor `llms.txt`.

**Provenance.** The findings come from the `Swan-Love/swan-love.github.io` conversion off SCMS
(kiss-ssg 2.4.0, 11 pages, 92 assets, merged and deployed), relayed as a written report by the
session that did it. Every finding this branch acts on was **re-derived locally** against `lib/`
before being accepted — see the measured/corrected split below. This is the "validate on a real
consuming site" recommendation (09-06, 09-10, 09-12) finally paying out.

**Measured here, not merely relayed:**

- A helper module edited under `folders.src` in dev logs `change: … 0` then `Rebuilding site:`,
  the replay runs, live reload fires — and the page still renders the **old** helper output.
  The peer left this inferred; it is now measured. Mechanism: `lib/kiss.js:2450` — the file matches
  no stack entry, so it falls through to a full replay, and ESM will not re-import a cached module.
- **The wider case, found here and not in the report:** editing the entry script itself to add a
  `.page()` logs `Changed: …/router.js:` and `Rebuilding site:`, and the new page is never built.
  `_replay()` replays the cached `_registrations`. `AIKB/watcher.md:25` states the entry watcher
  exists because "the page list itself may have changed" — a documented promise the code cannot keep.
- F6's token counts reproduce exactly: `{{#extend}}` 0/1, `{{#content}}` 0/0, `{{#block}}` 0/0.

**Corrected on re-derivation (the reason the rule exists):**

- **F1 was overstated.** For a normal layout with `src` inside the repo root, `build: '.'` _does_
  throw, via `swallowsSource` (`lib/config.js:377`). The advice the peer gave its site owner was
  right in effect; only the stated reason was wrong. The real defect is narrower: `llms.txt:101`'s
  `('.', '/')` parenthetical mislabels why, and the message hardcodes "contains the source folder"
  even when the root branch fires.
- **F3 has an existing escape hatch** the report missed: `sitemapLastmod` is already documented in
  `README.md:450`, `llms.txt:33` and `AIKB/sitemap.md:9`. The finding survives as a discoverability
  problem, not an absent capability.

**Success criteria:**

- [ ] A helper module edited under `folders.src` in dev no longer presents as a successful rebuild:
      the log says the change cannot take effect without a restart. Checked against the scratch
      fixture that today prints a bare `Rebuilding site:` and serves stale output.
- [ ] An entry-script edit that changes the page list either takes effect or says plainly that it
      cannot. Checked against the fixture where adding `.page({ view: 'second.hbs' })` today
      produces no `second.html` and no warning.
- [ ] `AIKB/watcher.md` no longer claims a capability the code does not have, and every touched
      `lib/` module's AIKB doc is updated in the same commit.
- [ ] `llms.txt` § Helpers shows a layout using `{{#block}}` and a page using
      `{{#extend}}`/`{{#content}}`, and says they come from handlebars-layouts rather than from kiss.
      Fixed-string count for each rises from 0 to at least 1.
- [ ] `llms.txt`'s `cleanBuild` paragraph states the is-or-contains-source rule and drops the
      `('.', '/')` filesystem-root claim.
- [ ] `sitemapLastmod` is reachable from `llms.txt` § `.sitemap()` as the answer to "why is my build
      not reproducible".
- [ ] One sentence states where helper modules live (`src/helpers/`) and what a dev edit to one does.
- [ ] A regression test exists for the dev-honesty behaviour and **has been seen to fail** against
      the unfixed code.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- **Making the edit actually live.** No process restart, no cache-busting re-import. This branch
  makes the failure honest; it does not make helper or entry-script edits take effect.
- F2 (a sibling `.css` silently overwriting compiled `.scss` — verified: `lib/assets.js:96` compiles,
  `:98` copies over the top). Real and valuable, deferred because it touches the asset manifest, where the
  `examples.test.js` self-heal problem noted on 2026-09-16 lives.

  **Correction, 2026-09-20 (this session was wrong).** I told the swan-love session that
  `report().assets` showing a single entry meant the manifest does not record sass output, so the fix
  would need a manifest redesign. It does record it. `recordEmitted` (`lib/assets.js:60`) globs the
  **source** dir and rewrites `.scss`/`.sass` to `.css` for the key, so sass output is keyed by its
  compiled name — measured here: a `.scss`-only source yields
  `{source: 'css/only.css', target: 'css/only.css'}` with no `.scss` in the build. A collision is
  therefore **two writes to one key**, the second overwriting the first, and detecting it is local to
  that loop. The originally suggested `logger.warn` is viable and the job is smaller than this non-goal
  first claimed. The peer caught this; I had inferred absence from a single entry without reading the
  loop that produced it.

- F5(b), the `/docs` dangling-reference bug — reported, not yet re-derived here.
- F4, a built-in `{{url}}` helper for external URLs — a public API addition, a different impact
  surface and a different bump.
- F8's `kiss-site-migrate` changes and the "plugins are not in the npm tarball" note — skill/plugin
  surface, separate branch.
- The bench baseline contradiction — `/memory-consolidate`'s job, flagged at this open, not this
  branch's diff.

**Impact surface:** engine internals + tooling & docs — a dev-mode notice changes observable
behaviour but adds no API: no new config key, no new method, no changed report shape. Patch bump;
obliges the touched `AIKB/` docs plus `llms.txt` and `README.md` for the documentation fixes.

**Expected shape:** planned — every finding is already measured with a reproducer, and the fix for
each is named. The one open design question (notice vs. restart) is settled by the non-goal above.

**Delegation convention:** none: one session. The evidence is already gathered in this session's
context and the branch is small, so briefing agents would cost more than it saves. If an independent
review becomes warranted before close, it is a fresh-context agent re-deriving the findings — and if
that review does not run, the close says the branch has no independent review rather than letting
this session's self-check stand in for one (2026-09-16).

### Amendments

**2026-09-20 — F5(b) absorbed (operator-authorised).** Listed as a non-goal at open
("reported, not yet re-derived here"). The swan-love session then sent a standalone
reproducer, and it has now been re-derived and **widened** here: it is not only the build
folder. Every folder the site is configured with is reported `dangling` when a note writes
it with a leading slash, while the same folder written `./x`, `x` or `x/` resolves —
measured on one record as four findings (`/docs`, `/src`, `/src/assets`, `/src/pages`) and
zero real problems. Mechanism: `lib/aikb.js:491` normalises known values through
`posixPath`, `:519` does an exact `known.has`, and `:527`'s fallback looks for a candidate
ending `/${value}` — i.e. `//docs`. In scope now: normalise the token before the lookup so
all four cases resolve, plus a regression test seen red first. The AIKB lint is what makes
`check` trustworthy, so false findings cost it credibility directly.

**2026-09-20 — the discarded pile absorbed (operator-authorised).** After the branch was validated
against the real site, the swan-love session was asked what it had _not_ reported — the findings it had
filtered out as its own fault, too small, or too embarrassing. Ten items came back. Its own meta-reading
is the valuable part and is now this branch's second theme: **eight of the ten were cases where the
documentation was correct and the author still got it wrong. The failure mode is not a missing rule, it
is a rule whose consequence is not stated beside it.** Five fixes taken, each verified here first rather
than taken on report:

- `cleanBuild: 'atomic'` degrading in dev is documented; that a dev run therefore writes a dev build
  into the published folder is not. Cost the reporter hours, found by grepping output for "livereload".
  Confirmed: `lib/kiss-page.js:206` injects the livereload `<script>` into dev output.
- `{{#isActive page …}}` reads as though `page` were a keyword. It is the page context passed
  positionally, and a data-driven nav needs `../page` inside the `{{#each}}`. `lib/handlebars-helpers.js`
  documents this in a source comment that notes two independent agents hit it — it had never reached
  `llms.txt`. (The reporter said `..`; the correct form is `../page`.)
- A non-dev build minifies, so output never diffs clean against a non-minifying generator. The rule was
  documented; the consequence for anyone migrating a site was not.
- `check` and `aikb` had no suggested `package.json` script names, so `npm run aikb` was the reporter's
  own invention and it did not run the command until prompted.
- A space in an asset filename works end to end. Measured here: manifest, `{{asset}}` and the link scan
  all handle `hand-in-hand-for syria.png` (`checked: 1, broken: []`). The reporter lost real time to
  planning a rename that was never needed — a non-defect worth one clause precisely because everyone
  assumes the opposite.

Not taken: the `{{url}}` external-URL helper (F4, a public API addition), `.scan()` vs `.page()` guidance
for a migration (a skill surface, and skills do not ship in the tarball), and the doubt over whether
`AIKB/` should be gitignored (`llms.txt` already says plainly that it is committed source).

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
