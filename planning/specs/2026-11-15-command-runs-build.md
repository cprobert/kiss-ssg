# The command runs the build: design for Phase 2 (2.18)

Spec for [the roadmap](../plans/2026-11-10-roadmap-to-3.0.md)'s Phase 2, on the branch
`feat/command-runs-build`. Written 2026-11-15 from the session log's criteria, the
[peer research](../research/2026-11-15-peer-build-commands.md) and the
[baselines](../benchmarks/2026-11-15-phase-2-baselines.md). No code exists for it yet. Work
orders follow once this has been critiqued, reviewed by Codex and approved.

**How to read the evidence.** **[M]** is measured: a `file:line` read on 2026-11-15 at `acc73dd`,
or a command whose output is quoted. **[I]** is inferred and must be measured by the slice that
depends on it. Every probe below ran on this machine's Node **24.14.0** (`node --version`). The
floor is 22.23.4, so each probe is [M] for 24 and [I] for the floor until CI's Ubuntu and Windows
jobs run its test. Nothing here started a dev server or a watcher, so every statement about a
running dev session is [I].

## 1. What is built

`build` and `dev` are new. `check`, `aikb` and `images` exist and move onto the same mechanism.

```
kiss-ssg build [script] [args…]    build once; print a verdict; exit 0 or 1
kiss-ssg dev   [script] [args…]    build, serve, watch; restart when the script is edited
kiss-ssg check [script] [args…]    as today: staged, discarded, reported
kiss-ssg aikb  [script] [args…]    as today
kiss-ssg images [script] [args…]   as today
```

The script stays what it is: an imperative program that makes a `Kiss`, registers pages and awaits
`complete()`. What it stops carrying is the process: no `reportBuildFailure`, no `--dev` parsing,
no final `.catch`. The starter's script becomes:

```js
import Kiss from 'kiss-ssg'

const kiss = new Kiss({
  site: { name: 'My kiss site', description: 'A site built with kiss-ssg.' },
})
  .scan()
  .generate()

await kiss.complete()
```

`node router.js` still runs it. Without the command a failed build ends in Node's own report of
the unhandled rejection and exit code 1 (§ 5.4).

### Settled before this spec (operator-approved)

- The command owns **run modes** (build, dev, check). A site's own environment (`production`,
  `uat`, an intake) is a positional argument passed through. There is no `--mode` flag.
- A failed build sets `process.exitCode = 1` and prints each failure once.
- Dev survives an edit to the script and keeps serving the last good build.
- `node <script>` and the `KISS_*` variables keep working until 3.0.
- Out of scope: restructuring `lib/kiss.js`; the sites' own steps before and after the build;
  issue #90's slug convention; migrating fleet sites; anything not on Phase 2's list.

## 2. What the code does today

| Fact                                                                                                                                                                                     | Evidence                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `check` and `aikb` run the script with `spawnSync(process.execPath, [script, ...args])`, cwd unchanged, `KISS_CHECK`, `KISS_REPORT` and (aikb) `KISS_AIKB` in the env, stdio `[0, 2, 2]` | [M] `bin/kiss-ssg.js:558-576`                                                       |
| `images` does the same, twice at most, adding `KISS_IMAGES` and `KISS_IMAGES_REFRESH`                                                                                                    | [M] `bin/kiss-ssg.js:127-147`                                                       |
| The engine reads the run from the environment in four places                                                                                                                             | [M] `lib/kiss.js:777`, `lib/build-finish.js:85`, `:252`, `:651`                     |
| Check mode overrides the script's config: `cleanBuild = 'atomic'`, `dev = false`                                                                                                         | [M] `lib/kiss.js:782-785`                                                           |
| In dev the constructor starts the HTTP server and livereload in-process, then the watcher                                                                                                | [M] `lib/kiss.js:860-896`, `lib/dev-server.js:16-87`                                |
| The constructor empties the build folder when `cleanBuild` is truthy, in dev too                                                                                                         | [M] `lib/kiss.js:928-934`                                                           |
| An edit to the script in dev replays the pages registered at start-up and says an added page "needs a restart"                                                                           | [M] `lib/rebuild.js:555-567`, `lib/watcher.js:116-134`                              |
| Every settle step (purge, images, redirects, consent files, cache headers, packages, link scan, audit, report) runs inside `complete()`                                                  | [M] `lib/kiss.js:1632-1661`                                                         |
| A build with a failing page and no `complete()` exits 0                                                                                                                                  | [M] `node router.js b --none` in the scratch site of § 6: `exit=0`                  |
| `check` on a script with no `complete()` exits 1 with "no build report was written", and leaves its staging folder behind                                                                | [M] same site: `exit=1`; `public-b.kiss-staging-20984-iti11x` left on disk          |
| An uncaught `complete()` rejection makes Node print the `AggregateError`, every stack and the whole report object                                                                        | [M] `node router.js b --bare`: `exit=1`, the dump starts at `lib/kiss.js:1668`      |
| A pipeline `watch` process is its own process group on POSIX and is not detached on Windows; it is ended by group signal or `taskkill /T /F`; the grace before SIGKILL is 2 s            | [M] `lib/pipeline.js:36`, `:101-109`, `:126-136`, `:240-258`                        |
| `kiss-ssg init` writes `build: 'node router.js'` and `dev: 'node router.js --dev'`                                                                                                       | [M] `lib/init.js:51-52`                                                             |
| Each entry script calls `complete()` once per `new Kiss`: the starter, 15 examples, the fleet's entries                                                                                  | [M] grep counts, re-run 2026-11-15 for the starter and examples; fleet by the brief |
| Failure boilerplate: `reportBuildFailure` in the starter and 14 examples; example 4 has it inline                                                                                        | [M] grep per file; `examples/4-layouts-and-partials/router.js:62-69`                |
| The package answers `require('kiss-ssg')` and `import` from one file                                                                                                                     | [M] `package.json:7-12`                                                             |

## 3. The fleet under the command

Measured 2026-11-15 from each site's `package.json` and entry script under `C:/Code/kiss`. The six
exit sites first. "Own `dev`" is how the script computes the `dev` it passes to `new Kiss`.

| Site           | Entry           | Type | Positional arguments                     | Own `dev`                                        | Steps chained in npm scripts                                              |
| -------------- | --------------- | ---- | ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| a1k9training   | `router.js`     | ESM  | none                                     | `args.length > 0` (`router.js:13`); run as `dev` | `npm run build && npm run qa:…` (the `qa` chain)                          |
| oxford-medical | `router.js`     | ESM  | none                                     | `argv.includes('--dev')` (`:28`)                 | `node router.js && pagefind && node tools/purge-css.mjs && …`             |
| diploma-msc    | `router.js`     | CJS  | `dev\|staging\|content\|uat\|production` | instance is `dev`; **no argument means `dev`**   | `npm run get-data && node router production && (firebase deploy …)`       |
| learna-kiss    | `router.js`     | CJS  | `dev\|staging\|uat\|production`          | as diploma-msc                                   | as diploma-msc                                                            |
| medulla        | `router.js`     | CJS  | instance, default `dev` (`:28-33`)       | `instance == "dev"` (`:48`)                      | `node get-data-orchard && node router production`, then `firebase deploy` |
| metacarpus     | `new-cohort.js` | CJS  | `<intake>`, `--label <name>`             | `args[0] === 'test'` (`:24`)                     | `npm run clean && node get-data-orchard && node new-cohort`               |
| metacarpus     | `export.js`     | CJS  | none                                     | none                                             | `npm run clean && node export`, then `firebase deploy`                    |
| pro-plumbing   | `router.js`     | ESM  | none                                     | `argv.includes('dev')` (`:4`)                    | none                                                                      |
| k9-solutions   | `router.js`     | ESM  | none                                     | `argv.includes('--dev')` (`:16`)                 | none                                                                      |
| swan-love      | `router.js`     | ESM  | none                                     | `argv.includes('--dev')` (`:10`)                 | none                                                                      |

