# partials.js

## Responsibility

Registers Handlebars partials and layouts from `config.folders.partials` and `config.folders.layouts` onto a given Handlebars environment. Every partial goes through a **table of transforms keyed by extension**: the built-ins (`md`, `txt`) with a site's `config.transforms` laid over them. `.html` and `.hbs` are the identity transform and are not in the table.

## Public interface

- `TEMPLATE_EXTENSIONS` — `['html', 'hbs']`, frozen: the extensions compiled as Handlebars and inserted as they render. A site cannot list them in `config.transforms` (`lib/config.js` refuses them).
- `builtInTransforms({ markdown, hbs })` → `{ md, txt }`. `md` is `{ render: (output) => markdown.render(output) }`; `txt` is `{ compile: false, render: hbs.Utils.escapeExpression }`.
- `setupTransforms(transforms)` → `Promise<Map<ext, Error>>`. Awaits every transform's `setup` once, in parallel. **Never rejects**: a failed setup is returned against its extension (a non-`Error` throw is wrapped in one).
- `registerPartials(hbs, config, deps, previous = [])` → `{ names, collisions }`.
  - **What it registers.** It globs `folders.partials` for `TEMPLATE_EXTENSIONS` plus the table's keys, and `folders.layouts` for `.hbs`. Each file becomes a recording function (`transformingPartial`, below).
  - **`previous`** is the `names` array a prior call returned. Every name in it that this pass did not produce is `hbs.unregisterPartial`ed.
  - **`collisions`** is `{ name, files, error }[]`, for the caller to report.
  - **`deps`** is `{ markdown, logger, graph?, failed? }`. `failed` is the map `setupTransforms` fills; it is read when a partial renders, not at registration.
- `partialNameFor(file, folders)` → the name `registerPartials` would derive for `file` (native or posix path), or `null` when it is under neither `folders.partials` nor `folders.layouts`.
- Typedefs: `KissTransform` (`{ compile?, render, setup? }`) and `KissTransformContext` (`{ name, file, page, context, hash }`).

## Depends on

`fs-extra`; `node:fs` (`realpathSync.native`) and `node:path`; `./utils.js` (`globFiles`, `posixPath`). The markdown renderer, the logger, the dependency graph (`deps.graph`, `AIKB/dependency-graph.md`) and the setup-failure map are passed in via `deps`, not imported.

## Depended on by

- `lib/kiss.js`: `registerPartials` and `setupTransforms`. The instance keeps the failure map on `_transformFailures` and the setup promise on `_transformsReady`.
- `lib/config.js`: the `KissTransform` type, for `config.transforms`.
- `lib/rebuild.js`: `partialNameFor`, which maps an edited partial or layout to its name in `_handleChange()`.

## Non-obvious behavior

- **A partial's name** is its path relative to the globbed folder, with the extension stripped and any leading `/` trimmed. For example, `partials/nav/header.hbs` under `folders.partials` registers as `nav/header`.
- **A `.md` partial renders per call, after Handlebars.**
  - **The order.** The compiled template runs first, then `render` passes its output through `markdown.render()`. So `{{link "x"}}` is already a URL, and `{{> "nav"}}` already markup, by the time Markdown reads the line.
  - **What it fixed.** Until 2.16 Markdown ran first, at registration. Remarkable escaped `"` to `&quot;` and `>` to `&gt;`, and Handlebars then failed to parse every double-quoted argument and every partial call (`test/integration/partial-transforms.test.js`).
  - **Benchmarked; no cache.** Rendering per call was measured before deciding against memoising: `fanout@500` was 7.4% faster in total than the registration-time path (2026-11-14, `planning/sessions/2026-11-14-partial-transforms.md`).
- **The order has four costs, all documented rather than engineered around** (GUIDE § Partial transforms, CHANGELOG 2.16.0):
  - **Emphasis.** A `*` or `_` that Handlebars inserts becomes emphasis.
  - **Code blocks.** A nested partial called on a line indented four spaces becomes a code block.
  - **A swallowed blank line.** A partial call alone on its line loses that line's newline (`AIKB/upstream.md`, "standalone"). If the called file has no final newline, one blank line after the call becomes none, Markdown's HTML block runs on into the next paragraph, and that paragraph is written without its `<p>`. Measured 2026-11-14, found by the clean room.
  - **`markdown.html: false`.** Under it, HTML that a helper or partial inserted is escaped with the rest of the input.
