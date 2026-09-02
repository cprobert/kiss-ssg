# config.js

## Responsibility

Resolves a user-supplied config object against defaults: fills in `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`, derives the folder set from `folders.src` when given, and lists which folders `Kiss` must create on startup.

## Public interface

- `DEFAULT_FOLDERS` — frozen object: `root`, `src`, `pages`, `build`, `assets`, `static`, `layouts`, `partials`, `models`, `controllers` (all `./src/...` or `./public`).
- `DEFAULT_CONFIG` — frozen object: `dev`, `verbose`, `cleanBuild`, `extensionLess`, `sass: { includePaths: [] }`, `port`.
- `resolveFolders(userFolders = {})` → folders object. If `userFolders.src` is set, every key in `DERIVED_FROM_SRC` (`assets`, `static`, `layouts`, `pages`, `partials`, `models`, `controllers`) is rewritten to `${src}/${key}` *before* any explicit per-key override in `userFolders` is applied.
- `resolveConfig(userConfig = {})` → full config object with `folders` resolved via `resolveFolders` and `sass` shallow-merged with the default.
- `foldersToEnsure(folders)` → array of the folder paths `Kiss` should `fs.ensureDirSync` on startup (`src`, `pages`, `build`, `assets`, `layouts`, `partials`, `models`, `controllers`), filtered to drop falsy entries.

## Depends on

Nothing (no imports).

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- Setting `config.folders.src` re-derives the seven `DERIVED_FROM_SRC` subfolders from it, *unless* each is also individually overridden in the same `userFolders` object (the final spread `{ ...folders, ...userFolders }` lets explicit keys win over the src-derived ones).
- A folder set to `null`/`undefined` in the resolved config is legal: `foldersToEnsure` skips creating it, `registerPartialsFrom`/`copyAssets` skip scanning/copying it (each checks for a falsy folder before globbing).
- `foldersToEnsure` fixes a v1 copy-paste bug where most folders were only created conditionally on `assets` being set; here each folder stands on its own regardless of the others.
- `sass.includePaths` is kept as the public config key (for backwards compatibility with v1 configs) even though the modern `sass` package API calls the equivalent option `loadPaths` — consumers (`lib/assets.js`, `lib/handlebars-helpers.js`) read `config.sass.includePaths` and pass it to `sass` as `loadPaths`.
