# upgrade.js

## Responsibility

`kiss-ssg upgrade`: install the running kiss-ssg into a site, check that the install really landed, and print the `CHANGELOG.md` upgrade notes between the version the site had and this one. It is also the one parser of the changelog's upgrade-note shape (`### Upgrading` / `### Upgrading: <topic>`), which `test/unit/changelog.test.js` imports rather than keeping a second regex.

## Public interface

- `parseVersion(text)` — `{ major, minor, patch, pre }`, or `null` for anything that is not a plain semver version (a range, a tag, `unknown`).
- `compareVersions(a, b)` — semver precedence, prereleases included; throws on a string that is not a version.
- `changelogEntries(text)` — every `## <version> — <date>` entry, in the file's order, with its `notes` and whether it says `### Nothing for a site to change`. A `##` heading that is not a version ends the entry.
- `upgradeNotes(text, from, to)` — `{ notes, quiet }`: the notes after `from` up to and including `to`, oldest first, and the versions in range with none.
- `specFloor(spec)` — the lowest version a plain `package.json` range allows, or `null`.
- `specAllows(spec, version)` — whether npm would install `version` for that range, by semver's rules: prereleases only from a prerelease range on the same version, and `^0.0.x` as that patch only.
- `saveFlag(section)` — `--save-prod` or `--save-dev`, so every command printed keeps kiss-ssg in its section.
- `chooseLockfile(exists)`, `ownEngine(engine)`, `gitStateFrom({ error, dirty })`, `registryFrom(run)` — the decisions about the facts the bin gathers: which lockfile wins, the site's own engine only, what git's answer means, the registry or npm's error.
- `GUARDED_FILES` — the files git is asked about before an install, by name, whether or not they exist: `package.json`, `package-lock.json`, `npm-shrinkwrap.json`. A tracked lockfile deleted and not committed is an uncommitted change; asking only about the lockfile on disk missed it, and the install wrote a fresh one into the pending change (Codex, at the close, 2026-11-01).
- `parseUpgradeArgs(argv)` — `--plan`, `--from <version>`, `--json`, `--help`.
- `planUpgrade(facts)` — the plan: `from` (and where it came from), `to`, the npm arguments or `null`, a refusal or `null`, `blocked`, `v1`, warnings, the notes.
- `verifyUpgrade(after, to, flag)` — `{ ok, checks }`: the check after the install, its fixes in `flag`'s section.
- `formatUpgrade(plan, result)` — the human-readable output.
- `UPGRADE_HELP` — the command's help text.

## Depends on

`lib/check.js` (`isWorkingTreeLink`).

## Depended on by

`bin/kiss-ssg.js` (`kiss-ssg upgrade`), which gathers every fact, runs npm and prints; `test/unit/changelog.test.js`; and, through the command, the `kiss-site-migrate` skill.

## Non-obvious behavior