- **`config.markdown` and `kiss.markdown` reach `.md` partials at render.** The built-in `md` transform closes over the renderer passed in `deps.markdown`, which is `kiss.markdown` (markdown-it). A plugin added to it later is seen by the next render, with no re-register. `Kiss` still builds its markdown-it before calling this module, so the transform binds to the configured instance.
- **The registered set mirrors disk.** Handlebars keeps a registration until it is explicitly unregistered. Before this was fixed, a partial deleted from disk kept rendering its last-known content for the life of the process (review finding B1).
  - **The recipe.** Every pass finds every file again, then unregisters every name the previous pass produced that this one did not.
  - **Who holds the state.** The caller: `Kiss.registerPartials()` keeps the last `names` on `_partialNames` and passes it back in.
- **A missing partial fails its page.** A page that still references a deleted partial fails to render (`The partial foo could not be found`) instead of rendering a ghost. Under `watch()` that surfaces as a replay failure, and the page's stale output is left in place (`AIKB/kiss.md`).
- **Two files, one name: a collision fails the build.** The cases:
  - `foo.md` and `foo.hbs`;
  - `foo.txt` and a site's `foo.adoc`;
  - a partial and a layout that share a name.

  What happens:
  - **The name is registered as `collidingPartial`**, which throws on every call, naming both files. So every page that calls it fails.
  - **The collision is returned** in `collisions` and logged with `logger.error`. `Kiss.registerPartials()` records it as a `<partials>` failure, which fails the build even when no page calls the name.
  - **Why fail rather than pick one.** Before 2.16 the fixed order of five passes decided which file won, silently. Once a site can extend the table, any order is arbitrary.
  - **The partial-vs-layout case** was added to the spec's rule at the 2026-11-14 pulse, on the operator's decision. Until then the layout won silently.

- **One file reached twice is not a collision.** A site may point `folders.partials` and `folders.layouts` at one directory, so the same `.hbs` is found by both globs.
  - **Grouping.** Entries under a name are grouped by `fileIdentity`: `realpathSync.native`, falling back to `path.resolve` for a file gone since the glob.
  - **Why not the path string.** `glob` keeps an in-cwd relative path relative but normalises a `..` path to absolute. A symlink or junction is also one file (Codex, slice 1, rounds 1 and 2).
- **Extensions outside the table are ignored**, as before. A `notes.adoc` in `partials/` is not a partial until a site lists `adoc` in `config.transforms`.
- **Partials live on the instance.** They are registered on `kiss.handlebars`, never the global `handlebars` module.
  - **The v1 trap.** A consumer helper that does `require('handlebars').partials[name]` silently gets `undefined` in v2. v1 sites did this to render a partial chosen by name, for example diploma-msc's `renderPartial`.
  - **The fix.** The migration notes point such sites at `kiss.handlebars.partials`, or at Handlebars' dynamic partial syntax `{{> (lookup this "name")}}`, which needs no helper (verified against diploma-msc on 2026-09-04).
- **Every partial is a recording function** (`transformingPartial`).
  - **How it is called.** Handlebars calls a function partial as `partial(context, options)`, and handlebars-layouts' `extend`/`embed` call it as `template(context, { data })`.
  - **What it does, in order:**
    1. reads `options.data.kissPage`, the page identity `KissPage.generate()` puts in the render's data frame;
    2. records `(page, name)` on `deps.graph` (`AIKB/dependency-graph.md`);
    3. throws if the extension's setup failed;
    4. runs the compiled template, or takes the file's own characters under `compile: false`;
    5. returns the output, or `transform.render(output, ctx)` when the extension has a transform.
  - **The return contract matters.** The result must be a plain string. `undefined` makes Handlebars try to compile the function, and a `SafeString` breaks an indented partial call, which splits the result on newlines. A transform's `render` returns a string for the same reason, and it is inserted raw.
  - **Tracing never affects rendering.** A recorder that throws is swallowed.
  - **Without a graph or a page id,** the wrapper is a plain compiled partial.
