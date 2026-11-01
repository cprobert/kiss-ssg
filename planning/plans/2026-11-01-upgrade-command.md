# Contract — `kiss-ssg upgrade`, and the changelog as the one home of upgrade notes

Branch `feat/upgrade-command`. Session file: `planning/sessions/2026-11-01-upgrade-command.md`.
Every workstream builds against this document. When the design moves, it is amended **in place**
under a dated `## Amendment` heading at the end. Never fork it into a second plan.

## Why

Read with the session file's Objective. In one line: `kiss-site-migrate` carries a second, unchecked
copy of the changelog (§ 0a–0j, 31k characters). Its version-range and `file:`-link handling is shell
in a skill. Move the notes into `CHANGELOG.md`, move the mechanism into a command, and leave the
skill holding the method.

## What exists today (measured on `main` at `1a9d288`)

- `bin/kiss-ssg.js` dispatches `session`/`base` (a `run(argv, { cwd }) → { out, err, code }` from
  `lib/`), `--version`, `init` (planned in `lib/init.js`, I/O in the bin), then `check`/`aikb`.
- `init` already runs npm: `npm install --save-dev <spec>`, one command string with
  `shell: true` on Windows (npm is `npm.cmd`, and a shell given an argument array prints DEP0190),
  and an argument array elsewhere. That is the one npm call in the package, and `upgrade` copies its
  pattern (bin/kiss-ssg.js:232–247).
- `lib/check.js` exports `describeEngine({ cwd, from })` → `{ version, dir, linked, target }`, and
  `engineLine()`, which warns only when the link points outside any `node_modules`. pnpm's link
  into `node_modules/.pnpm` is the registry package. `upgrade` reuses both and does not reimplement
  either.
- `CHANGELOG.md`: 43 `## <version> — <date>` entries. Upgrade notes come in four shapes today:
  `### Upgrading` (2.7.0, line 701), `### Upgrading: <topic>` (2.6.4, line 807),
  `**Upgrade note:**` (2.6.0, line 919), and `**Upgrading?**` (2.5.0, line 1029).
  `test/unit/changelog.test.js` checks only that the newest entry is `package.json`'s version.
- No semver library is a dependency, and this work adds none (see A3).
- `test/unit/skill-coverage.test.js` has about 20 rows that name `kiss-site-migrate` (grep:
  lines 88, 131, 141, 157, 162, 167, 172, 189, 198, 208, 216, 234, 283, 292, 307, 318, 519, 595,
  603). Some pin per-release text (`"link": true`, `is not in the build`, `<sass:`,
  `do not compile standalone`, the 2.7.5 note). Others pin method text that stays
  (`trailingSlash`, `aliases`, `redirects: { format`, `canonical: true`, `check … --summary`).
- These files name `kiss-site-migrate` or the "note in the skill" rule: `CLAUDE.md` (Git workflow
  paragraph), `.claude/skills/branch-close/SKILL.md:124`, `README.md` (93, 185, 213),
  `plugins/kiss-ssg/README.md:40`, `llms.txt:9`, `lib/init.js:81`, `src/controllers/guide.js:15`,
  the kiss-memory skills, and other kiss-ssg skills. W3 sweeps them all.

## The design

### A. The command (workstream W1)

**A1. How it is invoked.** `npx kiss-ssg@latest upgrade`, or `npx kiss-ssg@<version> upgrade` to
pin. **The running package is the target**: it installs its own version, the way `init` installs
its own version, and it reads its own `CHANGELOG.md`. There is no `--to` flag, so the version is
fixed by the one spelling a person can read. A site on a version before this one cannot run
`npx kiss-ssg upgrade` from its own `node_modules` (its bin has no `upgrade`). That is why the
documented form always names a version spec. **Open question Q1** covers whether npx picks the
local or the registry copy.

**A2. What it reads before it changes anything.** All of it is plain data gathered by the bin and
passed to a pure planner:

- `package.json`: which section declares `kiss-ssg` (`dependencies` or `devDependencies`, or
  neither), and the spec it declares (`file:../kiss-ssg`, `^2.6.2`, a URL).
