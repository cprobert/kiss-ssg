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

| Host                                            | Directory index         | File page                |
| ----------------------------------------------- | ----------------------- | ------------------------ |
| Netlify (`www.a1k9training.co.uk`, verified)     | `/courses/` 200         | `/x` 200, `/x/` 301      |
| Firebase `cleanUrls`+`trailingSlash:false` (verified by the peer session on `learna.ac.uk`) | `/courses` 200 | `/x` 200, `/x/` 301 |

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

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
