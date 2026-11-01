---
branch: feat/upgrade-command
base: main
status: open
opened: 2026-11-01
---

# Session — 2026-11-01: `kiss-ssg upgrade`, and a migrate skill that is a method, not a changelog

## Intent (captured at /branch-open)

**Objective:** Make `CHANGELOG.md` the one home of every upgrade note, give sites a `kiss-ssg upgrade`
command that installs the new version correctly and reports the notes that apply between the old
and new versions, and cut `kiss-site-migrate` down to the upgrade method. Today the skill is 31k
characters, two of its sections give no version, it contradicts itself (§ 0d against § 0g), and it
keeps a second copy of the changelog that nothing checks.

**Success criteria:**

- [ ] `npx kiss-ssg upgrade` exists, with its decisions in a new `lib/` module that has a
      `test/unit/` test and an `AIKB/` doc and a row in CLAUDE.md's table, and its wrapper is
      covered end to end in `test/integration/`. It reports the range `package.json` declares,
      the version installed, whether `node_modules/kiss-ssg` is a link, and whether the lockfile
      resolves it from the registry.
- [ ] It installs the target version so that a `file:` link really is replaced: afterwards
      `node_modules/kiss-ssg` is a real folder and the lockfile names the registry tarball. A
      regression test that was seen to fail against a plain `npm install` proves it.
- [ ] It prints the `CHANGELOG.md` upgrade notes for every version after the old one up to and
      including the new one, and only those.
- [ ] Every `CHANGELOG.md` entry that needs an upgrade note has one in a single fixed shape, and a
      test fails a minor release without one. That includes the notes now only in the skill
      (§ 0a–0j), each under its real version: § 0b is 2.6.4 and § 0i is 2.8.4.
- [ ] `kiss-site-migrate` holds the method only: run `upgrade`, then `check` before changing
      anything, fix failures before findings, "done when it builds the way it did", re-record
      `aikb`, and the redirect and `trailingSlash` decision. It holds no per-release section, and
      the v1 → v2 recipes are a pointer to `GUIDE.md` § Migrating from v1 and example 9. Target
      about 10k characters; the measured length goes in the Pulse log.
- [ ] `test/unit/skill-coverage.test.js`'s `kiss-site-migrate` rows are re-pointed at
      `CHANGELOG.md` or the command on purpose, with none deleted to make the suite pass, and
      `CONTRADICTIONS` bans any old migrate sentence the change makes wrong.
- [ ] CLAUDE.md's "upgrade note in `CHANGELOG.md` and in the `kiss-site-migrate` skill" rule says
      `CHANGELOG.md` only, in the fixed shape; `/branch-close`'s version step and
      `GUIDE.md`, `README.md`, `llms.txt` (one index line) and `types/` follow.
- [ ] **Fleet arm:** a copy of one 2.6.2 fleet site (metacarpus or swan-love) is upgraded to this
      branch's packed engine by one headless session with `main`'s skills and one with this
      branch's. The report names what each did and missed, and the cost of each. Each arm runs
      once, so the result is a signal, not a verdict. No real site's tree changes.
- [ ] **Clean room:** a fresh agent given only the packed tarball and the shipped plugin upgrades a
      site from an older kiss-ssg (on a `file:` link) to this version, ends with `kiss-ssg check`
      passing, and reports every place it had to guess.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- Detecting hazards in the site (a `package` key, `scormBridge`, `aria-current` under
  `{{#if active}}`): later, one at a time, as fleet upgrades show they are needed.
- Promoting the arm harness to `scripts/`. It is rebuilt in the scratchpad again, and it is now
  the fourth time it has been asked for (10-13, 10-21, 10-31, here).
- Upgrading any real fleet site.
- Rewriting the v1 → v2 recipes themselves.
- `kiss-seo`.

**Impact surface:** public API: a new CLI command that writes `package.json` and the lockfile, and
upgrade notes move from the skill to `CHANGELOG.md`. Proposed bump: minor (2.9.0), with an upgrade
note.

