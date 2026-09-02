# partials.js

## Responsibility

Registers Handlebars partials and layouts from `config.folders.partials` and `config.folders.layouts` onto a given Handlebars environment, rendering Markdown partials to HTML at registration time.

## Public interface

- `registerPartialsFrom(hbs, folder, ext, { markdown, logger })` → array of registered partial names. Globs `${folder}/**/*.${ext}`, reads each file, renders it through `markdown.render()` first if `ext === 'md'`, and calls `hbs.registerPartial(name, source)`. Returns `[]` immediately if `folder` is falsy.
- `registerPartials(hbs, config, deps)` → array of every registered partial name, calling `registerPartialsFrom` four times in sequence: `partials/**/*.html`, `partials/**/*.md`, `partials/**/*.hbs`, then `layouts/**/*.hbs`.

## Depends on

`fs-extra`, `glob`; markdown renderer and logger are passed in via `deps`, not imported.

## Depended on by

`lib/kiss.js`.

## Non-obvious behavior

- A partial's registered name is its path relative to the globbed folder with the extension stripped (leading `/` trimmed) — e.g. `partials/nav/header.hbs` under `folders.partials` registers as `nav/header`.
- `.md` files are rendered to HTML *at registration time*, not at render time — editing a Markdown partial requires re-registering (i.e. a rebuild), not just re-rendering the page.
- Registration order is html, then md, then hbs (from `partials/`), then hbs (from `layouts/`) — since `hbs.registerPartial` overwrites by name, a layout `.hbs` with the same name as a partial `.hbs` wins, and later-registered extensions in general win over earlier ones for a colliding name.
- `registerPartialsFrom` returns `[]` (not an error) when `folder` is falsy, matching `config.js`'s "folders may be `null`" contract — a `null` `folders.layouts`, for example, silently skips layout registration.
