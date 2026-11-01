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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