The command lines under 2.18, **with the script unchanged**. The chained steps stay in the npm
script around them. `check` lines are the ones the sites already have.

| Site           | Build                                                                | Dev                               | Check                                              |
| -------------- | -------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| a1k9training   | `kiss-ssg build`                                                     | `kiss-ssg dev router.js dev`      | `kiss-ssg check router.js --summary`               |
| oxford-medical | `kiss-ssg build && pagefind && …`                                    | `kiss-ssg dev router.js --dev`    | `kiss-ssg check router.js`                         |
| diploma-msc    | `npm run get-data && kiss-ssg build router.js production`            | `kiss-ssg dev`                    | `kiss-ssg check router.js production --summary`    |
| learna-kiss    | `npm run get-data && kiss-ssg build router.js production`            | `kiss-ssg dev`                    | `kiss-ssg check router.js production --summary`    |
| medulla        | `node get-data-orchard && kiss-ssg build router.js production`       | `kiss-ssg dev`                    | `kiss-ssg check router.js production --summary`    |
| metacarpus     | `kiss-ssg build new-cohort.js 2026-sept`; `kiss-ssg build export.js` | `kiss-ssg dev new-cohort.js test` | `kiss-ssg check new-cohort.js 2026-sept --summary` |
| pro-plumbing   | `kiss-ssg build`                                                     | `kiss-ssg dev router.js dev`      | `kiss-ssg check router.js --summary`               |
| k9-solutions   | `kiss-ssg build`                                                     | `kiss-ssg dev router.js --dev`    | `kiss-ssg check router.js --summary`               |
| swan-love      | `kiss-ssg build`                                                     | `kiss-ssg dev router.js --dev`    | `kiss-ssg check router.js`                         |

Five things in those scripts shape the design. All are [M].

1. **No argument means dev on three sites.** diploma-msc and learna-kiss resolve the instance as
   `args[0] || "dev"` (`config/instance.js`), medulla likewise. `kiss-ssg build router.js` with no
   instance therefore meets a script that says `dev: true`.
2. **Sites derive other config from their own `dev`, before `new Kiss`.** k9-solutions and
   swan-love choose the build folder from it (`./.kiss-dev` against `./public` and `./docs`;
   `router.js:44`, `:71`). pro-plumbing chooses `cleanBuild` (`:45`). learna-kiss takes a dev lock
   (`router.js:29`). The engine cannot see any of these.
3. **learna-kiss reads `KISS_CHECK` itself** (`router.js:27`, `build/report.js:16`), to skip its
   dev lock and its deploy summary under a check.
4. **diploma-msc and learna-kiss keep the page table in `pages/`**, required by `router.js`
   (`router.js:14`). Editing a page registration does not touch `router.js`.
5. **metacarpus prompts on stdin** when run with no argument (`new-cohort.js:33-44`), and calls
   `complete()` from inside its `generate()` callback (`:136-137`).

`learna-kiss/build/watch-polling.js` patches `chokidar.watch` before `new Kiss`. It is a helper,
not an entry, and runs in the child as it does now.

## 4. Decisions

### 4.1 Spawn, not import

**Chosen.** Every command that runs a site's script starts it as a child process:
`node --import <preload> <script> [args…]`, with the caller's cwd and stdin. One function in a new
`lib/run-script.js` does it for `build`, `dev`, `check`, `aikb` and `images`, with `spawn`, not
`spawnSync`, because dev needs to stop and replace the child and to talk to it.

Why:

- The script is a program, not a config module. It reads `process.argv.slice(2)` (every fleet
  entry), calls `process.exit()` (`examples/7-versioned-outputs/router.js:38`, `:84`;
  `learna-kiss/router.js:33`; `metacarpus/new-cohort.js:21`), prompts on stdin (metacarpus) and,
  in medulla, has a top-level `return` (`router.js:18`). As the child's main module each of these
  means what it means today. [M]
- Restart needs a fresh module graph. Node cannot evict an ESM module (nodejs/modules#307;
  nodejs/node#61767 is open). [M, by the research note's search]
- `check`, `aikb` and `images` already spawn. One mechanism for all five is less code than two.

**The child is exactly `node <script> [args…]` plus one `--import`.** Measured with a probe
preload: `process.argv.slice(2)` is unchanged for an ESM and a CommonJS entry, an extensionless
`node entry` resolves, `require.main === module` holds in CommonJS, and a top-level `return`
still works. [M, Node 24, re-run by critic]

**Rejected: import the script in-process.** The command would have to rewrite `process.argv`,
survive the script's `process.exit()`, resolve `node router` (no extension) itself, and could
never reload an ESM script. **Rejected: a worker thread per run.** It reloads modules, but
`process.chdir`, stdin and the pipeline's signal handlers are the main thread's, and nobody has
shown it working for this.

**Cost if wrong.** One extra Node start per build (not measured; the build itself is seconds to
minutes on every exit site, baselines table). A dev restart re-runs the whole build, pipeline
included. If a later phase gives the script a declarative form, the spawn stays correct and merely
becomes unnecessary.

### 4.2 The mode reaches the engine through a preload, not the environment

**Chosen.** The command writes its request into the `--import` URL:

```
node --import "file:///…/kiss-ssg/lib/run-preload.js?run=<encoded JSON>" router.js production
```

`lib/run-preload.js` runs before the script. It decodes the request and stores it at
`globalThis[Symbol.for('kiss-ssg.run')]`. The engine reads it once per instance, in the
constructor, where it reads `KISS_CHECK` today (`lib/kiss.js:777`), through one function,
`currentRun()` in a new `lib/run-state.js`. The request is:

```
{ mode: 'build' | 'dev' | 'check', aikb?: true, report?: <file>, images?: <file>,
  imagesRefresh?: true, restart?: true, owner: <the command's pid> }
```

- A global symbol, because the command and the engine the script imports can be two copies of
  kiss-ssg (`npx kiss-ssg@latest` against the site's `node_modules`; `describeEngine` exists for
  this, `lib/check.js:148`). A module variable would be set in one copy and read in the other.
- It has to be synchronous. The mode is needed before `_setupFolders()` empties a folder
  (`lib/kiss.js:799`), and an IPC message cannot arrive before the script's first line runs.
- The preload does nothing unless it is the command's direct child on the main thread
  (`process.ppid === owner`, `isMainThread`). `fork()` and `new Worker` inherit `execArgv`, so a
  script's own fork would otherwise take the mode too [I]. That `ppid` equals the owner in a
  direct child on Windows is [M, Node 24, by critic].
- Measured: a query on the `--import` file URL arrives in `import.meta.url` with its values
  intact (spaces, non-ASCII and encoded JSON included), and a global set there is visible to an
  ESM and a CommonJS entry. [M, Node 24, re-run by critic]

**The reply stays a file.** `report` names the JSON Lines file each settled build appends to, as
`KISS_REPORT` does now (`lib/build-finish.js:85`). It survives a script that calls
`process.exit()`, which an IPC reply would not.

**`KISS_CHECK`, `KISS_AIKB`, `KISS_REPORT`, `KISS_IMAGES`, `KISS_IMAGES_REFRESH` are aliases.**
`currentRun()` returns the preload's request when there is one, and otherwise builds the same
shape from the environment, by today's rule (`CHECK_MODE_OFF`, `lib/check.js:17`). The four
readers in § 2 call `currentRun()` and nothing else reads process state. `KISS_BUILD`,
`KISS_ASSETS` and `KISS_DEV` are a different contract, the engine telling a pipeline step where it
is (`lib/kiss.js:1067-1069`; medulla reads `KISS_BUILD`). They are not aliases and do not change.

**Two copies, two versions.** An engine older than 2.18 ignores the global. Under `check` it would
then run a real build over the published folder, the one thing `check` promises not to do. So:

- `check`, `aikb` and `images` **also export the alias variables** to the child through 2.x. An
  old engine keeps working (`npx kiss-ssg@latest check` is the upgrade ritual), and so does
  learna-kiss's own read of `KISS_CHECK`.
- `build` and `dev` export none, remove exactly those five names from the child's environment if
  the caller's shell had them (`KISS_BUILD`, `KISS_ASSETS` and `KISS_DEV` are untouched), and
  **refuse an engine that
  cannot read the request** before spawning. The test is a capability, not a version: whether the
  folder `describeEngine` finds (`bin/kiss-ssg.js:549-556`) holds `lib/run-preload.js`. A version
  test would refuse this branch's own tarball, which stays 2.17.1 until the close bumps it and
  is what the pack gate, the fleet check and the clean room install. When no
  `node_modules/kiss-ssg` is found the run goes ahead, as `check` does today.

**A public reader: `Kiss.mode`.** A static getter returning `'build'`, `'dev'`, `'check'`, or
`null` when no command and no alias set one. Sites need the mode before `new Kiss` (§ 3, point 2),
and learna-kiss needs a replacement for `process.env.KISS_CHECK` before 3.0 removes it. After
construction the answer is `kiss.config.dev`, as now. This is one getter over `currentRun()`. It
is put to the operator in § 9 because the freeze admits nothing outside Phase 2's list, and this
is arguably the public half of "the mode is passed directly".

**Rejected: an argument to the script.** a1k9training treats any argument as dev
(`router.js:13`). **Rejected: IPC for the mode.** Not synchronous. **Rejected: one
command-owned variable (`KISS_RUN`).** It works, and it is what the criterion rules out.

**Cost if wrong.** If `--import` with a query fails on 22.23.4, the fallback is a `data:` URL
preload carrying the same JSON; the engine side does not change. Slice 1's first verify step is
this probe on the floor.

### 4.3 Whose `dev` wins

The engine applies the command's mode over the resolved config, where check mode does it today
(`lib/kiss.js:782-785`):

| The command             | The script's `dev` | Result                                                                 |
| ----------------------- | ------------------ | ---------------------------------------------------------------------- |
| any                     | not given          | The mode decides. This is the shape the starter and the examples take. |
| `build`                 | `true`             | **Refused.** The constructor throws before any folder is touched.      |
| `check`                 | `true`             | As today: forced off, silently. A check publishes nothing.             |
| `dev`                   | `true`             | Agreement.                                                             |
| `build`                 | `false`            | Agreement.                                                             |
| `dev`                   | `false`            | **Refused**, the same way.                                             |
| none (`node router.js`) | anything           | The script decides, as today.                                          |

"Given" is read from the constructor's own argument, as `_helpersExplicit` already is
(`lib/kiss.js:721`).

An explicit `dev` that contradicts `build` or `dev` is two statements by the author that disagree,
and the script's `dev` usually decided more than that key. The engine cannot see what, so it does
not guess in either direction:

- **`dev` over `false`.** On k9-solutions and swan-love the same variable chose `./public` and
  `./docs`, so a dev build would land in the folder that is deployed.
- **`build` over `true`.** On diploma-msc, learna-kiss and medulla no argument means the `dev`
  instance, so `kiss-ssg build router.js` would build the dev instance's config (a localhost
  backbone) into `./public` and exit 0. Run as `node router` today, that command line starts a
  server and never returns; forced off, it would return 0 and let `&& firebase deploy` ship it.
  No build line in § 3 omits the instance, so nothing there needs the override. A notice would
  scroll past, so this is exit 1.