- `describeEngine({ cwd })`: the installed version, and whether it is a link to a working tree.
- `package-lock.json`, if present: `packages["node_modules/kiss-ssg"]`, with its `link`,
  `resolved` and `version`.
- `git status --porcelain -- package.json package-lock.json` through `tryGit` from `lib/git.js`.
  `null` means not a repository.
- Its own version and its own `CHANGELOG.md` text.

**A3. The plan (pure, in `lib/upgrade.js`).** `planUpgrade(facts)` returns
`{ from, to, install: { section, spec } | null, refuse: string | null, notes: Note[] }`:

- `from` is the installed version. A `file:` link reports the linked tree's version. When nothing
  is installed, `from` is the declared spec's floor: `^2.6.2` reads as `2.6.2`, and a spec it
  cannot read (a URL, a tag) is `null`.
- `to` is its own version. The `spec` is `^<to>`, or the exact `<to>` when `to` is a prerelease.
  It goes in the **same section** `package.json` already uses, `devDependencies` when there is
  none. npm flag: `--save-dev` or `--save-prod`.
- **Refuses** (exit 1, nothing written) when:
  - `to` is older than `from`. A downgrade is not an upgrade, and the message says to run
    `npm install kiss-ssg@<version>` by hand if a downgrade is meant.
  - `package.json` or `package-lock.json` has uncommitted changes in a git repository. The
    upgrade's diff has to be the only change in those two files, so it can be reviewed and
    reverted with one `git checkout`.
  - There is no `package.json`. That case is `init`'s.
- **Installs nothing** when `from === to`, the engine is not a link, and the lockfile resolves it
  from the registry. It says it is already on `to` and still prints the verification (A5).
- Comparing versions is a small local `compareVersions(a, b)`: semver precedence, including
  prerelease identifiers (`2.0.0-alpha.3 < 2.0.0-beta.0 < 2.0.0`). It is unit-tested against every
  version heading in `CHANGELOG.md`, which must sort to the file's order.

**A4. The install.** The bin runs `npm install kiss-ssg@<spec> <flag>`, with `init`'s
platform-split spawn. The claim this rests on, from the 2.5.0 fleet run on 6 of 6 sites, is that an
**explicit spec on the command line** re-resolves a `file:` link where a plain `npm install`
against an edited `package.json` does not. **This is a claim to measure, not a given (Q2).** If the
explicit spec turns out not to be enough, the plan gains a step before the install: remove the
lockfile's `node_modules/kiss-ssg` entry and the link itself. That decision is recorded as an
Amendment here.

**A5. The verification, always after the install.** This is the point of doing the install in the
command. Re-run the A2 reads, then report:

