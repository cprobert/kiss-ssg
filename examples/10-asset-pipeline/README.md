# 10 · asset pipeline

`config.assets.pipeline` runs an external tool as part of the build. Here the tool is
`tools/tokens.js` — a dependency-free stand-in for Tailwind or sass — which compiles
`styles/tokens.json` into `src/assets/css/generated.css`. kiss knows nothing about it: it is a
command line, run before the asset copy, and the copy picks up whatever it wrote.

## Run it

```bash
npm run eg10                   # from the repo root
node router.js      # from examples/10-asset-pipeline/
node router.js --dev  # live preview on http://127.0.0.1:3010
```

With `--dev`, the step's `watch` command is started too — once, after `run` has succeeded —
and kept for the session. Edit `styles/tokens.json` while it is up: the tool recompiles the
stylesheet, kiss's assets watcher copies it into the build, and the browser reloads.
Ctrl-C, or a `close()`, ends the watch process; nothing is left running.

## Four kinds of reference

The page also carries the other half of the assets story: **every URL a template emits goes
through `{{asset}}`**, and the helper decides which ones it owns.

| Written                                  | Rendered                                      | Why                                                       |
| ---------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `{{root}}{{asset 'css/site.css'}}`       | `css/site.css` (hashed, under `assets.hash`)  | a file the copy emitted — looked up                       |
| `{{root}}{{asset 'img/icons.svg#bean'}}` | `img/icons.svg#bean`                          | the `#fragment` comes off for the lookup and goes back on |
| `{{asset config.cdn.fonts}}`             | `https://fonts.asterandoak.example/inter.css` | carries a scheme — passed through                         |
| `{{asset config.cdn.insights}}`          | `//cdn.asterandoak.example/js/insights.js`    | protocol-relative — passed through                        |
| `{{asset model.badge}}`                  | the `data:` URI, verbatim                     | `data:` names no file this build wrote                    |

Two rules fall out of that table, and both are worth copying:

- **A path into the build takes `{{root}}`; a URL that names its own origin does not.** `{{asset}}`
  renders a build path site-relative and unprefixed, so the template supplies the base — but a
  `https://`, `//host/…` or `data:` reference has no base to climb back to, and prefixing one with
  `{{root}}` breaks it on every page below the root.
- **Wrapping an external URL in `{{asset}}` is not pointless.** It means a template — or a partial
  fed by a model that may name either a local file or a CDN — never has to branch on where a file
  lives. The ones kiss owns are checked against the build (a path no copy emitted **fails the
  build**, rather than shipping a 404), and the rest are handed back untouched.

A `?query` behaves like a `#fragment`: it is split off before the lookup and re-appended after,
and an explicit `?v=…` suppresses the one `assets.version` would have added. `data:`, `mailto:`
and a protocol-relative `//host/…` were all once mistaken for build paths precisely because the
first two have no `//` and the third has no scheme.

The sprite is the one shape with a runtime caveat, and it is the browser's rather than kiss's: an
external `<use href="sprite.svg#id">` only resolves when the page is **served**. `--dev` serves it;
opened straight off the file system it silently draws nothing.

## What to copy

The `assets.pipeline` block in `router.js`. For Tailwind it is the same shape with
your real command:

```js
assets: {
  pipeline: [
    {
      name: 'tailwind',
      run: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify',
      watch: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify --watch=always',
    },
  ],
}
```

Two things worth copying with it. **Write into the site's source tree**, not into the build
folder: the step's output is then an ordinary asset, copied (and cache-busted, if
`assets.hash` is on) like any other, and `npx kiss-ssg check` can run the pipeline without
having anything extra to throw away. And **use the environment kiss hands each command** —
`KISS_ASSETS`, `KISS_BUILD`, `KISS_DEV` — rather than repeating paths the config already
knows, which is what `tools/tokens.js` does with `KISS_ASSETS`.

A step that exits non-zero fails the build: `complete()` rejects, the failure is named
`<pipeline: tokens>`, and `report().pipeline` carries `{ name, ok, duration }` for every step.
The pages and the asset copy still run, so one broken tool never hides the rest of the build.