```
kiss-ssg dev: router.js passes dev: false, so no dev server was started over it.
Keep the script's own flag and pass it (kiss-ssg dev router.js --dev), or remove the `dev` key
and, in the same edit, move anything else the script chose from that flag to Kiss.mode.
```

```
kiss-ssg build: router.js passes dev: true, so nothing was built.
Pass the arguments that make it a build (kiss-ssg build router.js production), or run kiss-ssg dev.
```

**So a site that still parses its own flag keeps passing it.** Positional arguments pass through
for good, which is why the dev column in § 3 reads `kiss-ssg dev router.js dev` and
`kiss-ssg dev router.js --dev`. Nothing breaks, and nothing is silently overridden.

**Dropping the `dev` key alone is unsafe where the flag chose something else.** k9-solutions and
swan-love would then serve a dev build from `./public` and `./docs`. The edit is one change:
`const dev = Kiss.mode === 'dev'`, with the folder choice left reading it. The upgrade note says
this, which is why § 9.3 (`Kiss.mode`) and this section stand or fall together.

**Rejected: the mode always wins.** Simpler to state. It writes a dev build into two sites'
deploy folders, and lets a dev-instance build reach a deploy on three more.

**Cost if wrong.** A refusal costs one message and one edit. The other choice costs a deploy.

### 4.4 The script, when none is named

**Chosen.** The first positional argument is always the script. With no positional argument the
script is `router.js` in the cwd. This holds for `build`, `dev`, `check`, `aikb` and `images`.

- `router.js` is the name the starter, all 15 examples and eight of the nine fleet sites use [M],
  and the one `llms.txt` and `kiss-site-new` tell an agent to use.
- A site with arguments names its script: `kiss-ssg build router.js production`.
  `kiss-ssg build production` is an error before anything runs: "no script named production
  (looked for production, production.js, .mjs, .cjs). The script comes first:
  `kiss-ssg build router.js production`". The lookup is `resolveEntry` (`lib/watcher.js:68`),
  which already resolves a script the way Node does.
- **Telling an option from the script.** Read left to right. A word starting with `-` before the
  script is the command's option, and an unknown one is a usage error, as now
  (`lib/check.js:267-293`). The first word not starting with `-`, or any word straight after a
  bare `--`, is the script (as now, `lib/check.js:294-295`). With neither, the script is
  `router.js`. So `kiss-ssg check --summary` checks `router.js`, and `kiss-ssg build --atomic` is
  a usage error that says to name the script: `kiss-ssg build router.js --atomic`.
- **Each command's own options:** `check` and `aikb` take `--summary`, `--subjects` and
  `--against <file>`; `images` takes `--write` and `--refresh`; `build` and `dev` take only
  `--help`.
- **After the script** everything is the script's, except the words today's parsers keep up to a
  `--`: `--summary` for `check` and `aikb` (`lib/check.js:296-306`), `--write` and `--refresh`
  for `images` (`lib/images-sweep.js:153-164`). `build` and `dev` keep none.

**Rejected: "the first argument is the script if a file of that name exists, else an argument".**
A mistyped script name would silently become an argument to `router.js`.

**Cost if wrong.** A site whose script is not `router.js` types its name, as it does today.

### 4.5 A build that exits without `complete()`

**Chosen: the engine notices, in both run shapes, with one hook.** `lib/run-state.js` keeps two
sets, on the process-wide state of § 4.6, not in the module. **Live** holds every instance from construction until `close()`; the dev stop in § 5.4
closes these. **Unsettled** holds each non-dev instance from construction until its build settles
(a `complete()` that resolved or rejected) or `close()` is called. The first unsettled instance
arms one `process.on('beforeExit')` listener. When the event loop empties with an instance still
unsettled, the listener takes each one **out of the set first** (awaiting `close()` re-arms the
loop, and `beforeExit` fires again when it drains), then:

1. logs, through that instance's logger:

   ```
   kiss-ssg: ./public was built without complete(), so nothing was settled: no redirects, cache
   headers, link check, audit or report, and 1 page failure went unreported.
   Add `await kiss.complete()` as the script's last statement. Exiting with code 1.
   ```

2. sets `process.exitCode = 1`;
3. awaits `close()`, which removes a staging folder nothing promoted (`lib/kiss.js:2104-2107`),
   the litter measured in § 2.