- **The running package is the target.** It installs its own version and reads its own `CHANGELOG.md`, so the documented form is `npx kiss-ssg@latest upgrade`: a site's own older bin has no `upgrade`. Measured on npm 11.9 (2026-11-01): `npx kiss-ssg@latest` runs the registry copy even where a local or linked older copy exists.
- **It installs the exact version, `kiss-ssg@<to>`.** cmd.exe eats a `^` under `shell: true`, and npm writes its own caret into `package.json` anyway; a prerelease adds `--save-exact`. The section is the one `package.json` already uses.
- **The check after the install is the point of installing.** A plain `npm install` after a `file:` spec is edited keeps the link (six of six sites on the 2.5.0 upgrade; re-measured on npm 11.9). An install naming the version replaces it. So "npm exited 0" is not the verdict: `verifyUpgrade` requires the engine to be this version and not a working-tree link, and the lockfile entry to resolve from the registry npm is configured for. A GitHub tarball is an `https:` URL too, so "https:" is not the test.
- **A working-tree link's version is never a starting point, and never a reason to refuse.** npm's `latest` lags the working tree (only some versions are published), so a linked site reads as ahead of the release it is upgrading to. `from` is then unknown, every note up to `to` prints, and the output says to pass `--from`.
- **`from` precedence:** `--from`, then the installed copy (not a link), then the committed lockfile's version when the installed copy already equals `to` (a site `npm update` moved), then the declared range's floor, then unknown. A v1 `from` points at `GUIDE.md` § Migrating from v1 instead of printing every v2 note.
- **It refuses rather than guess**: no `package.json`, or a registry release newer than itself.
- **Some refusals block only the install** (`blocked`): a pnpm or yarn lockfile, uncommitted changes to `package.json` or the lockfile, and **any git failure other than "not a git repository" or no git installed at all** (`tryGit`'s `null` is never read as "not a repository", because a `safe.directory` refusal would then skip the check; a missing git means there is no commit to protect, `gitStateFrom`). They protect what the install writes, so `--plan` reads past them and prints the notes with the reason the install is blocked. `--plan --from` is the recovery after `npm update` broke a build, which is exactly when the lockfile is uncommitted (Codex, adversarial review, 2026-11-01).
- **"Current" means all three places a version lives agree**: node_modules holds it, the lockfile pins it from the configured registry, and `package.json`'s range allows it (`specAllows`). A lockfile still pinning the old release puts it back on the next `npm ci`, and a `package.json` still pinning it, or still a `file:` link, makes `npm ci` fail or `npm install` restore the old one. Both the decision to install nothing and the check after the install require all three (Codex, two passes of adversarial review, 2026-11-01). A site with no lockfile has one place fewer: node_modules and `package.json` agreeing is current (/code-review, 2026-11-01; it used to reinstall on every run).
- **An `npm-shrinkwrap.json` blocks the install.** npm installs from it in preference to `package-lock.json` beside it, so a current `package-lock.json` would prove nothing. `upgrade` neither guards nor verifies a shrinkwrap; it says so and names the manual command, and `--plan` still reads. No fleet site uses one, which is why it is a block and not a second lockfile path.
- **The project is the folder it runs in, and the lockfile is that folder's own.** Walking up to the nearest lockfile on disk read a workspace member's root lockfile, or an unrelated parent's (Codex review, 2026-11-01). The engine is the folder's own `node_modules/kiss-ssg` too (`ownEngine`): `describeEngine` walks up, and a parent folder's copy read as the site's own and refused the upgrade as a downgrade (/code-review, 2026-11-01). So the lockfile entry is always `node_modules/kiss-ssg`.
- **A workspace member is blocked, not driven.** npm's own `npm config get registry` fails there with `ENOWORKSPACES`; the install is blocked with the command to run from the workspace's root, and `--plan` still reads. `npm prefix` would name the root, but npm 11.9 redacts a UUID-like path segment in its output (`AIKB/upstream.md`).
- **A registry npm cannot name blocks the install.** It is never replaced with npmjs: that failed a private registry's correct lockfile.
- **Under `--json`, npm's output goes to stderr**, so stdout is only the report.
- **The checks print last, unindented, beside "Next:".** Everything the command says starts in column one; only the notes' own text is indented. In the 2026-11-01 arms an agent skipped the notes with `grep -v '^## \|^- \|^ '` and dropped the then-indented `ok:` lines with them (`planning/reviews/2026-11-01-upgrade-arms.md`).
- **A working-tree link's own version is named, never used.** For a linked engine the warning says what the tree reports and suggests `--from` with it, because that is the first guess an agent makes; it stays a suggestion, because a tree can carry unreleased changes on top of that version.
- **The tests never reach the network.** `test/integration/upgrade.test.js` puts `test/helpers/fake-npm.mjs` first on `PATH`. The real npm's behaviour is checked by an opt-in block that runs only with `KISS_NETWORK_TESTS=1`.

## Types

`UpgradeArgs`, `UpgradeFacts`, `UpgradePlan`, `LockFacts`, `Entry`, `Note`, `Check`, `Version` (JSDoc typedefs in the module).
