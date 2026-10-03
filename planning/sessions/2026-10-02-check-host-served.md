---
branch: check-mode-broken-link-count
base: main
status: closed
opened: 2026-10-02
consolidated: 2026-10-03
---

# Session — 2026-10-02: `check` output that a 686-page site can read, and `links.hostServed`

## Intent (_inferred retrospectively_, captured at adoption)

_This branch was started by the diploma-msc session (kiss-ssg v1 → v2 upgrade, PR
learna-ltd/diploma-msc#477), in this checkout, without `/branch-open`. The main session adopted it
on 2026-10-02, after closing `feat/homepage-codex`, on the operator's instruction to "proceed to
address feedback if there's value in the comments". The intent below is reconstructed from that
session's handover and from the two commits, and it adds handover item 3, which has the same cause._

**Objective:** make `npx kiss-ssg check` usable on a large real site, and release it.
diploma-msc is blocked until `links.hostServed` is on npm.

- **Broken links printed twice.** `check` printed every broken link twice: once in the build log on
  stderr, once in the report on stdout, and a terminal shows both. On diploma-msc's 686 pages that
  was 2,756 findings as 5,512 lines.
- **Host-served paths.** The site had no way to say that a path is served by the host rather than
  written by the build (a Firebase function rewrite, a bundle folder written by another tool), so
  those paths drowned the real broken links.

**Success criteria:**

- [ ] Under `check`, the build log names the broken-link **count** in one line, and the report alone
      lists the links (`d479071`, rebased as `9bba3c9`).
- [ ] Under `check`, **audit findings** are not printed twice either (handover item 3: `lib/kiss.js`'s
      `auditLines` loop, and `--summary` again). Same shape as the link fix, with a test seen red.
- [ ] `config.links.hostServed`: root-relative patterns (`*` within a segment, `**` across segments,
      otherwise literal). A reference the build can't resolve that matches one is counted in
      `report.links.hostServed` instead of being listed as broken. The default is `[]`, and a pattern
      without a leading `/` throws (`4290829`, rebased as `1e552b2`).
- [ ] Every test on the branch was seen red against `main`'s `lib/`. Re-derived at adoption: 15
      failed against `main`, all pass on the branch.
- [ ] Docs: `llms.txt`, `GUIDE.md`, `AIKB/{config,links,build-report,kiss}.md`, the `kiss-build-check`
      skill and a skill-coverage row; types regenerated.
- [ ] `npm run gates` green, and an independent (Codex) review, since `lib/` changed.
- [ ] Measured on a real site: diploma-msc's findings drop from 2,738 to 88 with its patterns.
      Reported by the peer session and not re-measured here, because that site's checkout is not
      this session's to run; the operator can confirm it.

**Non-goals / out of scope:**

- the rest of the handover: the migration docs (items 4, 6, 7 and 9), the slug notice (5), the
  logger's TTY colours (10) and a v1/v2 build-diff step (8). Each is its own branch, in the order
  proposed to the operator.
- the corpse-collector `config.toml` false positive, and the four smaller clean-room findings queued
  from `feat/homepage-codex`.

**Impact surface:** public API. `config.links.hostServed` and `report.links.hostServed` are new keys a
site can observe, and `check`'s output changes shape. Normally a minor; the number is the operator's
call, because 2.7.0 is still unpublished.

**Expected shape:** planned. The work exists; adoption adds one item of the same kind and the close.

**Delegation convention:** none. One session, because the branch is small and already built.

### Amendments

- **2026-10-02: version folded into the unpublished 2.7.0 (operator)**, as on `feat/homepage-codex`.
  Nothing since 2.6.2 is on npm, so one publish ships the import work, Codex and `hostServed`, and
  diploma-msc can take `hostServed` from it.

- **2026-10-02: Codex review (P2) fixed on this branch.** A root-relative reference was matched
  against `hostServed` as written, so `/v1/../gone.html` counted as host-served under `/v1/**`. The
  path is now normalised the way a browser does (`e93a9ad`), test seen red.
- **2026-10-02: queued from the operator's manual Codex import run, not for this branch.** Codex
  converted two real pages with `kiss-site-import`, and `check` passed with zero broken links; that
  answers PR #31's open Codex clean-room criterion. Its recommendations:
  - **Skills ahead of the engine.** The installed skills were 2.7.0 while npm's engine was 2.6.2,
    which lacks `splitDocument` and example 12. Publishing 2.7.0 removes this instance. The lasting
    fix is a version check in the skills, naming the engine version they need and the fallback.
  - **Outer wrappers.** `<body><div class="shell">…</div></body>` came back as one region from
    `splitDocument`. Unwrapping by hand and restoring the wrapper in the layout worked, and verified
    identical. Support that shape directly.
  - **Comparison tooling.** Example 12's `tools/compare.mjs` missed `&#38;` when decoding entities
    and reported a false difference. Use a complete decoder, and offer a whole-document comparison
    (attributes, metadata, CSS, scripts).
  - **A multi-page import example:** shared navigation, active states, a different stylesheet per
    page, and deciding which models are shared and which belong to a page.
  - **A lightweight path for experimental imports.** Keep source preservation and output comparison
    required, and make the branch rituals, the knowledge-base record and the launch review optional
    for a trial run.

## Pulse log

- **2026-10-02** — Criteria 1–5 met:
  - Adoption rebased cleanly onto `main`, and the gates pass.
  - The peer's 15 tests fail against `main`'s `lib/`, re-derived here.
  - Item 3 (audit printed twice) was reproduced: the same six findings appeared on stderr and
    stdout. It was fixed in `f7251c7`, test seen red.
  - `llms.txt`, `AIKB/kiss.md`, `GUIDE.md`, `types/` and the `kiss-build-check` skill cover it. The
    README documents no config keys, by design.

  Criterion 6 (independent review) is next, at the close.

  **Eyeball: looked.** The operator saw diploma-msc's check drop from 2,738 findings to 88 with its
  `hostServed` patterns.

  Decision: close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-10-02: `check` output that a large site can read, and `links.hostServed`

**What we shipped:** the diploma-msc session's two commits, rebased (`9bba3c9`, `1e552b2`); handover
item 3, audit findings printed once under check (`f7251c7`); and `hostServed` matching resolved in
URL space as a browser does (`e93a9ad`, `8c99cc1`). All folded into the unpublished 2.7.0.

**Supervision:** emergent from a handover rather than planned; **active supervisor**.

The work arrived from a peer session, so the standout dimension is **verification of relayed work**:

- **The peer's tests:** 15 failed against `main`'s `lib/`, re-derived here rather than taken from
  the handover.
- **Handover item 3:** reproduced before it was fixed, and it was real.
- **A false negative caught on Claude's side.** A `sed` range truncated stderr, which briefly made the
  duplication look unreproducible. The full output was checked before anything was concluded from it.

The operator decided the version (2.7.0 again) and confirmed the eyeball from diploma-msc's own run
(2,738 findings down to 88).

The weak point repeated the previous branch's lesson **inside the same day**. The first Codex
finding about request paths (dot segments) got a narrow patch (`e93a9ad`); the second review then
found two more cases of the same cause (a path prefix, and a climb above the root). The URL-space
rewrite (`8c99cc1`) is what should have followed the first finding. It is the method this branch's
own sibling log had just recommended.

**Feedback for next time:**

- **Claude — when a reviewer finds a path, URL or format bug, look for the semantic the code
  promised before patching the case.** `requestPath` promised "the path a browser requests"; the
  right fix was always to ask the browser's algorithm (`URL`), not to add `normalize`. This is the
  same lesson as `2026-10-02-homepage-codex` (allow-list after the first TOML finding), now in
  three logs counting 2026-10-01. That makes it a `/memory-consolidate` candidate: it belongs in
  `CLAUDE.md` § Rules.
- **Claude — print a stream whole before concluding from it.** A `sed` range ending at the first
  `<<` hid stderr and nearly produced a wrong "could not reproduce".
- **Process — `watch.test.js`'s "copies new assets…" failed once under the full suite, and passed
  5 of 5 alone and in the next full run.** It is a Windows timing flake to watch. If it recurs,
  record it in `AIKB/testing.md` § Gotchas.
- **Operator — after both PRs merge, rebuild `docs/` once (`node docs`), then publish 2.7.0.**
  This branch deliberately does not commit `docs/`, because it would conflict with #31's rebuild.
  `CHANGELOG.md`'s 2.7.0 entry will also need a trivial merge, since both branches add sections
  before its last line.

**Did we achieve the objective?** Met.

- [x] Broken links are counted, not listed twice, under check (peer's commit, re-verified).
- [x] Audit findings are counted, not listed twice, under check. Reproduced, then a test seen red.
- [x] `config.links.hostServed`, with matching hardened against three review findings. Two Codex
      rounds found issues; the third was clean.
- [x] Every test seen red against `main`'s `lib/` (15 from the peer, 6 added here).
- [x] Docs, types and the skill row. The changelog snippet was run against the engine.
- [x] `npm run gates` green, and an independent review.
- [x] Real-site measurement: the operator saw diploma-msc's 2,738 findings drop to 88.

Still open:

- the rest of the diploma-msc handover;
- the operator's Codex-import findings (queued above);
- the corpse-collector `config.toml` false positive.