Measured with a probe: `beforeExit` fires on a natural exit of an ESM and a CommonJS entry
(including a top-level `return`), and an exit code set there is the code the process ends with.
It does not fire after `process.exit()`. [M, Node 24]

**Why `beforeExit` and not `exit`.** A library that sets the exit code of whatever process loaded
it is a hazard: 50 test files construct `Kiss`, four of them with no `complete()` at all
[M, `grep -rl 'new Kiss' test --include=*.test.js`, re-measured after the critique]. `beforeExit`
fires only when the event loop drains by itself, and a listener inside a vitest test never fires,
in the forks pool or the threads pool [M, Node 24, by critic]. Slice 1 pins it: `npm test` keeps
its exit code and prints the warning nowhere.
A process that does exit naturally is where it fires, so the scripts this repo spawns were
checked: `scripts/bench.mjs` (`:470`, `:496`), `docs.js` (`:86`) and the two fixture scripts that
build (`test/fixtures/consumer/site.js`, `test/fixtures/legal-weak-site/router.js`) each await
`complete()` [M, grep].
The predicate is "never settled, never closed, not dev", not "never called": a `complete()` cut
short by an exit verified nothing either.

**Under the command there is a second net**, the one `check` has today: a run that exits 0 with no
report line fails with one line from the command ("the script exited without settling a build").
It catches a script that calls `process.exit()` itself, and an old engine. When the child already
exited non-zero the command adds nothing, because the child has said why.

**Rejected: the command alone detects it.** `node router.js` would stay silent, and the roadmap
names that case. **Rejected: `process.on('exit')`.** It also catches `process.exit()`, and it
fires inside every embedding process.

**Cost if wrong.** If `beforeExit` fires in some embedding process after all, the hook is armed
only when the preload is present and `node router.js` loses the warning. That would fail the
criterion, so the suite pins it.

### 4.6 One state for the process, whichever copy runs

The preload is the command's copy of kiss-ssg (the `--import` URL names it). The engine is the
copy the script imports. They can be two folders, and a module's variables are per copy: the same
file imported under two URLs has separate state [M, Codex's probe; it is also why § 4.2 uses a
global for the request]. A live set kept in `lib/run-state.js`'s module scope would be empty in
the preload, and a stop sent there would close nothing.

**Chosen.** Everything the two sides share is one object at
`globalThis[Symbol.for('kiss-ssg.run')]`, made by whichever copy touches it first:

```
{ v: 1, request: <§ 4.2's request> | null, live: Set, unsettled: Set,
  armed: { beforeExit: false, uncaught: false, channel: false } }
```

`lib/run-state.js` exports functions over that object and holds no state of its own. A copy that
finds a `v` it does not know throws from the constructor, naming both versions: two copies that
disagree about the shape must not half-work.

Who arms what, so each fires once:

| Listener                         | Armed by                                                    | Guard              |
| -------------------------------- | ----------------------------------------------------------- | ------------------ |
| `beforeExit` (§ 4.5)             | The engine copy that registers the first unsettled instance | `armed.beforeExit` |
| `uncaughtException` (§ 5.4)      | The preload only. Without a preload nobody arms it          | `armed.uncaught`   |
| IPC `stop`, `disconnect` (§ 5.4) | The preload only, in `dev`                                  | `armed.channel`    |

Each listener reads the shared sets, so it reaches instances made by any copy, and touches them
only through what every copy has: `close()`, `logger`, `config`. The build-failure mark is already
a `Symbol.for` (§ 5.4), so the preload recognises an error another copy threw.

**Rejected: instances register stop callbacks with the preload.** It needs the same global to find
the preload, and leaves the exit check with a second registry under `node router.js`, where there
is no preload.

**Cost if wrong.** A shape change needs `v: 2` and a refusal across copies, which the engine gate
(§ 4.2) should then also test before spawning.

## 5. Behaviour

### 5.1 `kiss-ssg build`

1. Parse (§ 4.4). Resolve the script; print the engine line `check` prints; apply the engine gate.
2. Spawn with stdio inherited, the request `{ mode: 'build', report }`, and no `KISS_*` aliases.
3. On exit, read the reports. For each `Kiss` instance print one verdict line on stderr, in
   `formatReport`'s wording (`lib/build-report.js:681-683`), and under a failed one, one line per
   failure that **names the page and nothing else**: its build path, or its pseudo-view
   (`<pipeline>`). The message is not repeated, and nor are broken links or audit findings: the
   engine logged all three (`lib/kiss-page.js:477`, `lib/build-finish.js:340-357`).
4. Exit with `exitCodeFor(reports, status)` (`lib/check.js:708`): 1 if any build failed, if the
   script exited non-zero or by signal, or if it settled nothing. The command sets
   `process.exitCode` and lets the process end.

`check`, `aikb` and `images` keep their exit rule and their report. They change in how the child
is started, in exporting the request as well as the aliases, in taking the default script, and in
one line of output: a script with no `complete()` is now reported by the engine in the child
(§ 4.5), which exits 1, so the command's own "no build report was written" line
(`bin/kiss-ssg.js:611-614`) is printed only when the child exited 0. The assertion at
`test/integration/check.test.js:423` moves to the engine's wording.

### 5.2 Printing a failure once

Measured today, one failing page under the starter's reporter: its message is printed three times
on stderr (`lib/kiss-page.js:476-477` when it happens; the reporter's line; and the rejection's
message names the page), plus one "broken link" line per page linking to it. [M, § 6 case b]

Under `kiss-ssg build`, with a script that has no reporter, **each failure's message is printed
once**:

- **By the engine, when it happens** (`lib/kiss-page.js:477`). Unchanged, in dev and under
  `node router.js` too.
- **The command's verdict names the failed page and does not repeat the message** (§ 5.1). It is
  the list of what failed at the end of a long log; the message is above it.
- Nothing else prints it: the script has no reporter, and the preload keeps Node from dumping the
  rejection (§ 5.4).
- **No "broken link" line names a page that failed** (§ 6, b).

```
Error processing view menu.hbs
link: no page with id "no-such-page" (asked by menu.hbs / /menu.html)
FAIL ./public (build) — 4 pages, 1 failed, 0 assets, 71ms
  ./public/menu.html
```