- **The transform's `ctx`.**
  - **The fields:** `{ name, file, page, context, hash }`.
  - **`page`** is the output path of the rendering page (`kissPage`).
  - **`hash`** is the call's hash arguments, or `{}` when it has none. `{{> note who="reader"}}` gives `{ who: 'reader' }`.
- **A failed `setup` fails the pages that use it, at render.** Registration is synchronous and the setups settle later.
  - **How the failure is read.** `failed` is a shared `Map`, read on each call. Each call to a partial of that extension throws `Partial "x" (file) cannot render: the .adoc transform's setup failed: …`.
  - **Who reports it.** `Kiss._setupTransforms` reports the failure itself once, as a `<transform .adoc>` failure.
  - **The rest of the site still builds**, so the report names both the transform and every page it took down.
- **Layouts take no transform and stay `.hbs`.** They are compiled once rather than per `{{#extend}}`. When that change landed it measured:
  - `fanout@500`: −27.1%;
  - `models@500`: −15.7%;
  - `watch@500`: −17.5%;
  - `scan@500`: −10.7%;
  - a watch replay after a model edit: 455 ms → 172 ms.
- **`hbs.compile` is lazy.** An unrendered partial is never parsed, and a partial that will not parse still fails at render, against the page that used it.
- **`hbs.partials[name]` is always a function.**
  - **Before.** It was a string only until the first render: Handlebars compiles a string partial on first use and writes the function back into the same object. So a consumer helper reading an entry has always had to accept both shapes.
  - **The fix.** The one-line form is in `llms.txt` and `GUIDE.md`: `typeof p === 'function' ? p(ctx, { data: options.data }) : kiss.handlebars.compile(p)(ctx, { data: options.data })`.
  - **Pass `options.data` through.** The data frame is how the invoking page is recorded as using the partial. A bare `p(ctx)` renders correctly, but the page is not recorded, so under `watch()` it is not re-rendered when the partial changes.
  - **The worked recipe** is `examples/9-migrated-from-v1/router.js`'s `renderPartial`.
- **`partialNameFor` is the one place outside registration that turns a path into a name.** It strips any extension, so it needed no change for site transforms. `Kiss._handleChange` calls it, so a chokidar path maps to the name the graph knows.
- **`.txt` is the built-in `compile: false` transform.**
  - **What happens.** The file's characters are escaped once with `hbs.Utils.escapeExpression`, and the escaped string is returned, so the page shows the file rather than executing it.
  - **A plain string, not a `SafeString`.** The `SafeString` this shipped with first threw `TypeError: result.split is not a function` on an indented call and wrote no page, on the `<pre>`-indented snippet the type exists for.
  - **The rule an author holds:** "a `.txt` partial behaves as if you had written `{{ }}` around its contents". That is why the escaping is Handlebars' own, and why it is safe in an attribute as well as in body text. The cost is that `=` and `"` become `&#x3D;` and `&quot;` in the source; both render correctly.
- **Two consequences of `.txt`, both the point rather than limitations:**
  - `{{name}}` inside a `.txt` file is printed rather than interpolated, so a snippet can show template syntax without being one;
  - markup is shown rather than rendered, so a code sample drops into a `<pre>` with no hand-escaping.
- **`.txt` exists because the extension is a claim about processing** (`CLAUDE.md` § Design philosophy).
  - **The set.** `.hbs` is a template, `.md` is rendered Markdown and `.html` is HTML, and all three are compiled. `.txt` is the one kiss does not compile.
  - **Not for SCMS.** It was deliberately not added to replicate SCMS, whose `.txt` files carried HTML in 2 of 10 cases.
  - **A site transform keeps the promise.** `.adoc` means whatever the site's `config.transforms.adoc` says, and the site's config is where a reader finds it.
