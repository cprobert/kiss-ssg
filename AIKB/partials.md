# partials.js

## Responsibility

Registers Handlebars partials and layouts from `config.folders.partials` and `config.folders.layouts` onto a given Handlebars environment, rendering Markdown partials to HTML at registration time.

## Public interface

- `registerPartialsFrom(hbs, folder, ext, { markdown, logger })` → array of registered partial names. Globs `${folder}/**/*.${ext}`, reads each file, renders it through `markdown.render()` first if `ext === 'md'`, and calls `hbs.registerPartial(name, source)`. Returns `[]` immediately if `folder` is falsy.
- `registerPartials(hbs, config, deps, previous = [])` → array of every registered partial name, calling `registerPartialsFrom` four times in sequence: `partials/**/*.html`, `partials/**/*.md`, `partials/**/*.hbs`, then `layouts/**/*.hbs`. `previous` is the array a prior call returned; every name in it that this pass did not produce is `hbs.unregisterPartial`ed before the new names are returned.

## Depends on

`fs-extra`; `./utils.js` (`globFiles`, `posixPath`). The markdown renderer and logger are passed in via `deps`, not imported.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- A partial's registered name is its path relative to the globbed folder with the extension stripped (leading `/` trimmed) — e.g. `partials/nav/header.hbs` under `folders.partials` registers as `nav/header`.
- `.md` files are rendered to HTML _at registration time_, not at render time — editing a Markdown partial requires re-registering (i.e. a rebuild), not just re-rendering the page.
- **The registered set mirrors disk, and that is why all four passes re-run.** Handlebars keeps a registration until it is explicitly unregistered, so before the fix a partial deleted from disk kept rendering its last-known content for the life of the process — dev and a fresh production build disagreed (review finding B1). The recipe is: re-run all four passes, then unregister every name the previous pass produced that this one did not. It cannot be done per file. `foo.html`, `foo.md`, `foo.hbs` and a layout `foo` all derive the name `foo` and the last pass wins (below), so unregistering by file would delete a winner that is still on disk, and re-registering by file would install a loser. The caller owns the "previous names" state: `Kiss.registerPartials()` keeps the last returned array on `_partialNames` and passes it back in.
- A page that still references a deleted partial now fails to render (`The partial foo could not be found`) instead of rendering a ghost. Under `watch()` that surfaces as a replay failure via the logger, and the page's stale output is left in place — see `AIKB/kiss.md`.
- Registration order is html, then md, then hbs (from `partials/`), then hbs (from `layouts/`) — since `hbs.registerPartial` overwrites by name, a layout `.hbs` with the same name as a partial `.hbs` wins, and later-registered extensions in general win over earlier ones for a colliding name.
- `registerPartialsFrom` returns `[]` (not an error) when `folder` is falsy, matching `config.js`'s "folders may be `null`" contract — a `null` `folders.layouts`, for example, silently skips layout registration.
- Partials are registered on the _instance_ environment (`kiss.handlebars`), never the global `handlebars` module. A consumer helper that does `require('handlebars').partials[name]` (v1 sites did this to render a partial chosen by name — diploma-msc's `renderPartial`) silently gets `undefined` in v2. The migration notes point such sites at `kiss.handlebars.partials` or Handlebars' built-in dynamic partial syntax `{{> (lookup this "name")}}`, which needs no helper at all (verified against diploma-msc on 2026-09-04).
- **Layouts are registered compiled; every other partial stays a source string.** `handlebars-layouts`' `extend` helper reads `handlebars.partials[name]`, and when it finds a string it compiles it — without ever writing the compiled function back. A layout was therefore recompiled from source on _every page render_, which made it the single largest item in a build's CPU profile: 500 compiles of one file in a 500-page build (1.18ms each on the benchmark's 441B layout — 588ms of a 1291ms build; 3.01ms on diploma-msc's 6.4KB layout, ~2s across its 669 pages). Registering `hbs.compile(source)` makes the helper's `typeof template !== 'function'` test false, so it uses the function as-is. Measured: `fanout@500` build **-27.1%**, `models@500` **-15.7%**, `watch@500` **-17.5%**, `scan@500` **-10.7%**, and a watch-mode replay after a model edit **455ms → 172ms**.
- **Only layouts, and that restraint is the compatibility contract.** `hbs.partials` is observable — consuming sites read it in their own helpers, and at least one (`learna-kiss`'s `getSiteSpecificPartial`) calls `handlebars.compile(partial)` unconditionally, which throws when handed a function. A layout is not reachable that way in any site surveyed: none has a partial sharing a layout's name. Regular `{{> partial}}` lookups are already compiled once and cached by Handlebars itself, so converting them would win nothing and risk exactly that breakage. `test/unit/partials.test.js` pins the split — layout a function, `.hbs`/`.html`/`.md` partials strings.
- **`hbs.compile` is lazy**, returning a wrapper that parses on first invocation. So a layout that is never rendered costs nothing at registration, and a layout that will not parse still fails at render against the page that used it — registering eagerly moves no failure earlier, and there is no error handling to add.