**`check` and `aikb` do not change.** `--summary` prints `formatReport` on stdout, message
included (`lib/build-report.js:695`), and the JSON carries it. Stdout there is the report: it is
read, piped and diffed without the build log, so it has to be whole by itself. "Once" is kept per
stream: stderr carries each message once (the engine's), stdout is the report. § 9.4 puts that
reading to the operator.

A site that keeps its own reporter prints its lines as well, until it deletes them. The upgrade
note says so.

**Nested paths print the cause twice today, and each gets one owner.** Read on `acc73dd` [M]:

| Path       | Inner site logs, then throws                                                                              | Outer site logs again                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Page write | `lib/kiss-page.js:444-446`: `Error creating <path>` and the error                                         | `:476-477`: `Error processing view` and the message                   |
| View read  | `lib/kiss-page.js:502-503`: `Error reading view: <path>` and the message; throws a wrapper with the cause | `:476-477`, with the wrapper's message                                |
| URL model  | `lib/model-resolver.js:53-54`: `Error getting model from <url>`; throws a wrapper carrying `.error`       | `lib/page-registry.js:647-648`: the message, then `error.error` again |
| Model file | `lib/model-resolver.js:17-20`: `Can not find model on file system`; `:60` throws `Model not found`        | `lib/page-registry.js:647`                                            |
| Controller | `lib/controller-resolver.js:31-32`, `:39-41` (logs the error at `warn`), `:56-57`, `:121-122`             | `lib/page-registry.js:647`                                            |

Not in the class: a `.pages()` item (`lib/page-registry.js:481` logs the item and no cause until
the owner does); the debug sibling (`lib/kiss-page.js:471-472`, logged, not thrown, not a
failure); a compile error (`:522-523`, logged, returns `null`); the asset copy and Sass
(`lib/assets.js:168-170`, `:197-199`, `:581-582`), which log context and cause once and return a
result. `lib/asset-copy.js` has no `logger.error`.

**The rule.** The site that records the failure owns the diagnostic: `lib/kiss-page.js:476-477`
for a render, `lib/page-registry.js:647` for a registration. An inner site that throws does not
log. It puts its context into the error it throws (`Error creating ./public/x.html: EACCES …`;
`Error getting model from <redacted url>: 404`; `Error in controller for menu.hbs: …`), with the
original as `cause`. The owner logs that one message. `lib/page-registry.js:648`'s second line
goes; the stack stays available at `debug`. Redaction is unchanged: the context is built with
the same `redactUrl` the inner log uses now.

### 5.3 `kiss-ssg dev`

The command is a supervisor. It owns what must outlive a restart. The child owns the build.

| Owner       | What                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The command | The HTTP server and the livereload server (port 35729 by default), through `startDevServer`; the watch on the script; the child's life |
| The child   | The build, the watch on `folders.src`, assets and helpers, the rebuild queue, the pipeline's `watch` processes                         |

**Start.** The command spawns the child with stdio inherited and an IPC channel, and the request
`{ mode: 'dev' }`. In the child, where the constructor would call `startDevServer`
(`lib/kiss.js:875-883`), it takes a handle of the same shape (`ready`, `refresh`, `close`) that
talks to the command instead: it sends `{ serve: { root, port, host, livereloadPort } }` from the
resolved config, `ready` settles on the command's answer (a bind failure rejects it and becomes
the `<dev server>` failure it is today, `lib/kiss.js:864-873`), and `refresh(path)` sends
`{ reload: path }`. Its `close()` resolves at once and sends nothing: both callers
(`devServerFailed`, `lib/kiss.js:864-873`, and `close()`, `:2092`) run on a restart or a stop, and
neither may take down servers the command is keeping. Only the command closes them, on its own
exit or when the `serve` values change. The handle lives in `lib/dev-server.js` beside the server
it stands in for. The engine does not watch the script in this mode (`watch({ entry: null })`);
the command does. Run as `node router.js dev`, the engine starts its own server exactly as now.

**The child must still be able to exit.** A process with an IPC `message` listener never drains
its event loop, so it would neither exit nor reach `beforeExit` [M, Node 24, by the main session:
a fork with the listener was alive after 3 s; with `process.channel.unref()` it exited 0 and
`beforeExit` fired]. The preload unrefs the channel after wiring its listeners. The child then
lives exactly as long as something of its own does (a watcher, a pipeline process), and exits by
itself when the port is in use (`devServerFailed` closes the instance) or when the script returns
before `new Kiss` (metacarpus refusing a past intake, `new-cohort.js:54-57`).

**An edit to the script.** The command watches the resolved script file with chokidar and the
write-settle the engine uses (`lib/watcher.js:42-44`). On a change it stops the child (below),
then starts a new one with `restart: true`. One restart runs at a time; edits during it collapse
into one more. The watch has an `'error'` listener that logs and keeps the session up, as the
engine's has (`lib/watcher.js:136-138`); an unheard `'error'` would end the command.

- With `restart: true` the constructor **does not empty the build folder**
  (`lib/kiss.js:928-934`). Without this, the commonest broken edit (a `TypeError` in the page
  table, after `new Kiss`) would wipe it. The cost: output of a page the edit removed stays in
  the dev folder until the next `kiss-ssg dev` or `kiss-ssg build`. That goes in
  `AIKB/rebuild.md`'s Known knowns.
- If the new child asks for the same `serve` values, the servers are untouched. If the edit
  changed the port or the folder, the command closes them, starts new ones and says so.

**What "the last good build" means here, exactly.** A restarted child builds in place, and each
page overwrites its file as it renders (`lib/kiss-page.js:427`). So:

| The edited script…                           | The served folder                                                                                                               | Reload |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| fails to load, or throws before pages render | Untouched: the last build, whole                                                                                                | No     |
| runs, and every page renders                 | The new build                                                                                                                   | Once   |
| runs, and some pages fail                    | **Mixed**: new files for the pages that rendered, the previous file for each page that failed (a render fails before its write) | No     |

The third row is not the last good build, and this design does not make it one. It makes it
quiet: the first-build reload at `lib/kiss.js:888-892` is `_settle(false).then(() =>
this._reload())` and does not look at failures; under the command it fires **only when the first
build recorded none**. The browser keeps the page it had, the terminal lists the failures, and the
child stays alive, so the next source change that fixes the page rebuilds and reloads as any dev
rebuild does (`lib/rebuild.js:386`).

**Rejected for 2.18: build each restart into its own folder and switch on success** (Codex's
fix), by reusing `cleanBuild: 'atomic'`. The staging and promotion exist, and after a promotion
the instance builds in place (`lib/staging.js:380-387`), which is the shape wanted. But dev
degrades `'atomic'` to a wipe in place (`lib/kiss.js:775-776`, `:903-907`) for reasons that would
all have to be undone: promotion is one-shot and happens only in `complete()`
(`lib/staging.js:362-365`), never on the constructor's own first settle; and a staged build that
fails has no way back to building in place, so later rebuilds write into a staging folder nothing
promotes (`AIKB/rebuild.md:65`, recorded as unsupported). Either the child exits after a failed
first build, and then a fix in `src/` cannot revive it (only a script edit restarts), or the
failed instance is re-pointed at the real folder, which is new lifecycle code in the three-way
branch of `complete()` that Phase 3 is about to rewrite. A folder rename under a live static
server on Windows is also unmeasured. § 9.8 puts the choice to the operator.

**What the browser sees.** Its page and its livereload socket are the command's, so neither drops.
During a restart the files on disk are served. When the new child's first build settles with no
failure it sends one reload and the browser reloads once. After a script that failed to run,
nothing reloads, and the terminal shows the child's error and then one line from the command:

```
kiss-ssg dev: router.js exited (code 1). Still serving ./public at http://127.0.0.1:3001.
Waiting for the next change to router.js.
```

The error is shown in the terminal only. No browser overlay is added. If the first run fails
before any instance asked to serve, nothing is served yet and the command waits the same way.

**After the child has exited, only an edit to the script starts another.** The command watches
nothing else, and the line above says so. A child that is alive with failing pages is a different
case: it rebuilds on every source change, as now. Restarting a dead child on any source change
would need a second watcher on `folders.src` in the command; not recommended for 2.18.

**Restart covers the script file only.** A module the script imports (`pages/*.js` on diploma-msc
and learna-kiss) does not restart the session, and is no worse than today, when nothing watches
those files [I: the watcher takes `folders.src`, the helpers folder and the entry,
`lib/watcher.js:86-134`, read in part]. § 9 puts the alternative to the operator.

**More than one `Kiss` in a dev script.** The command keeps one server per host and port. A second
instance asking for a port already serving a different folder fails as a second bind fails today.
`examples/7-versioned-outputs` passes `dev: false` twice, so `kiss-ssg dev` refuses it by § 4.3,
which matches its docs: it has no preview today either (CLAUDE.md, Commands).

### 5.4 Stopping, and a rejection nobody caught

None of this subsection could be measured, because no watcher or server may be started here. It is
[I] throughout, and Slice 3 measures it on both systems (CI runs Windows).

**The stop sequence**, used for a restart and for the command's own SIGINT or SIGTERM:

1. Send `{ stop: true }` over IPC. The preload's listener calls `close()` on every instance in
   the shared live set (§ 4.6), whichever copy made it, then exits 0. `close()` ends the pipeline's watch processes by process group, or by
   `taskkill /T /F` on Windows, with a 2 s grace (`lib/pipeline.js:240-258`).