**Expected shape:** between. The destination is known, but which notes the skill really carries
that the changelog lacks, and how `npm` behaves when the command calls it on Windows, will only be
known once the work is under way.

**Delegation convention:** the main session writes the contract and reviews everything. One fresh
agent critiques the contract before any code is built against it. Sub-agents may implement inside a
scope the contract names. Agents never commit: the operator's diff review is the checkpoint.

**Contract:** `planning/plans/2026-11-01-upgrade-command.md`. Amended in place with dated sections.

### Amendments

- **2026-11-01, at the open: the command also installs** (Claude recommended a read-only report).
  The operator's reason: no reason given.
- **2026-11-01, after the contract critique** (`planning/plans/2026-11-01-upgrade-command.md` §
  Amendments).
  - npm's latest is 2.8.0, and 2.8.1–2.8.7 were never published. The operator says this is
    deliberate, and `upgrade` installs from the registry only.
  - Criterion 2's regression test is an opt-in test (`KISS_NETWORK_TESTS=1`) against the real
    registry. It is seen red and then green on this machine, with both runs in the Pulse log.
    The gates use a fake `npm`.
  - The fleet arm and the clean room install this branch's 2.9.0 from a verdaccio running in the
    scratchpad. Nothing is published to npm.
  - The fleet copy's `node_modules` holds 2.5.0 although its lockfile says 2.6.2, so the arm
    really starts from 2.5.0.
  - The command gains `--from <version>`, for a site that broke after an upgrade it did not run.
    That is scope added by the critique.
- **2026-11-01, at the operator's request: a review of `llms.txt`.** It went past the one named
  cut the contract needed (C4), from 15,993 to 14,334 characters (`ebde5ad`), and changed two
  tests that pinned the duplicate text it removed. Tooling and docs, inside the minor. The twelve
  skill names were kept because `skill-coverage.test.js` records a clean-room agent that followed
  a skill `llms.txt` did not name. `init`'s npm call now shares `upgrade`'s spawn helper: the same
  Windows rule, written once.
