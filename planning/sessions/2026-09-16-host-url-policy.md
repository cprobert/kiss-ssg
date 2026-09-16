---
branch: claude/learna-kiss-session-communication-d1uv1d
base: main
status: open
opened: 2026-09-16
---

# Session — 2026-09-16: Host URL Policy — trailing slash and redirect format

## Intent (captured at /branch-open)

**Objective:** Stop the engine deciding two things that belong to the site's host — the trailing
slash on a directory index, and the encoding of its redirects — by making each a config key whose
default reproduces today's behaviour exactly.

**Origin:** a three-message cross-session exchange with the `learna-kiss` session (relayed
2026-09-16 15:50, 15:54, 15:58), each claim re-derived locally before being accepted. Two host rows
are **measured**, not remembered:

| Host                                                                                        | Directory index | File page           |
| ------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| Netlify (`www.a1k9training.co.uk`, verified)                                                | `/courses/` 200 | `/x` 200, `/x/` 301 |
| Firebase `cleanUrls`+`trailingSlash:false` (verified by the peer session on `learna.ac.uk`) | `/courses` 200  | `/x` 200, `/x/` 301 |

They agree on file pages and contradict each other on directory indexes, which is the whole
justification for the key. All 18 `<loc>` entries in a1k9training's live sitemap return 200 under
today's default — measured here, by fetching each one — so **the default must not move**.

Cloudflare Pages, GitHub Pages and bare nginx are **unverified** and no claim is made about them.

**Success criteria:**

- [ ] `links.trailingSlash` defaults to `true` and an unset config produces byte-identical output to
      2.3.0 — the existing integration suite passes unchanged, with no test edited to accommodate it
- [ ] With `trailingSlash: false`, a directory-index page emits **one** URL everywhere:
      `{{canonical}}`, its `<loc>`, its `llms.txt` entry, its feed link, its `_redirects` target and
      its `{{link}}` href are all `/courses` — verified by a test that fails against the unfixed code