2. Wait 5 s for the child to exit.
3. Then kill the tree: `taskkill /pid <child> /T /F` on Windows, `SIGKILL` on POSIX. On POSIX the
   pipeline's watch processes are in their own groups (`lib/pipeline.js:107`), so a forced kill
   can orphan them. Recorded in Known knowns, not chased.

| Event                          | What happens                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ctrl-C in a terminal           | The console sends it to the command, the child and (Windows) the watch tools. The command runs the stop sequence, which is a no-op for whatever has already gone, closes its servers, and exits 0 for `dev`. `build` and `check` exit 1: an interrupted build must not let `&& firebase deploy` run |
| Restart                        | The stop sequence, then a new child                                                                                                                                                                                                                                                                 |
| The child crashes              | The command reports it (§ 5.3) and keeps serving. A new guard in `lib/pipeline.js` ends its watch processes on the child's `exit` event, where today only SIGINT and SIGTERM do (`:270-279`)                                                                                                        |
| The command is killed outright | The child sees the IPC channel close, closes its instances and exits. Dev only; a `build` child finishes its build, as a `check` child does today                                                                                                                                                   |

**A rejection nobody caught.** The starter no longer catches `complete()`. Measured: a rejected
top-level `await` in ESM, and an unhandled rejection in CommonJS, each reach
`process.on('uncaughtException')` with origin `unhandledRejection` when that is the only listener
installed, and the listener keeps Node from printing the dump. [M, Node 24, re-run by critic] So the
preload, which runs only in a process the command owns, installs that listener:

- a kiss build failure (the engine marks the error with `Symbol.for('kiss-ssg.buildFailure')`) is
  swallowed: the engine logged it and the command prints the verdict. In `build` it sets
  `process.exitCode = 1`. In `dev` the child keeps serving.
- anything else is printed with its stack, and the child exits 1.

Eleventy's CLI routes both events to its own handler the same way (research note, § 4). Under
`node router.js` there is no preload and no listener: Node prints the rejection and exits 1.
Loud, correct, not pretty. The engine installs no process-wide handler by itself.

### 5.5 The two unusual scripts

**`examples/7-versioned-outputs/router.js`: two `Kiss` objects, one after the other.** The request
applies to every instance in the process, as `KISS_CHECK` does (one report line per instance,
`lib/check.js:49-50`). `kiss-ssg build router.js 2026-spring` prints two verdict lines and exits 1
if either failed. Lines 74-84 (catch, print, `process.exit()`) become `await kiss.complete()`: the
rejection ends the script there, so the index is still never built over a failed season. The
exit hook sees one settled instance and no second one.

**`examples/5-helpers/router.js`: `complete(callback)` on a dev branch and a build branch.** The
branches exist because only the build branch may catch and set the exit code. Under the command
neither does, so lines 86-98 become one statement, `await kiss.complete(() => { … })`, for both
modes. The callback contract does not change.

Every other read of an example's own `dev`, swept across all fifteen [M, grep]: `if (dev)
this.viewStats()` in `2-page:99`, `3-pages:80`, `9-migrated-from-v1:244`, `10-asset-pipeline:125`
and `11-blog:237` becomes `if (this.config.dev)`; `5-helpers:88` is the branch above;
`7-versioned-outputs:63` and `:112` pass `dev: false` and keep it, as a build-only script. `--atomic` (example 8) and `--broken` (example 11) are the
examples' own arguments and pass through.

## 6. The four messages

Reproduced on `acc73dd` with a scratch site outside the repo: a `router.js` carrying the starter's
`reportBuildFailure` verbatim, importing `lib/kiss.js` by file URL, `audit: false`, default
`cleanBuild` unless `--atomic`. Each case is `node router.js <case>` with `NO_COLOR=1`.

**(a) An unknown `{{link}}` id suggests the nearest.** Reproduced. `index.hbs` holds
`{{link "abuot"}}`; a page `about` exists.

```
link: no page with id "abuot" (asked by index.hbs / /)
```

Printed from `lib/handlebars-helpers.js:435-436`. Fix: the helper is handed the registry's ids
beside `lookupPage`, and the message names up to three within a small edit distance:
`link: no page with id "abuot". Did you mean "about"? (asked by …)`. With none close it says how
many ids the build has and that `kiss-ssg check` lists them. The same text is the dev warning.
The second `lookupPage` caller (`:665`) is swept for the same message.

**(b) A failed page is reported once.** Confirmed. `menu.hbs` fails; three pages link to it.

```
broken link: ./public-b/about.html -> /menu.html
broken link: ./public-b/contact.html -> /menu.html
broken link: ./public-b/index.html -> /menu.html
```

on stdout, from `lib/build-finish.js:355-357`, while the cause is on stderr. `kiss-ssg check
router.js b --summary` repeats the three lines under the failure, from the report. Case (a) shows
it too: `broken link: ./public-a/about.html -> /`. Fix: `checkLinks` (`lib/links.js:539-590`) is
told which output paths belong to pages that failed, and a reference resolving to one is not
added to `broken`. The log line says how many were left out. The report gains no field.

**(c) Failures name the build path.** Reproduced, with `--atomic`:

```
1 build failure: ./public-b/menu.html
  ./public-b.kiss-staging-8840-pnehnn/menu.html: link: no page with id "no-such-page" (…)
```

The first line is the engine's and is right (`lib/kiss.js:1676-1682`). The second is printed by
the reporter (`starter/router.js:12-14`) from `err.failures[].buildTo`, which is the engine's
internal record (`lib/kiss.js:1196`, `:1687`). `check` forces `'atomic'`, so every site with that
reporter prints a staging path under `check` (measured on the same case). The report's own
failures are already mapped (`lib/build-report.js:347`, `:385`). Fix at the source: the rejection
carries copies whose `buildTo` went through `_reportedPath`. The staging folder is gone by then
(`lib/kiss.js:1663`), so the old value named nothing.

**(d) A missing model folder says when a same-named `.json` exists.** Reproduced.
`.pages({ view: 'bake.hbs', model: 'bakes' })` with `src-d/models/bakes.json` on disk:

```
Model folder empty or missing: bakes
```

thrown at `lib/model-resolver.js:64`, logged at `lib/page-registry.js:647`. Fix: when
`<models>/<name>.json` is a file, the message adds
`— ./src/models/bakes.json exists: write model: 'bakes.json' to read that file`. The mirror case
at `:60` (`'bakes.json'` missing, a folder `bakes/` present) gets the mirror hint.

## 7. Obligations in this repository

**New modules**, each with a `test/unit/` test, an `AIKB/` doc and a row in CLAUDE.md's table:

| Module                  | One responsibility                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `lib/run-state.js`      | The process-wide run state (§ 4.6): the request and its aliases, the live and unsettled sets, the exit check |
| `lib/run-preload.js`    | The child's first module: store the request, own an uncaught build failure                                   |
| `lib/run-script.js`     | The command's side: the spawn plan, the engine gate, starting and stopping the child, the verdict's exit     |
| `lib/dev-supervisor.js` | The dev session in the command: servers, the watch on the script, the restart queue                          |

**Changed:** `lib/kiss.js` (read the request; § 4.3; no empty on restart; the IPC handle; the
gated first reload; the failure copies; `Kiss.mode`), `lib/kiss-page.js`, `lib/page-registry.js`
and `lib/controller-resolver.js` (one owner per diagnostic, § 5.2), `lib/check.js` (`build` and `dev` in the parse and the help; the
default script), `lib/images-sweep.js` (default script), `lib/build-finish.js`, `lib/links.js`,
`lib/handlebars-helpers.js`, `lib/model-resolver.js`, `lib/build-report.js` (the verdict lines),
`lib/dev-server.js`, `lib/pipeline.js`, `lib/init.js` (`build: 'kiss-ssg build'`,
`dev: 'kiss-ssg dev'`). Each one's `AIKB/` doc changes in the same commit, with
`AIKB/rebuild.md` (Known knowns), `AIKB/testing.md` and `AIKB/upstream.md` (the ESM cache, with
nodejs/node#61767 and how to re-check it; how Node routes a rejected top-level `await`).

**`bin/kiss-ssg.js`** gains two thin wrappers and loses its two `spawnSync` calls to
`lib/run-script.js`. Every decision is in `lib/`. Each command is covered end to end in
`test/integration/`.

**Budgets** (`planning/budgets.json`; the gate fails on any growth):

- `failureBoilerplate` 15 → 0. The counter greps `function reportBuildFailure`
  (`scripts/budgets.mjs:70`) and so never counted example 4's inline copy; the criterion is
  checked by reading all sixteen scripts.
- `coreLines` grows: four modules and the engine's edits. An estimate, not a measurement: 600 to
  900 lines. `claudeMdBytes` grows by four table rows and three command lines. Both are
  re-recorded with `node scripts/budgets.mjs --record` in **their own commit that says why**.
- `llmsTxtChars` is 15,997 against a cap of 16,000 [M] and may not grow at all, so 3 characters
  are free. One new sentence on line 139 carries `build`, `dev`, the default script and
  `Kiss.mode`; a first draft of it measures 228 characters. Three cuts, each measured as one
  exact match in the file:
  - line 13, `.catch(reportBuildFailure)`: 26;
  - line 13, the words after "`kiss-ssg init` writes them" inside the brackets (the list of
    `CLAUDE.md`, `AGENTS.md` and the plugin settings): 55;
  - line 139, the clause listing the three audit findings a new site shows "until fixed": 97.

  That is 178, so 181 with the free 3. The sentence is cut to fit 181, or the work order names a
  fourth cut to the operator before writing. Without `Kiss.mode` it is about 60 shorter.

- `privateReach`, `anyAnnotations`, `testPrivateReach`: the new modules take what they need as
  arguments and the new tests read reports and output, so none should move. Checked per slice.

**Public API, same commit as the behaviour:** `GUIDE.md` (§ The build script, § Checking a build,
the watch section at `:1766`, the example at `:413`; a new `##` or `###` needs a page in
`src/models/guide.json` or a `LEFT_OUT` entry), the `llms.txt` lines above, `README.md`'s command
list, `npm run types` (`Kiss.mode`).