- **2026-11-01, after the operator's Codex review (`27c6e7e`): a workspace member is blocked,
  not supported.** This reverses the critique's walk-up-to-the-root's-lockfile amendment. The
  walk read a member's stale lockfile, or an unrelated parent's. The intended fix, `npm prefix`,
  was disproved by the real npm 11.9, which redacts a UUID-like path segment in its output
  (`AIKB/upstream.md`). npm's own `ENOWORKSPACES` now blocks the install, and `--plan` still
  reads. Claude chose this to match the operator's shrinkwrap call, and the operator has not
  overruled it.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-01** — Criteria 1–4 and 10 met.
  - **1 and 3:** `lib/upgrade.js` has 44 unit tests and 11 integration tests against a fake npm
    first on `PATH`. `--plan` on a scratch site at `^2.6.2` printed 11 notes from 2.6.4 to 2.8.6
    and listed 15 releases with nothing to change.
  - **2:** the opt-in real-npm test was red with a plain `npm install` ("expected true to be
    false": still a link) and green with `npm install kiss-ssg@2.8.0 --save-dev`. With
    `KISS_NETWORK_TESTS=1` the integration file is 13/13, on npm 11.9.0 under Windows. The
    link-survives integration test also went red with `verifyUpgrade`'s link check disabled.
  - **4:** `changelog.test.js` was red against the unedited `CHANGELOG.md` (7 notes in other
    shapes, and 2.5.0, 2.6.0 and 2.8.0 with no note) and green after the backfill (`0f3b943`).
  - **10:** `npm run gates` passed all five, with the pack at 350 files.

  Criterion 7 is partial: CLAUDE.md's table row, Commands entry and Rules line, and `types/`, are
  done. Criteria 5, 6, 8 and 9 are not yet, as W3 and W4.

  Drift: the `llms.txt` review, recorded as an Amendment. Nothing against the non-goals.

  **Eyeball: looked** — the operator read the `upgrade --plan` output for a site at `^2.6.2`
  (`scratchpad/up1/out.txt`): "reads well".

  **Offer:** for a working-tree link, `from` is unknown, so every note up to `to` prints unless
  `--from` is given. The operator said keep.

  Decision: continue, to W3.

- **2026-11-01, Codex adversarial review: two passes.** The stop condition, set before the second
  pass: the scope is `lib/upgrade.js`, the `upgrade` section of `bin/kiss-ssg.js`, and its tests
  and fake npm; only high and medium findings count; anything lower is recorded here. No pass
  reported a lower note.
  - **Pass 1 (`ca05204`).**
    - _High:_ "current" ignored the lockfile's version.
    - _Medium:_ the write guards also refused `--plan`. The fix covered the class, including the
      pnpm refusal, which told the reader to run the very `--plan` it then refused.
  - **Pass 2 (`36d1b20`).**
    - _Medium:_ "current" ignored `package.json`. Now `node_modules`, the lockfile and
      `specAllows` must all agree.
    - _Medium:_ `npm-shrinkwrap.json` was invisible. It now blocks the install, by the
      operator's choice over supporting it.

  Every fix was seen red first: 6 + 1 tests in pass 1, 6 + 1 in pass 2. Gates were green after
  each. Both passes found narrower faces of one class, "current" judged from part of the
  evidence. The operator stopped the loop there: W4's clean room and fleet arm test the command
  against the real npm. Decision: W3.

- **2026-11-01** — After W3 (`0fef6a2`), criteria 1–7 and 10 are met.
  - **5:** `kiss-site-migrate` is 8,892 characters, down from 30,894. It has no per-release
    section; the heading ban matched 11 headings in the old skill.
  - **6:** of the 19 coverage rows that named the skill, 11 were kept and 8 re-pointed to
    `CHANGELOG.md` as records, with the reason in a test comment. One new row covers the
    command. The bans were seen red against the old skill, rule and README.
  - **7:** the rule is replaced in CLAUDE.md and `branch-close` and banned in
    `changelog.test.js`. GUIDE.md gains § Upgrading a site; the guide controller test caught a
    `#migrating-from-v1` link the docs site leaves out. `llms.txt` is 14,675 characters, and
    both READMEs are updated. `docs/` is regenerated at close.
  - **10:** `npm run gates` passed all five.

  Criteria 8 and 9 are not yet: W4.

  Drift: none. The ten other skills naming `kiss-site-migrate` were read; all are still true,
  so none changed.

  **Eyeball: looked** — the operator read the new `kiss-site-migrate` `SKILL.md` end to end:
  "reads well".

  **Offer:** the eight re-pointed rows are records, not guards; a future note's content is
  guarded only by the "every minor has a note" shape test. The operator said keep.

  Decision: continue, to W4.

- **2026-11-01** — W4 and three more review rounds, recorded at the close.
  - **W4 run 1** (`dd213a6`): criteria 8 and 9 met, $1.55. The arms found three issues, all
    fixed in `25d9eb2`:
    - an unasked commit;
    - indented checks that a filter dropped;
    - "unknown" for a linked tree whose version the command knew.
  - **The operator's Codex review** found two P2s on workspaces and the registry, fixed in
    `27c6e7e`; the Amendment above records the workspace decision.
  - **The operator's `/code-review`** found ten. 1–8 and 10 were fixed in `5cea21b`, by the
    operator's choice; #9, a delay rather than a wrong answer, was left. The class: the bin's
    decisions moved into `lib/upgrade.js` with unit tests (#7). Every fix in these rounds was
    seen red first.
  - **W4 run 2** (`9b8a748`), against `5cea21b`: criteria 8 and 9 still met, $1.43, and run 1's
    three findings are gone in the transcripts.
  - **The launch:** the operator launched the arms; Claude's launch with
    `--dangerously-skip-permissions` was refused by the permission check. Run 2 was launched by
    Claude at the operator's explicit request.

  Decision: close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