- the engine is not a link to a working tree (`engineLine`'s rule), and its version is `to`;
- the lockfile entry has no `link: true`, and its `resolved` is an `https:` tarball URL.

If either fails, the command exits 1 and names which check failed, what it found, and the manual
fix. A link that survives is reported, never silently accepted.

**A6. The notes.** `upgradeNotes(changelogText, from, to)` returns, oldest first, every entry with
`from < version <= to` that carries an upgrade note (shape in B1), as
`{ version, date, heading, text }`. Entries with no note are counted, not printed:
"N other releases with nothing to change". When `from` is `null` it prints every note up to `to`
and says it could not tell the starting version.

**A7. Output.** Human-readable on stdout, in this order:

1. one `from → to` line;
2. what it ran;
3. the verification lines;
4. the notes, each under `## <version>`;
5. one closing line: "Next: run `npx kiss-ssg check <script> --summary` before changing anything."

Errors go to stderr. `--plan` does everything except the install and the post-install
verification, so the notes can be read first. `--json` prints `{ from, to, install, verified,
notes }` for a skill or a script to read. Exit codes: 0 means upgraded and verified (or already
current); 1 means anything else: refused, npm failed, verification failed, or a usage error.
`session` and `base` also exit 1 on a usage error (`lib/sessions.js:252`, `lib/base.js:96`), so
`upgrade` matches them.

**A8. Module shape.** `lib/upgrade.js` exports `UPGRADE_HELP`, `parseUpgradeArgs`,
`compareVersions`, `changelogEntries`, `upgradeNotes`, `planUpgrade`, `verifyUpgrade(facts)` and
`formatUpgrade`. Nothing in it touches the filesystem or spawns anything. The bin gathers the facts,
runs npm, and prints, following the shape `init` already has. The top-level `HELP` gains an
`upgrade` line.

### B. The changelog shape (workstream W2)

**B1. One shape.** An upgrade note is a `### Upgrading` heading inside a version's entry. The
heading is exactly that text, optionally followed by `: <topic>`. An entry may have more than one
(`### Upgrading: the sitemap`, `### Upgrading: robots.txt`), and each runs to the next `###`/`##`.
`changelogEntries` and `upgradeNotes` are the only parser of that shape, and the test imports them.
There is no second regex.

**B2. Backfill.** Every note now held only in the skill moves into its entry, under its real
version:

| Skill § | Version | Note                                                                                                       |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 0 (top) | 2.5.0   | the `helpers/` default adopting an existing folder                                                         |
| 0 (top) | any     | the `file:` link trap: no longer a note, the command handles it (A4/A5); the skill keeps one line about it |
| 0a      | 2.5.0   | three things now fail; the `.watch()` `report().ok` change                                                 |
| (top)   | 2.6.0   | folder safety (`folders.src` at the root)                                                                  |
| 0b      | 2.6.4   | the audit, and the default title                                                                           |
| 0c      | 2.7.0   | Codex: re-run `init` (already there; merge the skill's extra lines)                                        |
| 0d      | 2.7.5   | `.md` copies; site tooling reading `llms.txt`                                                              |
| 0e      | 2.8.0   | three audit checks                                                                                         |
| 0f      | 2.8.0   | `package` as a page option                                                                                 |
| 0g      | 2.8.0   | `.md` copies only with `.llms()`                                                                           |
| 0h      | 2.8.2   | SCORM completion                                                                                           |
| 0i      | 2.8.4   | `{{@current}}` and `aria-current`                                                                          |
| 0j      | 2.8.6   | sitemap dates; `disallowAll`                                                                               |

Where the changelog already has a note, the two are **merged** into one note. The skill's version
is usually the more detailed, so neither is simply dropped. Each `**Upgrade note:**` and
`**Upgrading?**` becomes a `### Upgrading` section. The § 0d / § 0g contradiction goes away
because the two notes now sit under their own versions: 2.7.5 says what was true then, and 2.8.0
says what changed it. A note that only states a fix kiss made, with nothing for a site to do, is
not a note.

**B3. The test** (`test/unit/changelog.test.js`, extended):

- every `### Upgrading` heading parses as B1, and no other spelling (`Upgrade note`,
  `Upgrading?`) appears anywhere in the file;
- every minor version from 2.5.0 onwards (x.y.0) has at least one note. CLAUDE.md promises a minor
  always does;
- the version headings sort, by `compareVersions`, into the file's own order.

It must be seen failing: run it against today's `CHANGELOG.md` before W2's edits, and record the
failure in the Pulse log.

**B4. This branch's own entry** (2.9.0, written at close) carries an `### Upgrading` note:
`kiss-site-migrate` no longer holds release notes, and the way to upgrade is
`npx kiss-ssg@latest upgrade`.

### C. The skill, the rule and the docs (workstream W3)

**C1. `kiss-site-migrate`, new outline.** Target about 10k characters, measured with
`wc -c` and reported:

1. **Upgrade with the command.** Run `npx kiss-ssg@latest upgrade --plan`, read the notes, then run
   it without `--plan`. If it reports `unknown command`, the npx resolved an older copy; fall back
   to the documented manual path (Q1 decides what that is). If verification fails, the fix it
   prints is the fix.
2. **Check before changing anything**: `npx kiss-ssg check <script> --summary`. Failures before
   findings; a new failure is usually a bug the upgrade surfaced, not one it caused.
3. **Work each note** the command printed. A note is the contract; the skill holds no copy.
4. **Done when it builds the way it did.** Compare against the last record or the committed
   output. Audit findings are a separate piece of work for `kiss-site-review`.
5. **Re-record** with `npx kiss-ssg aikb <script>` and commit the upgrade (`package.json`, the
   lockfile, `AIKB/`) on its own.
6. **When URLs move**: `aliases`, `redirects: { format }`, `links: { trailingSlash }`,
   `links: { canonical: true }`. These are kept from today's § 5, which is method, not a release
   note.
7. **From v1**: one paragraph pointing at `GUIDE.md` § Migrating from v1 and `examples/9`. It keeps
   the rename-to-`router.js` grep (§ 2a), which is a method that no recipe holds.

The `@node_modules/kiss-ssg/llms.txt` line (today's § 2) stays, in one sentence. The description
stays within 400 characters (the 2.8.7 test) and still triggers on "upgrade kiss", "update
kiss-ssg", and "my kiss site broke after the upgrade".

**C2. `skill-coverage.test.js`.** Every `kiss-site-migrate` row is either kept (the method rows),
or re-pointed. A row pinning a release's text now pins `CHANGELOG.md`, through whatever the test
uses to read a non-skill file. Check during W3 whether it can; if not, the row moves into
`changelog.test.js`. The `"link": true` row becomes a row for the command's verification message.
**No row is deleted to make the suite pass**: a removed row is listed in the commit message with
where its obligation went. `CONTRADICTIONS` gains the old migrate sentences that would now be wrong
in the skill (a per-release `### 0` heading, and "the upgrade note … in the `kiss-site-migrate`
skill" in CLAUDE.md and `branch-close`).

**C3. The rule.** CLAUDE.md's Git workflow paragraph and `.claude/skills/branch-close/SKILL.md:124`
say: a minor ships with a `### Upgrading` note in `CHANGELOG.md`, which
`npx kiss-ssg upgrade` prints, and `test/unit/changelog.test.js` enforces. The words
"and in the `kiss-site-migrate` skill" go.

**C4. Public-API docs, in the same commit as the command.**

- `GUIDE.md`: a `### kiss-ssg upgrade` section beside the CLI's other commands. That new heading
  fails `node docs` until `src/models/guide.json` gives it a page or `src/controllers/guide.js`'s
  `LEFT_OUT` names it, so choose and do one.
- `llms.txt`: one index line, with the trap "runs as `npx kiss-ssg@latest upgrade`; the site's own
  older bin has no such command". The 16,000-character cap applies.
- `README.md`: the line 185 prompt row and the line 213 row.
- `plugins/kiss-ssg/README.md:40`.
- `lib/init.js:81`, if its wording changes.
- `AIKB/upgrade.md` in the template, plus a row in CLAUDE.md's table and the Commands block.
- `types/` regenerated with `npm run types`.
- The kiss-memory skills that mention `kiss-site-migrate` are read, and changed only if what they
  say becomes wrong.

### D. Measurement (workstream W4, after W1–W3 are green)

- **Fleet arm.** A sterilised scratchpad copy of `C:\Code\kiss\metacarpus` (or swan-love, whichever
  has the cleaner tree; record its `HEAD`), pinned at `^2.6.2`. Two headless `claude -p` sessions
  (Opus 5.5), each with `--setting-sources local`, no MCP, one plugin directory: `main`'s
  `plugins/` or this branch's. Brief: "Upgrade this site to the latest kiss-ssg and tell me what
  changed." **The engine both arms install is this branch's packed tarball**, served how Q1/Q2
  settle. Grade:
  - Did it reach `check` ok?
  - Did it work every applicable note (2.6.4 title, 2.7.5/2.8.0 `.md`, 2.8.4 `aria-current`,
    2.8.6 sitemap)?
  - Did it invent work?
  - Cost and time.

  No real site's tree changes: `git status` on the source is empty afterwards.

- **Clean room.** An empty folder with a starter site made by an older packed kiss-ssg (2.8.6),
  then re-pointed at a `file:` link to a working tree. A fresh agent with only the new tarball and
  plugin upgrades it. Pass: `check` ok, `node_modules/kiss-ssg` not a link, the lockfile resolving
  a tarball, and a list of every guess.
- Results go in `planning/reviews/2026-11-0x-upgrade-arms.md`, with "one run each: a signal, not a
  verdict".

## Workstreams, ownership and seams

| WS  | Owns (may write)                                                                                                                                                                                                                                                                                | Depends on                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| W1  | `lib/upgrade.js`, `bin/kiss-ssg.js` (the `upgrade` branch and `HELP` only), `lib/check.js` (`HELP` text only), `test/unit/upgrade.test.js`, `test/integration/upgrade.test.js`, `AIKB/upgrade.md`                                                                                               | —                                                                                |
| W2  | `CHANGELOG.md`, `test/unit/changelog.test.js`                                                                                                                                                                                                                                                   | W1's `changelogEntries`/`compareVersions` signatures (A8). Can start on the text |
| W3  | `plugins/kiss-ssg/skills/kiss-site-migrate/`, `test/unit/skill-coverage.test.js`, `CLAUDE.md`, `.claude/skills/branch-close/SKILL.md`, `GUIDE.md`, `llms.txt`, `README.md`, `plugins/kiss-ssg/README.md`, `lib/init.js` (text), `src/models/guide.json` or `src/controllers/guide.js`, `types/` | W1's flags and messages; W2's notes landed (so the skill can drop them)          |
| W4  | `planning/reviews/`, the scratchpad                                                                                                                                                                                                                                                             | W1–W3 green                                                                      |

Seams:

- **The parser** is W1's, and W2 imports it.
- **The messages** the skill quotes (`unknown command`, the verification failures) are W1's
  strings. W3 quotes them only after W1 lands.
- **The `"link": true` coverage row** is the one obligation that moves from a skill into code.
  W3 does not delete it until W1's verification test exists.

Order: W1's pure core and W2's text in parallel, then the W1 bin and integration, then W3, then
W4. Agents implement inside one row's files, and never commit.

## Open questions, settled before W1's bin code

- **Q1. Which copy does `npx kiss-ssg@latest upgrade` run** inside a project whose `node_modules`
  already has an older kiss-ssg? The expectation (inferred, not measured) is that npm 10's
  `npm exec` uses the local copy only when its version satisfies the spec, and otherwise fetches
  the registry one. Measure it with npm 10 on Windows, with a local tarball standing in for the
  registry if needed. If the local copy wins, the documented form changes (e.g.
  `npx --package kiss-ssg@latest kiss-ssg upgrade`) and A1 is amended.
- **Q2. Does an explicit `npm install kiss-ssg@^X` replace a `file:` link?** This is the fleet's
  6-of-6 claim, re-measured on npm 10. The regression test (session criterion 2) has to be seen
  failing against a plain `npm install`. Its harness needs a registry. Choose one of:
  - (a) a local registry (verdaccio) as a devDependency, for one test: heavy;
  - (b) a tarball spec, which tests a different resolution path: weak;
  - (c) the pure planner and verifier tested in units, with one opt-in integration test against
    the real registry and the published 2.8.7, skipped unless `KISS_NETWORK_TESTS=1`, so the
    gates stay offline.

  The proposal is (c), plus the clean room (D) as the end-to-end proof. Whether an opt-in test
  satisfies "seen to fail" is the operator's call, raised before W1's integration test is written.

- **Q3. A site with no lockfile** (`npm install --no-package-lock`, or pnpm or yarn): the
  verification of the lockfile is reported as "no package-lock.json: not checked", not as a pass.
  pnpm and yarn are detected by their lockfile and refused with the command to run by hand. This
  is proposed, not measured: no fleet site uses them, so it gets an Amendment if the critique
  objects.
- **Q4. Exit code for a usage error.** Settled while writing the contract: 1, the same as
  `session` and `base` (A7).

## Amendments

<!-- Dated sections, appended. The design above is amended in place only by pointing to these. -->