**Skills:** `kiss-site-new/SKILL.md:86` tells an agent to end with
`.catch(reportBuildFailure)`. It is rewritten, and `CONTRADICTIONS` in
`test/unit/skill-coverage.test.js` gains a row banning `complete\(\)\.catch\(reportBuildFailure\)`
and `node router\.js --dev` outside `CHANGELOG.md`. `kiss-performance`,
`kiss-site-review/browser-pass.md` and `kiss-build-check` are swept for `--dev` and
`npm run build` wording; the skill-coverage table gains rows for `kiss-ssg build` and
`kiss-ssg dev`. A skill that names the new commands says how to tell an older kiss-ssg
(`npx kiss-ssg build --help` answering `unknown command`).

**The starter and the examples:** all sixteen scripts lose the boilerplate.
`package.json`'s `eg1`…`eg15` become `cd examples/<n> && node ../../bin/kiss-ssg.js build router.js`,
with the script named so that `npm run eg8 -- --atomic` and `npm run eg11 -- --broken` still reach
it (§ 4.4). `npm run eg1 -- --dev` stops being the preview: it is
`node ../../bin/kiss-ssg.js dev` from the example's folder, and CLAUDE.md's Commands line says so.
`test/integration/examples.test.js` runs each example through the command as well as through
`node router.js` (`:53`).

**`scripts/fleet-check.mjs`:** a `--via command` option. The branch side then builds with
`node <branch bin> build <entry…>` where it now runs `node <entry…>` (`:514`). The base side stays
on `node`, because `main` has no `build`. So the exit run is three builds a site: base by `node`,
branch by `node`, branch by the command. The run also fails when the two sides' build exit codes
differ, and prints both: today `buildStatus` is returned (`:534`) and the verdict ignores it
(`:604`), and the exit code is what this phase changes.

