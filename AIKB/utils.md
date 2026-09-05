# utils.js

## Responsibility

Small string/path helpers shared across the engine: slugification, title-casing, path sanitization, content hashing, and the engine's one file-globbing entry point.

## Public interface

- `trimLines(lines)` → `lines` with every line `.trim()`ed and rejoined with `\n` (trailing newline added).
- `toSlug(slug)` → NFKD-normalised, combining marks stripped, lowercased, every run of anything outside `[a-z0-9]` collapsed to a single `-`, leading/trailing `-` trimmed; if that leaves nothing, `'p-' + sha1(input).slice(0, 8)` (an empty/whitespace-only input stays `''`).
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

- `toSlug` is the whole naming contract for a page's output path (`slug`, each `path` segment, and the `ext`), so it has to be both **stable** and **collision-free per distinct input**. The algorithm: `normalize('NFKD')` splits an accented letter into base letter + combining mark, `\p{M}` strips the marks (so `'Über uns'` → `'uber-uns'` rather than `'-ber-uns'`), everything outside `[a-z0-9]` collapses to `-`, and leading/trailing dashes are trimmed (`'  --hello--  '` → `'hello'`; `toSlug('foo!')` → `'foo'`, where it used to leave a trailing dash).
- **The hash fallback is what stops non-Latin titles colliding.** A script with no Latin decomposition — CJK, Hangul, Cyrillic — leaves nothing after the strip, and the old `[\W_]+` rule slugged _every_ such title to `'-'`: a multilingual `.pages()` fan-out built one file and the rest were dropped by the duplicate-`buildTo` check (review finding C6). Empty results therefore fall back to `'p-' + sha1(original).slice(0, 8)` — short, stable across builds, prefixed so it still reads as a slug. It is deliberately _not_ a transliteration: it is unique and reproducible, not readable. A truly empty input still returns `''`, so `sanitizePath` keeps its behaviour on an empty segment (`'a//b'`).
- Transliteration means two titles that differ only by accent (`'Über uns'` and `'Uber uns'`) now share a slug. That is a genuine collision and `Kiss._preparePage` fails the build on it, rather than one page silently overwriting or losing the other.
- `hashId` hashes objects by `JSON.stringify(input)`, not by their `toString()` — this fixes a v1 bug where `md5(object)` implicitly called `.toString()` on the object first, hashing the literal string `"[object Object]"` for _every_ object regardless of content (so all object-model pages collided on the same id in v1).

- `globFiles` exists because glob v9+ changed two behaviours the engine relied on: it strips a leading `./` from the paths it returns (while every `config.folders.*` default carries one, so a caller slicing the folder prefix off a result would slice the wrong number of characters), and it no longer sorts results — walk order would make page order, partial registration order and sitemap order depend on the machine. Routing every glob through here fixes both once. Do not call `globSync` directly from another module.
