# config.js

## Responsibility

Resolves a user-supplied config object against defaults: fills in `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`, derives the folder set from `folders.src` when given, and lists which folders `Kiss` must create on startup.

## Public interface

- `DEFAULT_FOLDERS` — frozen object: `src`, `pages`, `build`, `assets`, `static`, `layouts`, `partials`, `models`, `controllers` (all `./src/...` or `./public`).
- `DEFAULT_CONFIG` — frozen object: `dev`, `verbose`, `cleanBuild`, `extensionLess`, `sass: { includePaths: [] }`, `port` (3001), `livereloadPort` (35729), `devHost` (`'127.0.0.1'`).
- `resolveFolders(userFolders = {})` → folders object. If `userFolders.src` is set, every key in `DERIVED_FROM_SRC` (`assets`, `static`, `layouts`, `pages`, `partials`, `models`, `controllers`) is rewritten to `${src}/${key}` _before_ any explicit per-key override in `userFolders` is applied. Every resulting string value is then normalised: backslashes to `/`, repeated slashes collapsed, trailing slashes stripped.
- `resolveConfig(userConfig = {})` → full config object with `folders` resolved via `resolveFolders` and `sass` shallow-merged with the default. Keys whose value is `undefined` are dropped from the user object first (at the top level, inside `folders` and inside `sass`), so they take their default.
- `foldersToEnsure(folders)` → array of the folder paths `Kiss` should `fs.ensureDirSync` on startup (`src`, `pages`, `build`, `assets`, `layouts`, `partials`, `models`, `controllers`), filtered to drop falsy entries.

## Depends on

Nothing (no imports).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- **Folder strings are normalised once, here, because everything downstream is path arithmetic.** A trailing slash on `folders.assets` made `assets.js`'s target derivation miss (compiled CSS landed beside the build folder as `./publicmain.css`, logged as a success), and one on `folders.models` made `model-resolver.js` chop the first characters off every filename so a whole `.pages()` fan-out resolved to `[]`. Both are the same missing normalisation. `./` and `/` keep their slash — trimming them to `.` or `''` would change which directory they name — and a non-string value (`null`) is passed through untouched.
- Setting `config.folders.src` re-derives the seven `DERIVED_FROM_SRC` subfolders from it, _unless_ each is also individually overridden in the same `userFolders` object (the final spread `{ ...folders, ...supplied }` lets explicit keys win over the src-derived ones).
- **An explicitly `undefined` key takes its default; `null` does not.** A spread merge lets `undefined` win over the default, so `new Kiss({ port: process.env.PORT })` with `PORT` unset used to leave `port` undefined and bind a random ephemeral port, and `{ cleanBuild: opts.clean }` with the flag absent silently skipped emptying the build folder (review finding D-07). `resolveConfig`/`resolveFolders` drop undefined-valued keys before merging. `null` is deliberately kept, because it is the documented way to switch a folder off.
- **There is no `folders.root`.** v2 removed it: it was in `DEFAULT_FOLDERS`, in this doc and in llms.txt, but no engine module ever read it and `foldersToEnsure` excluded it, so a consumer setting it got the default layout with no warning (review finding D-06). A `root` key in a user config is now just an unknown key — `resolveFolders` spreads user folders in, so it passes through untouched and nothing reads it.
- A folder set to `null` in the resolved config is legal: `foldersToEnsure` skips creating it, `registerPartialsFrom`/`copyAssets` skip scanning/copying it (each checks for a falsy folder before globbing).
- `foldersToEnsure` fixes a v1 copy-paste bug where most folders were only created conditionally on `assets` being set; here each folder stands on its own regardless of the others.
- **The three dev-server keys are defaulted here and nowhere else.** `lib/dev-server.js` takes `port`, `livereloadPort` and `host` as required parameters, so a reader has one place to look for their values. `livereloadPort` exists so two sites can run in dev mode at once (a clash used to kill the process — review finding D-01) and is also the port `lib/kiss-page.js` injects into the dev-mode reload `<script>`. `devHost` defaults to loopback: dev mode used to bind every interface while logging `localhost` (D-13); `'0.0.0.0'` is the documented opt-out for previewing on another device.
- `sass.includePaths` is kept as the public config key (for backwards compatibility with v1 configs) even though the modern `sass` package API calls the equivalent option `loadPaths` — consumers (`lib/assets.js`, `lib/handlebars-helpers.js`) read `config.sass.includePaths` and pass it to `sass` as `loadPaths`.