**`CHANGELOG.md`, 2.18.0, `### Upgrading`:** nothing breaks a site whose script awaits
`complete()`; the new npm script lines per shape (§ 3's table, generalised); a script with no
`complete()` now exits 1; `err.failures[].buildTo` names the build folder; the two message
changes; `kiss-ssg dev` refuses `dev: false` and `kiss-ssg build` refuses `dev: true`; delete
`reportBuildFailure` when moving to the command; and a script that chose a folder or `cleanBuild`
from its own flag moves that choice to `Kiss.mode` in the same edit that drops the `dev` key
(§ 4.3).

**`CONTRIBUTING.md`:** read; none of its three checklists applies (no helper, config key or audit
check is added).

## 8. Tests and slices

### A test plan per criterion

Red-first means `node scripts/red-first.mjs <file>` exits 0 against the base and its line goes in
the pulse log.

| Criterion                   | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Red-first |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| The command runs the build  | `test/integration/run-build.test.js`: an ESM and a CommonJS fixture; positional arguments arrive as `process.argv.slice(2)`; exit 0 and one verdict; a failing page gives exit 1, its message exactly once in stderr, its path once in the verdict, no `AggregateError` text; the same count for a page that cannot be written and for a URL model that cannot be fetched (§ 5.2's table); default script; `build production` is a usage error; an engine with no preload is refused                                                                            | yes       |
| …and dev restarts           | `test/integration/run-dev.test.js`: the port answers; editing the script starts a new child and the port never stops answering; an edit that fails to load leaves every old file served and sends no reload; an edit that breaks one page of three sends no reload, keeps that page's old file, and reloads once a source fix rebuilds it; a child whose port is taken exits by itself; after the stop no child or watch process is left (Windows and POSIX)                                                                                                    | yes       |
| …and check                  | `test/integration/check.test.js`, extended: default script; `--summary` output unchanged; the no-`complete()` line (§ 5.1)                                                                                                                                                                                                                                                                                                                                                                                                                                      | no        |
| `node <script>` gets loud   | `test/integration/no-complete.test.js`: a script with no `complete()` exits 1 and prints the warning, ESM and CommonJS; staging folder removed; a script that awaits it is unchanged. `test/unit/run-state.test.js` for the predicate                                                                                                                                                                                                                                                                                                                           | yes       |
| …without breaking embedders | the suite's own exit code, and no warning text in `npm test`'s output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | no        |
| Mode passed directly        | `test/unit/run-state.test.js`: request only; alias only; both, the request wins. `test/integration/run-mode.test.js`: a child with the preload and no `KISS_*` is staged; a child with `KISS_CHECK=1` and no preload is staged; `KISS_REPORT` and `KISS_AIKB` likewise. `test/integration/two-copies.test.js`: the command from this repo, the engine from a second copy in the fixture's `node_modules`, no aliases: the check is staged, a no-`complete()` script warns exactly once, a failed build prints no dump, and (slice 3) a stop closes the instance | yes       |
| …and § 4.3                  | same file: each row of the table; the refusal touches no folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | yes       |
| Message (a)                 | `test/integration/link-helper.test.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | yes       |
| Message (b)                 | `test/integration/links.test.js` and `test/unit/links.test.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | yes       |
| Message (c)                 | `test/integration/atomic-build.test.js`: `err.failures[0].buildTo` under `'atomic'` and under check                                                                                                                                                                                                                                                                                                                                                                                                                                                             | yes       |
| Message (d)                 | `test/unit/model-resolver.test.js`, both directions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | yes       |
| No boilerplate ships        | the `budgets` gate at 0; `examples.test.js` through both run shapes; the sixteen scripts read                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | no        |
| Clean-room exit             | `scripts/arms.mjs`, the bakery brief, Sonnet, the branch's tarball                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | n/a       |
| Fleet exit                  | `fleet-check` with and without `--via command` on the six sites; `test/unit/fleet-check.test.js` for the option                                                                                                                                                                                                                                                                                                                                                                                                                                                 | n/a       |
| Docs and release            | `skill-coverage`, `aikb`, `changelog`, `plugin-manifests`, `types` tests; `node docs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | no        |

### Slices, in order

1. **The run request and `kiss-ssg build`.** `run-state`, `run-preload`, `run-script`; the four
   readers moved to `currentRun()`; § 4.3; § 4.5; `check`, `aikb` and `images` on the one runner;
   `Kiss.mode` if approved. First verify step, on Node 22.23.4 under `--import`: the § 4.2 and
   § 4.5 probes, and § 4.1's CommonJS claims (`require.main === module`, a top-level `return` as
   in medulla's `router.js:18`, an extensionless entry).
   **This is the first engine slice and gets the Codex review**, with the largest diff put to the
   operator first.
2. **The four messages.** Independent of slice 1; four small red-first changes.
3. **`kiss-ssg dev`.** The supervisor, the IPC handle, restart, the stop sequence, the pipeline's
   exit guard. Everything § 5.3 and § 5.4 mark [I] is measured here, on both systems.
4. **The starter, the examples, `init`.** Mechanical once 1 and 3 hold.
5. **`fleet-check --via command`, docs, skills, changelog, budgets re-record** (its own commit).
6. **Exit:** the clean room, the fleet three ways, the Codex close.

## 9. For the operator to decide

Each has a recommendation. The design above assumes it.

**Decided 2026-11-15 by the operator: all eight as recommended.** Decision 3 is paid for with
the three `llms.txt` cuts named in § 7, including line 139's list of audit findings. Decision 8
narrows the settled "keeps serving the last good build" to § 5.3's table, and the mixed folder is
recorded in `AIKB/rebuild.md`'s Known knowns.

1. **Do `kiss-ssg dev` and `kiss-ssg build` refuse a script whose explicit `dev` contradicts
   them?** Recommended: yes to both, exit 1 before any folder is touched (§ 4.3). If the mode
   wins, `dev` puts a dev build in k9-solutions' and swan-love's deploy folders, and `build` with
   no instance builds the dev instance of diploma-msc, learna-kiss and medulla and returns 0 to a
   deploy chain. `check` keeps forcing dev off, as today.
2. **Do `check`, `aikb` and `images` keep exporting the `KISS_*` variables through 2.x, and do
   `build` and `dev` refuse an engine that ships no preload?** Recommended: yes to both (§ 4.2).
3. **Is `Kiss.mode` added now?** Recommended: yes. Four fleet sites and this repo's `docs.js`
   branch on dev before `new Kiss`, and learna-kiss needs something to read other than
   `process.env.KISS_CHECK`. Without it those sites pass their own flag through indefinitely,
   and the upgrade advice in § 4.3 has nothing safe to point at. It costs `llms.txt` about 60
   characters it does not have (§ 7).
4. **Is "each failure once" met by § 5.2?** Under `build` the engine prints the message once and
   the verdict names only the page. `check --summary` and the JSON keep the message on stdout,
   because stdout there is the report and must be whole without the log. Recommended: yes. The
   alternative, dropping the message from `check --summary` too, changes an output contract the
   `kiss-build-check` skill and `--against` readers use.
5. **Does a dev restart cover only the script file?** Recommended for 2.18: yes, as the roadmap
   words it. It does little for diploma-msc and learna-kiss, whose page tables are in `pages/`.
   The next step would be restarting on any file the child loaded, which CommonJS can list
   (`require.cache`) and ESM cannot without a loader hook. The same answer covers a child that
   has exited: only a script edit starts another (§ 5.3).
6. **Is the default script `router.js`, with the script always the first positional?**
   Recommended: yes (§ 4.4).
7. **Does the command own the dev servers, with the child asking over IPC (§ 5.3)?** Recommended:
   yes. It is the largest unmeasured piece of this design, and it is what "keeps serving the last
   good build" costs: if the child owns the ports, a broken edit leaves nothing listening.
8. **Is the narrower "last good build" of § 5.3 enough for 2.18?** A script that fails to run
   leaves the build whole. A script that runs with some failing pages leaves a mixed folder, with
   no reload. Recommended: yes, and record it as a limit. Keeping the previous build whole in
   that case means staging a dev build and promoting it on success, which the engine marks
   unsupported today and which touches the part of `complete()` Phase 3 rewrites. This narrows a
   settled item, so it is the operator's call, not the design's.

## 10. Not measured, and not reproduced

- Anything in a running dev session: the IPC handle, restart, the browser across a restart, the
  stop sequence, tree kill on Windows, orphaned watch processes on POSIX, the pipeline's exit
  guard. The brief forbade starting a server or a watcher.
- Node 22.23.4. Every probe, the critic's and the main session's included, ran on Node 24.
- That `fork()` and `new Worker` carry the preload, and that the `ppid` check stops it there.
- The cost of one extra Node start, and every budget number after the change.
- That the new `llms.txt` sentence fits the 181 characters the three cuts free.
- The fleet's `complete()` counts were not re-run here; the starter's and the examples' were.
- All four messages reproduced. None was refuted.

### Revised after critique, 2026-11-15

A fresh-context read found no blocker, one major and thirteen minor points. What changed:

- **Major, "once".** The verdict under `build` names the failed page without its message, so the
  message is printed once (§ 5.1, § 5.2). `check` and `aikb` keep their output; § 9.4 rewritten.
- **§ 4.3.** `build` over an explicit `dev: true` is now refused, not forced off: the old reason
  for the override was unsupported, and a dev-instance build could reach a deploy. The advice to
  drop the `dev` key now moves the folder choice to `Kiss.mode` in the same edit. § 9.1 rewritten.
- **§ 5.3.** The child unrefs its IPC channel so it can exit; the handle's `close()` never closes
  the command's servers; the script watch has an `'error'` listener; a dead child restarts only
  on a script edit.
- **§ 4.5.** An instance leaves the unsettled set before `close()` is awaited. Counts corrected
  to 50 test files, four without `complete()`.
- **§ 4.4.** How an option is told from the script, and each command's own options, `images`
  included.
- **§ 4.2.** The five alias names are the only variables removed.
- **§ 7.** The `llms.txt` cuts are named and measured, with `Kiss.mode` budgeted; `fleet-check`
  fails on differing build exit codes.
- **§ 8.** Slice 1's floor probe covers § 4.1's CommonJS claims.
- Evidence the critic or the main session re-ran on Node 24 is marked so.

### Revised after Codex, 2026-11-15

Codex's design review found no blocker, three major and one minor point. The main session
re-derived all four against the code. What changed:

- **Major 1, the last good build (§ 5.3, § 9.8).** The claim was too wide: a restarted child
  overwrites pages as they render. § 5.3 now says what is kept in each of three cases, and the
  first-build reload fires only when that build recorded no failure. Staging each restart and
  switching on success is weighed and rejected for 2.18, with its cost, and the narrowing is put
  to the operator as § 9.8. The dev test covers an edit that breaks one page of three.
- **Major 2, "once" on nested paths (§ 5.2).** Five paths log a cause and then throw to a site
  that logs it again; they are listed with `file:line`. The site that records the failure owns
  the diagnostic, and an inner site puts its context into the error it throws. The "once" test
  covers a page write and a URL model.
- **Major 3, two copies (§ 4.6, new).** The live and unsettled sets, and the flags that say which
  listener is armed, are on the same process-wide object as the request, with a version field.
  A table says which copy arms each listener. A two-copy integration test is added.
- **Minor (§ 5.5).** Every example's read of `dev` is listed: 2, 3, 5, 9, 10 and 11, and 7's two
  `dev: false`.
