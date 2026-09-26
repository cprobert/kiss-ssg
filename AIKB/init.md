# init.js

## Responsibility

The decision core of `kiss-ssg init`: given what is already in a folder, which files to create, which to merge into, which to leave alone, and whether to install the engine. `bin/kiss-ssg.js` is the thin wrapper around it — it reads the folder and the shipped `starter/`, writes exactly what the plan says, runs npm for an `install` action and prints one line per action; every decision it acts on comes from here.

It exists so that a new user reaches a site through a coding agent in three shell lines: `init` declares kiss-ssg's two Claude Code plugins in the project's `.claude/settings.json` (and prints the `--scope project` commands that install them), points `CLAUDE.md` and `AGENTS.md` at `node_modules/kiss-ssg/llms.txt`, and drops a starter the `kiss-site-new` skill grows.

## Public interface

- `INIT_HELP` — the usage text `init --help` and a usage error print.
- `parseInitArgs(argv)` → `{ install, help, error }`. `--no-install` clears `install`; `--help`/`-h` sets `help`; anything else — including a script name, which `check` would take — is a usage `error`.
- `packageName(folderName)` → a valid npm package name for a new `package.json`: lower case, runs of anything npm refuses collapsed to one hyphen, no leading `.`/`_`/`-`; `kiss-site` when nothing is left (`..`).
- `planInit(state)` → `InitAction[]`, in order: `package.json`, the starter files (or one `skip` for `router.js`), `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, then the install (or a `skip` for `node_modules/kiss-ssg` under `--no-install`). An action is `{ kind: 'write', path, content, verb: 'create'|'merge'|'append', detail? }`, `{ kind: 'skip', path, reason }` or `{ kind: 'install', spec }`. `state` is `InitState`: the folder name, the running version, `install`, `hasEngine`/`hasRouter`/`hasSrc`, the current text (or `null`) of the four files it may touch, and the starter as `{ relativePath: text }`.
- `describeAction(action)` → the printed line: `  create   router.js`, `  merge    package.json (added scripts.dev; kept scripts.build)`, `  skip     CLAUDE.md — already points at llms.txt`, `  install  kiss-ssg@2.7.0`.
- `nextSteps()` → the closing text: the three `claude plugin … --scope project` install commands, then run `claude`, then paste `FIRST_PROMPT`. The commands come first because Claude Code does not offer to install plugins a project's `.claude/settings.json` declares (observed 2026-09-26 on a clean profile) — the declaration records which skills the site uses; it installs nothing on its own.
- Constants: `MARKETPLACE`, `MARKETPLACE_REPO`, `PLUGINS`, `LLMS_IMPORT`, `STARTER_MARKER`, `STARTER_RENAMES`, `FIRST_PROMPT`.

## Depends on

Nothing. It is pure: text in, actions out. The bin supplies the folder's state and the `starter/` folder's contents.

## Depended on by

- `bin/kiss-ssg.js` — dispatches `init` before `check`'s `parseArgs`, which never sees it.
- `test/unit/init.test.js` (the plan, and the shipped `starter/` on disk) and `test/integration/init.test.js` (the bin in an empty folder, then `check` over what it wrote, then a second run that must change nothing).

## Non-obvious behavior

- **Nothing is ever overwritten.** `package.json` and `.claude/settings.json` are merged key by key — an existing key is kept and named in the action's `detail` ("kept scripts.build") — and a file that is not a JSON object is skipped with a reason rather than replaced. `CLAUDE.md`/`AGENTS.md` are appended to only when they do not already mention `node_modules/kiss-ssg/llms.txt`, on a line of their own even when the file has no trailing newline.
- **A kept `"type"` other than `"module"` is reported, not fixed.** The starter's `router.js` uses `import`, so the detail says to set `"type": "module"` or rename it `router.mjs`; changing a site's module type behind its back could break everything else it runs.
- **A plugin the user switched off stays off.** The merge tests `plugin in enabledPlugins`, not truthiness, so `"kiss-memory@kiss-ssg": false` survives.
- **The starter is all or nothing.** It is written only when neither `router.js` nor `src/` exists; otherwise one `skip` line says a site is already here. That is what makes `init` safe to run in an existing site.
- **`starter/gitignore` has no dot on purpose.** npm never packs a file named `.gitignore`, so the starter ships `gitignore` and `STARTER_RENAMES` writes it as `.gitignore`.
- **`STARTER_MARKER` is read by a skill.** The starter's `router.js` begins with `// Started by \`npx kiss-ssg init\``; `kiss-site-new`treats a`router.js`carrying it as a starter to grow, and one without it as somebody's site to build around. Changing the string breaks that skill's reading, and`test/unit/skill-coverage.test.js` pins it.
- **The install is last and pinned to the running version.** Every file is written before npm runs, so a failed network still leaves a wired folder, and `kiss-ssg@<version>` means the engine installed is the one whose `init` just ran. The bin spawns npm with `shell: true` on Windows, where `npm` is `npm.cmd`.
- **Idempotent by construction.** Every action a first run writes produces a `skip` on the second, which `test/unit/init.test.js` asserts on the plan and the integration test asserts on the bytes.
