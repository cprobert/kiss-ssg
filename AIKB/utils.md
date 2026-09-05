# utils.js

## Responsibility

Small string/path helpers shared across the engine: slugification, title-casing, path sanitization, content hashing, and the engine's one file-globbing entry point.

## Public interface

- `trimLines(lines)` → `lines` with every line `.trim()`ed and rejoined with `\n` (trailing newline added).
- `toSlug(slug)` → lowercased, trimmed, with every run of non-word characters (`[\W_]+`) collapsed to a single `-`.
- `toTitleCase(str)` → each space-separated word capitalized.
- `trimPath(path)` → leading/trailing `/` stripped.
- `sanitizePath(path)` → `trimPath`, split on `/`, each segment passed through `toSlug`, rejoined with `/`; returns the input unchanged (including falsy) if falsy.
- `posixPath(path)` → backslashes converted to `/` and a leading `./` stripped.
- `globFiles(pattern)` → every file matching `pattern`, each through `posixPath`, sorted. The engine's only glob call site.
- `hashId(input)` → MD5 hex digest of `input` if it's a string, else of `JSON.stringify(input)`.
- `export default { trimLines, toSlug, toTitleCase, trimPath, sanitizePath, posixPath, globFiles, hashId }` (also each function is a named export).

## Depends on

`node:crypto` (`createHash`), `glob` (`globSync`).

## Depended on by

`lib/assets.js`, `lib/handlebars-helpers.js`, `lib/kiss.js`, `lib/kiss-page.js`, `lib/model-resolver.js`, `lib/partials.js`, `lib/watcher.js`.

## Non-obvious behavior

- `toSlug` collapses non-word runs (including underscores, since `\W` combined with the explicit `_` in `[\W_]+` also matches underscore) to a single `-`, and can leave a **trailing dash** for input ending in a non-word character (e.g. `toSlug('foo!')` → `'foo-'`) — nothing trims a trailing separator.
- `hashId` hashes objects by `JSON.stringify(input)`, not by their `toString()` — this fixes a v1 bug where `md5(object)` implicitly called `.toString()` on the object first, hashing the literal string `"[object Object]"` for _every_ object regardless of content (so all object-model pages collided on the same id in v1).

- `globFiles` exists because glob v9+ changed two behaviours the engine relied on: it strips a leading `./` from the paths it returns (while every `config.folders.*` default carries one, so a caller slicing the folder prefix off a result would slice the wrong number of characters), and it no longer sorts results — walk order would make page order, partial registration order and sitemap order depend on the machine. Routing every glob through here fixes both once. Do not call `globSync` directly from another module.
