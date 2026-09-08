# check.js

## Responsibility

The decision core of the `kiss-ssg` command line: what an argv asked for, what the reports file says, and what to exit with. `bin/kiss-ssg.js` is the thin wrapper around it — it spawns the site's own build script, makes the temp file and prints; every answer it acts on comes from here.

## Public interface

- `HELP` — the usage text both `--help` and a usage error print.
- `parseArgs(argv)` → `{ command, script, args, summary, error }`. `command` is `'check'` or `'help'`; `script` is the site's build script and `args` everything after it, less our own `--summary`; `summary` is set by `--summary` on either side of the script; `error` is a usage error (print it with `HELP` and exit 1).
- `readReports(text)` → the JSON Lines file `KISS_REPORT` collects, parsed into `BuildReport[]`. Blank lines are skipped; a malformed line throws.
- `exitCodeFor(reports, scriptStatus)` → `0` only when the script exited `0`, at least one build was reported, and every report is `ok`. Everything else is `1`.

## Depends on

Nothing (`readReports`' return type refers to `./build-report.js`, but only as a type).

## Depended on by

`bin/kiss-ssg.js`.

## Non-obvious behavior

- **Everything after the script is passed through to it, `--summary` excepted.** A site that takes its own arguments (`kiss-ssg check menu.js 2026-spring`) is checked exactly the way it is run; `--summary` is read wherever it is written, because "check this and summarise it" is a thought people finish at the end of the line. That leaves one word reserved, so a bare `--` ends the options and hands the rest through verbatim (`kiss-ssg check menu.js -- --summary`) for the site that genuinely needs it. Before the script an unrecognised flag is a usage error instead: there is no script yet for it to belong to.
- **No reports at all is a failure, not a pass.** A script that never awaits `complete()` writes no line, and that is the very silence the check exists to break: it exits 0 on a broken site. `exitCodeFor` treats an empty list as `1` and the bin says why on stderr.
- **The script's own exit code is honoured too.** A site that catches its build failure and exits 1 itself, or one that dies before it ever builds, fails the check whatever the reports say.
- **A malformed line throws rather than being skipped.** A report nobody can parse is a finding — dropping it silently would turn a corrupt run into "nothing was reported", or worse into a pass.
- **A check runs `config.assets.pipeline` exactly as a build does**, and that is deliberate rather than an oversight in what check mode discards. A step writes into the site's own **source** tree (`src/assets/css/site.css` — see `AIKB/pipeline.md`), so there is nothing extra for the check to throw away: what it stages and discards is still only the build folder. The consequence worth knowing is that a check is not read-only over the working tree — it regenerates whatever its steps generate, and a failing step fails the check like a failing page, reported as `<pipeline: <name>>`. In `dev: false` (which check mode forces) no `watch` process is ever started, so a check always terminates.
- **The bin sends the child's stdout to its own stderr** (`stdio: [0, 2, 2]`). Plain `'inherit'` would interleave the site's build log with the JSON on stdout and nothing could parse it; a person still sees the whole build, on stderr.
- **The bin runs the script from the caller's cwd**, not from the script's folder: a site resolves `folders` against the cwd it is normally run from (`cd examples && node 8-data-fed-site.js`), so moving it would check a different set of paths from the ones it builds with.
- **The temp reports file is removed in a `finally`**, and the bin sets `process.exitCode` rather than calling `process.exit()`, so the cleanup runs before the process leaves.

## Types

`types/check.d.ts` is emitted from the JSDoc here like every other `lib/` module, but nothing imports it: the CLI surface is the command, not the module. `CheckArgs` is documented for the reader of this file.
