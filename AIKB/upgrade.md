# upgrade.js

## Responsibility

`kiss-ssg upgrade`: install the running kiss-ssg into a site, check that the install really landed, and print the `CHANGELOG.md` upgrade notes between the version the site had and this one. It is also the one parser of the changelog's upgrade-note shape (`### Upgrading` / `### Upgrading: <topic>`), which `test/unit/changelog.test.js` imports rather than keeping a second regex.

## Public interface

- `parseVersion(text)` — `{ major, minor, patch, pre }`, or `null` for anything that is not a plain semver version (a range, a tag, `unknown`).
- `compareVersions(a, b)` — semver precedence, prereleases included; throws on a string that is not a version.
- `changelogEntries(text)` — every `## <version> — <date>` entry, in the file's order, with its `notes` and whether it says `### Nothing for a site to change`.
- `upgradeNotes(text, from, to)` — `{ notes, quiet }`: the notes after `from` up to and including `to`, oldest first, and the versions in range with none.
- `specFloor(spec)` — the lowest version a plain `package.json` range allows, or `null`.
- `parseUpgradeArgs(argv)` — `--plan`, `--from <version>`, `--json`, `--help`.
- `planUpgrade(facts)` — the plan: `from` (and where it came from), `to`, the npm arguments or `null`, a refusal or `null`, warnings, the notes.
- `verifyUpgrade(after, to)` — `{ ok, checks }`: the check after the install.
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
- **Some refusals block only the install** (`blocked`): a pnpm or yarn lockfile, uncommitted changes to `package.json` or the lockfile, and **any git failure other than "not a git repository"** (`tryGit`'s `null` is never read as "not a repository", because a `safe.directory` refusal would then skip the check). They protect what the install writes, so `--plan` reads past them and prints the notes with the reason the install is blocked. `--plan --from` is the recovery after `npm update` broke a build, which is exactly when the lockfile is uncommitted (Codex, adversarial review, 2026-11-01).
- **"Current" means the lockfile pins this version too**, not only node_modules: a lockfile still pinning the old release puts it back on the next `npm ci`. Both the decision to install nothing and the check after the install require it (Codex, the same review).
- **The lockfile is found by walking up**, as npm does, so a workspace member's lockfile is the root's. The engine's entry is keyed by its path relative to that lockfile's folder.
- **Under `--json`, npm's output goes to stderr**, so stdout is only the report.
- **The tests never reach the network.** `test/integration/upgrade.test.js` puts `test/helpers/fake-npm.mjs` first on `PATH`. The real npm's behaviour is checked by an opt-in block that runs only with `KISS_NETWORK_TESTS=1`.

## Types

`UpgradeArgs`, `UpgradeFacts`, `UpgradePlan`, `LockFacts`, `Entry`, `Note`, `Check`, `Version` (JSDoc typedefs in the module).
