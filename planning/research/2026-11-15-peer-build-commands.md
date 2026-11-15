# How Eleventy, Astro and Hugo run a build

Research for Phase 2 of [the roadmap](../plans/2026-11-10-roadmap-to-3.0.md) (`kiss-ssg build`,
`dev` and `check` run the site's script), done 2026-11-15 on the branch
`feat/command-runs-build`. It closes the roadmap's Risks row "peer practice cited here is from
memory". Each answer names the page or source file it came from. Where the docs were silent, the
answer comes from source at these commits:

| Project  | Repository        | Commit read                    |
| -------- | ----------------- | ------------------------------ |
| Eleventy | `11ty/eleventy`   | `3079645` (main, 2026-11-13)   |
| Astro    | `withastro/astro` | `5b7c327` (main, 2026-11-13)   |
| Hugo     | `gohugoio/hugo`   | `7a15e87` (master, 2026-11-14) |

The source was read through raw GitHub files summarised by a fetch tool, not run. A quote below
is the tool's quote of that file. Re-check one by opening the file at the commit.

## The finding that shapes the design

**None of the three runs a user's script.** Each one owns the process and _imports a config
module_ that it calls: Eleventy calls the exported function with `eleventyConfig`, Astro loads
`astro.config.*` through `resolveConfig`, and Hugo reads TOML, YAML or JSON. The build itself is
the tool's code, not the site's.

kiss is the other way round. `router.js` is an imperative program: it constructs `Kiss`,
registers pages and awaits `complete()`. Phase 2 does not change that (the roadmap keeps
`router.js` as the page table). So the peers answer "how does a tool own the process", but not
"how does a tool own the process around a script it did not write". The closest peer shape is
Eleventy's programmatic API, where a script constructs `Eleventy` and calls `write()`, and
Eleventy records `source: "script"` rather than `"cli"`. Eleventy does not then wrap that script
in its CLI.

What carries over is the behaviour around the build, set out below.

## 1. How the build is loaded

| Tool     | What is loaded                       | How                                                                                                                                                                                    | CJS and ESM                                                                                                                                                                        |
| -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eleventy | A config module exporting a function | In-process. `TemplateConfig.requireLocalConfigFile()` calls `DynamicImportRaw(path, isEsm ? "esm" : "cjs")`. The CLI (`cmd.cjs`) is CJS and imports the ESM core with `await import()` | Both, since v3 ([config docs](https://www.11ty.dev/docs/config/)): `.eleventy.js`, `eleventy.config.js`, `.mjs`, `.cjs`, first found wins; async functions allowed                 |
| Astro    | `astro.config.mjs` (or `.js`, `.ts`) | In-process. The CLI imports `./build/index.js` and `./dev/index.js` and awaits them (`packages/astro/src/cli/index.ts`)                                                                | `.mjs`, `.js` and `.ts` documented ([configuring Astro](https://docs.astro.build/en/guides/configuring-astro/)); `.cjs` not mentioned; restart code also matches `.mts` and `.cts` |
| Hugo     | `hugo.toml`, `.yaml` or `.json`      | Data, not code                                                                                                                                                                         | Not applicable                                                                                                                                                                     |

Every tool also has a programmatic path. Eleventy: `new Eleventy(input, output, { configPath,
quietMode, config })` then `write()`, `toJSON()` or `toNDJSON()`
([programmatic API](https://www.11ty.dev/docs/programmatic/)). Astro: `dev()`, `build()`,
`preview()` and `sync()` exported from `astro`, each taking an inline config with `mode`,
`logLevel` and `configFile`
([programmatic reference](https://docs.astro.build/en/reference/programmatic-reference/)).

## 2. How a mode or environment is named

| Tool     | Mechanism                                                                                                                                                                                                                                                                                                                                 | Default per command                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Eleventy | No mode flag. The tool sets `ELEVENTY_RUN_MODE` (`build`, `serve` or `watch`), `ELEVENTY_ROOT`, `ELEVENTY_SOURCE` and `ELEVENTY_VERSION`. A site's own environment is the site's business: the docs show `MY_ENVIRONMENT=production` through `cross-env` or `.env` ([environment variables](https://www.11ty.dev/docs/environment-vars/)) | `build`, or `serve`/`watch` from the flag                     |
| Astro    | `--mode <name>` on `dev` and `build`. It sets `import.meta.env.MODE` and chooses the `.env.<mode>` file. `PROD` and `DEV` follow from it ([environment variables](https://docs.astro.build/en/guides/environment-variables/))                                                                                                             | `development` for `astro dev`, `production` for `astro build` |
| Hugo     | `--environment` / `-e`, or `HUGO_ENVIRONMENT`. The flag wins over the variable. It selects `config/<environment>/`, layered over `config/_default/`, and is readable as `hugo.Environment` ([configuration](https://gohugo.io/configuration/introduction/))                                                                               | `development` for `hugo server`, `production` otherwise       |

Two shapes, then. Eleventy separates the tool's **run mode** (which it owns and publishes) from
the site's **environment** (which it leaves to the site). Astro and Hugo give one named
environment flag, defaulted by command, that also chooses config. The kiss fleet already has
site environments as positional arguments (`router production|uat|staging|content`), which is
Eleventy's split: kiss owns build, dev and check; the site owns `production`.

## 3. What happens when the config is edited during dev

| Tool     | Behaviour                                                                                                                                                                                                                                                                                                                                                                       | A broken edit                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eleventy | Re-evaluated **in the same process**. `TemplateConfig.reset()` clears its caches and re-runs `requireLocalConfigFile()`. The watcher follows the config file's `import`/`require` graph (`setWatchJavaScriptDependencies`, on by default, `node_modules` excluded); a target outside that graph needs `resetConfig` ([watch and serve](https://www.11ty.dev/docs/watch-serve/)) | Loading fails with `ConfigError` "Error in your Eleventy config file '<path>'", with the cause attached                                                                                        |
| Astro    | **In-place restart.** `shouldRestartContainer` matches the changed file against the config file name (or `astro.config.*` in the root) and any `settings.watchFiles`. `restartContainerInPlace` re-runs `resolveConfig`, builds a new Vite config and calls `viteServer.restart()` (`packages/astro/src/core/dev/restart.ts`)                                                   | Logs the error, sends it to the browser overlay, and carries on "with previous valid configuration"                                                                                            |
| Hugo     | **Full rebuild, no restart.** `handleEvents` matches each event against the config files and config directories found at start-up, then `fullRebuild` calls `reloadConfig()` and rebuilds (`commands/hugobuilder.go`). Prints "Watching for config changes in …" at start                                                                                                       | `reloadConfig` fails, the builder pauses (other file events are ignored until the config loads again) and logs "Failed to reload config: …". Only a multihost change asks for a server restart |

All three keep the dev process alive across a config edit and none asks the person to restart.
All three re-read the config from scratch rather than patching it. Two of the three keep serving
the last good state when the new config is broken.

Inference for kiss, not a peer fact: Eleventy can re-import in-process because its config is a
function it calls again. A kiss `router.js` runs top-level code once, and Node keeps every ESM
module it has imported (an ESM module cannot be evicted from the cache; a query-string import
loads a second copy beside the first). "Restart on an edit to the script" therefore points to a
child process that the command replaces.

Checked 2026-11-15 by search, not against Node's own documentation, which the search did not
reach. In [nodejs/modules#307](https://github.com/nodejs/modules/issues/307) a maintainer says
the ESM cache is private on purpose, and that the query-string workaround keeps every old copy in
memory. [nodejs/node#61767](https://github.com/nodejs/node/pull/61767), a proposed
`Module.clearCache()` covering ESM, is open, with an objection about leaks in long-running
processes. The [import-fresh readme](https://unpkg.com/import-fresh@4.0.1/readme.md) calls its
ESM growth unavoidable and meant for development only. The `worker_threads` alternative (a
worker per run, re-importing inside it) was suggested by commenters and is not established.
Whether #61767 has landed by the design's Node floor (22.23.4) is a question for the design, and
the answer is likely no, since the floor is a 22.x line.

## 4. A failed build: exit code and output

| Tool     | Exit code                                                                                                                                                                                                                                                                   | Output                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eleventy | `ErrorHandler.fatal()` sets `process.exitCode = 1` and does not call `process.exit`, so pending work finishes first. `cmd.cjs` sends `unhandledRejection` and `uncaughtException` to `fatal`, and on `SIGINT` sets `exitCode = 0` (`src/Errors/ErrorHandler.js`, `cmd.cjs`) | The error chain through `originalError` and `cause`, one line per error, numbered when there are several, with only the last error's stack. `once()` marks an error as logged so it is not printed twice                                            |
| Astro    | `astro check` exits 1 on errors, configurable with `--minimumFailingSeverity` ([CLI reference](https://docs.astro.build/en/reference/cli-reference/)). Other commands route errors through `throwAndExit(cmd, err)` (`packages/astro/src/cli/index.ts`)                     | Not read                                                                                                                                                                                                                                            |
| Hugo     | Not documented on the command page ([hugo](https://gohugo.io/commands/hugo/)), and `hugobuilder.go` returns errors to its caller. Not established                                                                                                                           | Wrapped: "error building site: …". In watch mode a failed rebuild is logged ("Rebuild failed") and the server keeps running. Browser error overlay on by default (`--disableBrowserError`) ([hugo server](https://gohugo.io/commands/hugo_server/)) |

Two practices recur. The exit code is set, not forced: `process.exitCode = 1`, and the process
ends on its own. And an error is printed once, however many places it reaches. That second one
is the kiss clean room's finding ("one failed page produces a 'broken link' line from every page
linking to it") seen from the other side.

## What this settles for the design, and what it does not

Settled by the evidence above:

- The command owns build, dev and check as **run modes**, and leaves the site's own environment
  (`production`, `uat`, an intake) to positional arguments passed through. Eleventy's split, and
  the shape the fleet already has.
- A failed build sets `process.exitCode = 1` and lets the process end. It does not call
  `process.exit()`.
- Each failure is printed once.
- A dev session survives an edit to the script, and a broken edit leaves the last good build
  served with the error shown, not a dead process.

Not settled, for the design to decide:

- Whether the command runs the script as a child process (as `check` and `aikb` already do) or
  imports it. None of the peers face this, because none runs a site's script. The ESM cache
  point above argues for a child process in dev at least.
- How the command learns that a script never called `complete()`, and how `node router.js` does
  the same on its own.
- How the mode reaches the engine without `KISS_CHECK`: an argument, an IPC message, or an
  environment variable the command owns.

Not found, to look up if the design needs it: Hugo's exit code on a failed build, and Astro's
error output.

Observed in passing: Eleventy's `TemplateConfig.js` at `3079645` also searches for
`buildawesome.config` files and emits `buildawesome.compilecachereset`, which suggests a rename
in progress. It does not change any answer above.
