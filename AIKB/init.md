# init.js

## Responsibility

The decision core of `kiss-ssg init`: given what is already in a folder, which files to create, which to merge into, which to leave alone, and whether to install the engine. `bin/kiss-ssg.js` is the thin wrapper around it — it reads the folder and the shipped `starter/`, writes exactly what the plan says, runs npm for an `install` action and prints one line per action; every decision it acts on comes from here.

It exists so that a new user reaches a site through a coding agent in three shell lines: `init` declares kiss-ssg's two Claude Code plugins in the project's `.claude/settings.json` (and prints the `--scope project` commands that install them), points `CLAUDE.md` and `AGENTS.md` at `node_modules/kiss-ssg/llms.txt`, and drops a starter the `kiss-site-new` skill grows.

## Public interface

- `INIT_HELP` — the usage text `init --help` and a usage error print.
- `parseInitArgs(argv)` → `{ install, help, error }`. `--no-install` clears `install`; `--help`/`-h` sets `help`; anything else — including a script name, which `check` would take — is a usage `error`.
- `packageName(folderName)` → a valid npm package name for a new `package.json`: lower case, runs of anything npm refuses collapsed to one hyphen, no leading `.`/`_`/`-`; `kiss-site` when nothing is left (`..`).
- `planInit(state)` → `InitAction[]`, in order: `package.json`, the starter files (or one `skip` for `router.js`), `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, then the install (or a `skip` for `node_modules/kiss-ssg` when `package.json` already asks for a version or under `--no-install`, or nothing at all when the engine is installed). An action is `{ kind: 'write', path, content, verb: 'create'|'merge'|'append', detail? }`, `{ kind: 'skip', path, reason }` or `{ kind: 'install', spec }`. `state` is `InitState`: the folder name, the running version, `install`, `hasEngine`/`hasRouter`/`hasSrc`, the current text (or `null`) of whether `package.json`'s `main` names a real file (`hasMain`), the current text (or `null`) of the five files it may touch (`package.json`, `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.gitignore`), and the starter as `{ relativePath: text }`.
- `describeAction(action)` → the printed line: `  create   router.js`, `  merge    package.json (added scripts.dev; kept scripts.build)`, `  skip     CLAUDE.md — already points at llms.txt`, `  install  kiss-ssg@2.7.0`.
- `nextSteps()` → the closing text: the three `claude plugin … --scope project` install commands, then run `claude`, then paste `FIRST_PROMPT`. The commands come first because Claude Code does not offer to install plugins a project's `.claude/settings.json` declares (observed 2026-09-26 on a clean profile) — the declaration records which skills the site uses; it installs nothing on its own.
- Constants: `MARKETPLACE`, `MARKETPLACE_REPO`, `PLUGINS`, `LLMS_IMPORT`, `STARTER_MARKER`, `STARTER_RENAMES`, `FIRST_PROMPT`.

## Depends on

Nothing. It is pure: text in, actions out. The bin supplies the folder's state and the `starter/` folder's contents.

## Depended on by

- `bin/kiss-ssg.js` — dispatches `init` before `check`'s `parseArgs`, which never sees it.
- `test/unit/init.test.js` (the plan, and the shipped `starter/` on disk) and `test/integration/init.test.js` (the bin in an empty folder, then `check` over what it wrote, then a second run that must change nothing).

## Non-obvious behavior

- **The Codex review of this branch found the promise broken in five places, all fixed test-first:** an existing `.gitignore` was replaced by the starter's (now `planGitignore` appends only the missing lines); a site's own `kiss-ssg` range was replaced by the running version (now `declaredRange` skips the install and says to run `npm install`); a `scripts` that was not an object was spread into character keys (now skipped); a `null` marketplace entry was overwritten (now `in`); and `"type": "module"` plus `router.js` scripts were added to sites `init` did not write (now only with the starter, and never without a `router.js`).
- **Nothing is ever overwritten.** `package.json` and `.claude/settings.json` are merged key by key — an existing key is kept and named in the action's `detail` ("kept scripts.build") — and a file that is not a JSON object is skipped with a reason rather than replaced. `CLAUDE.md`/`AGENTS.md` are appended to only when they do not already mention `node_modules/kiss-ssg/llms.txt`, on a line of their own even when the file has no trailing newline.
- **The module type and `main` are the starter's, not the site's.** `"type": "module"` and `"main": "router.js"` are added only when this run writes the starter; a site that already has a `router.js` gets the scripts and nothing else, because switching its module type would change how Node reads a file `init` did not write.
- **A kept `"type"` other than `"module"` is reported, not fixed.** The starter's `router.js` uses `import`, so the detail says to set `"type": "module"` or rename it `router.mjs`; changing a site's module type behind its back could break everything else it runs.
- **A plugin the user switched off stays off.** The merge tests `plugin in enabledPlugins`, not truthiness, so `"kiss-memory@kiss-ssg": false` survives.
- **The starter is all or nothing, and kiss's shape is not the only sign of a site.** It is written only when `existingSite` finds nothing: no `router.js`, no `src/`, no `package.json` `main` naming a real file, and no `build` script other than ours — the final review found a CommonJS app with `main: index.js` being given `"type": "module"`. `npm init -y` names an `index.js` it never writes, so a folder it has just made still gets the starter. Otherwise one `skip` line names what it found. That is what makes `init` safe to run in an existing site.
- **`starter/gitignore` has no dot on purpose.** npm never packs a file named `.gitignore`, so the starter ships `gitignore` and `STARTER_RENAMES` writes it as `.gitignore`.
- **`STARTER_MARKER` is read by a skill.** The starter's `router.js` begins with `// Started by \`npx kiss-ssg init\``; `kiss-site-new`treats a`router.js`carrying it as a starter to grow, and one without it as somebody's site to build around. Changing the string breaks that skill's reading, and`test/unit/skill-coverage.test.js` pins it.
- **The bin writes defensively.** A `create` uses the `wx` flag, so it can never replace a file (or a dangling link) that appeared since the folder was read; a `merge` or `append` is written beside the file and renamed over it, so it lands whole or not at all. The first failed write stops the run, and a line is printed only after its write succeeded. `hasEngine` means `node_modules/kiss-ssg/package.json` exists, so an empty folder by that name is not taken for an installed engine.
- **The install is last and pinned to the running version.** Every file is written before npm runs, so a failed network still leaves a wired folder, and `kiss-ssg@<version>` means the engine installed is the one whose `init` just ran. It is skipped when `package.json` already asks for `kiss-ssg` in any dependency field — `npm install kiss-ssg@<version>` would replace the range the site chose. The bin spawns npm through a shell on Windows, where `npm` is `npm.cmd`, as one command string: a shell given an argument array prints Node's DEP0190 warning. (Codex also suggested a folder-local `npm.cmd` would run instead of npm; re-derived on Windows 11 with Node 24 it did not — the real npm ran — so no guard was added.)
- **Idempotent by construction.** Every action a first run writes produces a `skip` on the second, which `test/unit/init.test.js` asserts on the plan and the integration test asserts on the bytes.