- [ ] `toURLKey` is untouched and `isActive` behaves identically under both settings, asserted by a test
- [ ] `report().redirects.rules` carries the resolved `[{ from, to }]` list
- [ ] `<build>/redirects.json` is written as the host-neutral IR whenever there are aliases
- [ ] `redirects.format` accepts `'netlify'` (default, today's `_redirects`), `'firebase'`, `'vercel'`,
      `'none'`, and a custom writer function; `firebase`/`vercel` emit a **fragment to merge**, never
      touching a config file the site owns
- [ ] A custom writer that throws fails the build through `_failures` rather than failing silently
- [ ] `AIKB/` docs, `llms.txt`, `README.md` and regenerated `types/` land with the code; a
      `test/unit/skill-coverage.test.js` row exists for each new public feature
- [ ] `npm run gates` green

**Non-goals / out of scope:**

- Changing any default. Both keys default to current behaviour; a1k9training must stay byte-identical.
- Merging into a site's real `firebase.json` / `vercel.json`. kiss emits a fragment; the site owns the merge.
- Asserting anything about Cloudflare Pages, GitHub Pages or nginx. The docs matrix carries the two
  measured rows and says the rest are unverified.
- Fixing learna-kiss. It is not blocked — it keeps its own canonical helper and its 227 hand-maintained
  redirects in `firebase.json`.
- Publishing. The bump lands at close; `npm publish` is a separate operator decision.

**Impact surface:** public API — two new config keys, a new report field, new emitted files, and a new
extension point. Minor bump (2.4.0), and it obliges `llms.txt` + `README.md` + `npm run types`.

**Expected shape:** planned — the design was settled by the cross-session exchange and two operator
decisions before any code. The route is mapped; the risk is in the seams (`servedPathFor` vs
`toAbsoluteUrl`, and the custom writer's error semantics), not in the destination.

**Delegation convention:** none — one session. If any work is delegated, agents implement inside a
named scope and **never commit**; the operator's diff review is the checkpoint. A regression test is
written red-first against the unfixed code before the fix (per `AIKB/testing.md`).

**Contract:** none — a single workstream.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-09-16 — scope amended by the operator: `.robots()` and an `.htaccess` redirect fragment.**
Adjacent work, absorbed on this branch rather than split off, per `CLAUDE.md`'s one-open-branch rule.
Both are the same theme as the original objective — the site's host and its crawlers decide things the
engine was either deciding or not saying — and both are additive public API, so the captured minor
bump (2.4.0) still holds.

The evidence that settled `.robots()`: `examples/_shared/assets/robots.txt` is `User-agent: * / Allow: /`
and carries **no `Sitemap:` line**, while those same examples call `.sitemap()`. kiss ships examples
that generate a sitemap and never advertise it. That is the `.llms()`/`.feed()` gap exactly — the build
knows a URL the hand-written file cannot keep in sync — and the `Sitemap:` line goes through the same
`toAbsoluteUrl` join as `<loc>`, so it inherits this branch's `trailingSlash` policy for free.

Two design constraints recorded now so they are not re-litigated later:

- **`ignoreSitemap` must NOT imply `Disallow`.** Blocking a crawler stops it fetching the page, which
  stops it seeing a `noindex` tag, so the URL can stay indexed with no snippet. Excluded-from-sitemap
  and blocked-from-crawling are different intents and stay separate keys.
- **`Disallow: /` is the sharpest edge in the package** — one staging config promoted to production
  removes a site from search, silently, with nothing in the build looking wrong. It gets a `notice` on
  every build and a `report().robots` field, the treatment the redirect findings get.

Added success criteria:

- [x] `.robots(options)` writes `<build>/robots.txt` only when called; a `robots.txt` copied from
      `src/assets/` is untouched under `overwrite: false`
- [x] Its `Sitemap:` line is the same join `<loc>` uses, and follows `links.trailingSlash`
- [x] A write failure is logged, not fatal (discovery, like the sitemap — not the redirect case)
- [x] `Disallow: /` logs a notice every build and is visible in `report().robots`
- [x] `redirects.format: 'htaccess'` writes `redirects.htaccess` as a **fragment**, never the live
      `.htaccess` — the same ownership rule as the firebase and vercel fragments

**2026-09-16 — scope amended by the operator: Finding 2 closed, renderers exported through
`lib/kiss.js`.** The operator also waived the API-compatibility concern for the redirect surface —
they are the only consumer and will patch their clients — so that is no longer an open risk on this
branch.

`renderRedirects`, `renderRedirectsJson`, `renderFirebaseRedirects`, `renderVercelRedirects` and
`renderHtaccessRedirects` are now named exports of the entry module. This was not a convenience:
the `exports` map has one entry by design, so `kiss-ssg/lib/redirects.js` raises
`ERR_PACKAGE_PATH_NOT_EXPORTED` and a site could not reach them at all. A `config.redirects.format`
writer therefore had to reimplement an encoding kiss already shipped — an extension point with
nothing to extend, and a straight violation of this package's own rule, stated in `llms.txt`: one
entry in the map, everything public reachable from `'kiss-ssg'` itself.

Exported **flat** rather than under a `redirects` namespace (the shape `utils` uses), because a site
reads `config.redirects` in the same file and `redirects.renderRedirects(...)` inside
`redirects: { format: ... }` is a sentence nobody should have to parse. One vocabulary: the names
are exactly the ones `AIKB/redirects.md` already documented, not a second set of aliases.

Added success criteria:

- [x] every built-in encoder is reachable as a named export of `'kiss-ssg'`
- [x] the declarations carry them, proved by a typed consumer rather than by the source
- [x] a custom writer can compose a shipped encoding instead of reimplementing it
- [x] the one-entry `exports` map is unchanged — deep imports still fail

**2026-09-16 — scope amended again by the operator: `redirects.format` becomes a list, and the
IR becomes the default. THIS MAKES THE BRANCH A MAJOR.**

Finding 2's third option, taken now rather than deferred. `format` accepts a list so one build can
emit several host encodings (`['netlify', 'firebase']` — Netlify previews and Firebase production
is a real shape), and it is **unset by default**: `redirects.json` is the baseline and a host
encoding is opt-in, because kiss cannot know where a site deploys.

**The semver consequence, stated at the point of decision.** `_redirects` on the default path is
v2.3.0 shipped behaviour. A 2.3 site with `aliases` that upgrades and changes nothing would stop
emitting it and its old URLs would start 404ing on Netlify. That is a breaking change: the bump is
**3.0.0**, not 2.4.0, and the captured Impact surface moves from "public API additions are minor"
to a major. The operator decides the number at `/branch-close`; this records why it cannot be minor.

Mitigation, so the break is loud rather than silent — which is the whole subject of this branch:
`format` defaults to `null` meaning _never chose_, distinct from `'none'`/`[]` meaning _chose the
IR alone_. A build with aliases under `null` logs one notice naming the fix. An upgrader is told;
a deliberate IR-only site is not nagged. The distinction lives in the config value rather than a
hidden flag so a site can express it.

Two readings of "uses the format instead" were possible and I took the first, stated here so it is
reviewable rather than assumed: **the IR is always written** and a named format adds host files
beside it. `report().redirects.json`, `rules` and the whole portable-fact argument rest on the IR
being unconditional; making it disappear whenever a format is named would undo the branch.

Report shape moves again: `redirects.format` (string) becomes `redirects.formats` (string list),
and `file` is now documented as the **first** host file with `files` authoritative. Both example
records re-recorded deliberately, per pulse 2.

Added success criteria:

- [x] `format` accepts a list; `['netlify','firebase']` emits both host files from one build
- [x] `format` unset writes the IR alone and logs one notice when the build has aliases
- [x] `'none'` and `[]` write the IR alone and are silent
- [x] every entry of a list is validated, so one typo in four is named not dropped
- [x] duplicates collapse and order is kept

**2026-09-16 — criterion 1 was written wrong, and is amended rather than reinterpreted.**
It said an unset config produces byte-identical output "with no test edited to accommodate it".
Two parts of that could never have held, and both are consequences of decisions the operator had
already made before the criterion was written — so this is my drafting error, not scope drift:

1. The operator chose "also write `redirects.json` to `build/`", so a build **with aliases** emits
   one new file. Every pre-existing file is byte-identical; the build folder is not.
2. `report().redirects` gains four keys, so every `toEqual` on that object had to be extended —
   four in `test/integration/redirects.test.js`, five `links` assertions in
   `test/unit/config.test.js`, and one in `test/unit/redirects.test.js` whose _behaviour_ also
   changed (`overwrite: false` now protects each target file independently, so an existing
   `_redirects` survives while the IR beside it is still written; `status` reports the build, so
   it reads `written` rather than `skipped`).

The criterion as it should have read, and as the work is held to: **no existing emitted file
changes a byte under an unset config, and no test assertion is weakened** — every edit above
either adds a key to an exact-match assertion or asserts a deliberately changed behaviour.
No test was loosened to pass.

### Inherited feedback carried into this branch

- **Bench baseline contradiction** (09-10, 09-12 — twice asked, still open): not blocking here.
- **The operator eyeball** is retired but recurred in 09-12 and 09-15; 09-15 diagnosed the destination
  as wrong and recommended moving it to `/branch-pulse`. It will be offered at the pulse, not the close.
- **09-15's relay rule** — state which claims are measured and which are inferred — is honoured above
  and in every message sent to the peer session.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

**2026-09-16 — pulse 1. Decision: continue (code and docs complete; close not yet run).**

Evidence, all re-run at this checkpoint rather than recalled:

- `npm run gates` — all five green (test 1288, lint, typecheck, format, pack 208 files).
- **Red-first, as the rule requires.** `git stash push lib/` then
  `npx vitest run test/integration/trailing-slash.test.js` → 2 failed / 2 passed against the
  unfixed engine; restored, 5/5 pass. The two behaviour tests were seen red.
- **Operator eyeball — done here, at the pulse, per 09-15's recommendation, and on a real build
  rather than a test fixture.** Built a Firebase-shaped site
  (`trailingSlash: false`, `format: 'firebase'`) and read the output myself:
  `<link rel="canonical" href="https://learna.ac.uk/courses">`, `{{link}}` rendering `/courses`
  on the same page (the two agreeing is the whole point), `<loc>https://learna.ac.uk/courses</loc>`
  with no slashed form anywhere, a correct `redirects.firebase.json`, **no `_redirects` written**,
  and the link checker resolving all 4 references. Also rebuilt `examples/11-blog` under the
  defaults: `_redirects` byte-identical to before, `redirects.json` beside it agreeing with it.
- Criteria: all nine met, subject to the amendment above. Version bump and CHANGELOG are
  `/branch-close`'s step and have deliberately **not** been done — the branch stays at 2.3.0.

Carried, not blocking: one test failed on a full-suite run at 16:25 and passed on every run since;
I could not capture which before the output rotated, so it is recorded as an unidentified flake to
watch for at close rather than as a known-good.

**2026-09-16 — pulse 5. Finding 2 closed. Verified against a real npm install, not the working tree.**

- `npm run gates` — five green, 1345 tests.
- **The eyeball was the install, because that is the only thing that can prove an `exports`-map
  change.** `npm pack`, then `npm install` the tarball into an empty project outside the repo, then
  a site that imports `renderRedirects` and `renderFirebaseRedirects` from `'kiss-ssg'` by name and
  composes them in a custom writer. Output read by eye:

      public/edge/_redirects          /old-about /about 301
                                      /vendor/* https://cdn.example/:splat 200
      public/hosting/redirects.json   { source, destination, type: 301 }
      public/redirects.json           the IR, still the baseline under a custom writer

  The Netlify bytes are the built-in encoder's, with the site's own rule appended — the composition
  that was impossible before. And `import('kiss-ssg/lib/redirects.js')` from that same project still
  returns `ERR_PACKAGE_PATH_NOT_EXPORTED`, so the one-entry map is intact and the named exports are
  the only door.

- Typed proof rather than a claim: `test/fixtures/consumer/site.js` now uses `renderRedirects` in a
  `redirects.format` writer and is type-checked against the **published** declarations under
  `tsc --noEmit`. `test/unit/types.test.js` asserts all five names survive into `types/kiss.d.ts` —
  that test was red first, because the old assertion pinned the exact pre-change export line.

Decision: continue. All three self-review findings are now closed. Not closed as a branch: no
version bump, no CHANGELOG, no PR.

**2026-09-16 — pulse 4. The format list landed; the branch is now a major.**

Evidence re-run at this checkpoint:

- `npm run gates` — five green, 1338 tests.
- **Red-first**: `git stash push lib/`, then the two new integration cases failed against the
  pre-change engine ("writes only the IR by default, and says so once"; "emits both host files for
  a site that deploys to two hosts"); restored, both pass.
- **Operator eyeball, on real builds rather than fixtures.** Two hosts:
  `format: ['netlify','firebase']` emitted `redirects.json`, `_redirects` (two sorted 301 lines)
  and `redirects.firebase.json` (the same two as `{source, destination, type: 301}`) — read by eye,
  all three agreeing. Then the same site with the key removed: `redirects.json` only, no
  `_redirects`, and the notice printed — `aliases written to redirects.json only — set
config.redirects.format …`. That is the upgrade path working as designed.
- The blast radius was itself the evidence: **20 existing tests failed** on the default change,
  every one of them a place that had assumed `_redirects` happens by itself. Each now declares
  `redirects: { format: 'netlify' }`, which is exactly what a real 2.3 site must do. Example 11,
  the redirect exemplar, declares it too — the docs saying out loud what the code now requires.

Decision: continue. Not closed; no version bump, no CHANGELOG, no PR.

**2026-09-16 — pulse 3. Two self-review findings closed; a third referred to the operator.**

I reviewed my own redirect infrastructure for modularity at the operator's request and found three
things. Two are fixed here, one is a design decision that is not mine to make.

**Finding 1 (fixed) — the format list had two sources of truth, and one drift direction was
silent.** `REDIRECT_FORMATS` (validation, `config.js`) and `HOST_FORMATS` (dispatch,
`redirects.js`) were maintained independently. A name added to the validator alone would validate
cleanly, match nothing in the dispatch, write only the IR and report success — the silent no-op the
whole format block exists to abolish, reintroduced in the maintainer's path. Fixed structurally:
`HOST_FORMATS` is now exported and `REDIRECT_FORMATS` is derived from its keys plus `'none'`, so
the two cannot disagree. Guarded behaviourally too, because a derivation can be undone: a test
iterates the _validated_ list and asserts each name writes a non-empty host file.

Seen red first, as the rule requires — `'fastly'` was added to the validator alone and the guard
failed with `format 'fastly' validates but writes no host file — add its row to HOST_FORMATS`
before the derivation was applied.

Note the new import direction: `config.js` now imports `redirects.js`. No cycle (`redirects.js`
reaches only `utils.js`), but it is the first time the config resolver depends on a feature module,
and it is deliberate — the module that implements the formats is the one that should say which
exist.

**Finding 3 (fixed) — the IR's `status` field was a stub dressed as a design.** The comment said
`status` is per-rule "because a later `410` or a forced rule belongs on the rule", which reads as
though mixed statuses work. They do not: `aliases` is a bare array of path strings and all four
encoders hardcode their permanent form. The field is now documented as always `301` — a place, not
a capability — in the code, `AIKB/redirects.md`, `llms.txt` and `README.md`, with the absence of
forced and wildcard rules stated alongside it. No behaviour changed; the claim did.

**Finding 2 (NOT fixed — operator's call).** The extension point cannot reuse anything.
`package.json`'s `exports` map is closed (`"."` → `lib/kiss.js`, which exports only `Kiss` and
`utils`), so a consuming site cannot import `renderFirebaseRedirects` or `renderRedirectsJson`: a
custom writer must reimplement an encoding from scratch. And `format` is singular, so a site
deploying to two hosts cannot emit two host files without hand-rolling both. Options and trade-offs
were put to the operator; the decision touches the published API surface and is not Claude's to
take.

**2026-09-16 — pulse 2. That "flake" was not a flake, and the diagnosis in pulse 1 was wrong.**

`test/integration/examples.test.js` records examples 9 and 11 **in place**, in the committed
`examples/*/AIKB/` folders, and asserts the files are byte-identical before and after. So any change
to the report's shape makes the first run rewrite two committed files and fail — and leaves the
files on disk matching, so **every subsequent run passes**. Self-healing and order-dependent, which
is exactly what an intermittent failure looks like from the outside.

Both sightings were this, not one flake: the 16:25 failure was the `redirects` keys, the 16:58 one
was `robots`. `last-build.json` is the whole report, so `"robots": null` is a real diff in both
example records. Nine consecutive clean full-suite runs after the fact are not evidence of health —
they are evidence the first run already healed it.

Worse, I committed the first instance without noticing: `git add -A` in commit 13ff5ef swept up the
re-recorded `examples/*/AIKB/last-build.json` as though it were part of the change. It _was_ correct
to commit them — the record shape genuinely moved — but I did not know I was doing it, and "the
suite is green" was doing no work as evidence at that moment.

Two things follow, and the second is for the operator:

1. Re-recording the examples is a **required step** of any report-shape change, not an accident. Both
   files are committed deliberately this time.
2. **The test's failure mode is a trap and is worth fixing on its own branch.** A report-shape change
   fails CI once, rewrites two tracked files, and goes green on a re-run — which is precisely the
   "re-run until it passes" behaviour the repo's own rules forbid, handed to you by the test. The
   assertion should either record into a temp copy of the example folder, or its failure message
   should say "the report shape changed — run `npx kiss-ssg aikb` in examples/9 and 11 and commit".
   Not fixed here: it is test infrastructure, not this branch's subject, and this branch has already
   absorbed one amendment.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
