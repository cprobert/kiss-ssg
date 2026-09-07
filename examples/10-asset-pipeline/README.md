# 10 · asset pipeline

`config.assets.pipeline` runs an external tool as part of the build. Here the tool is
`tools/tokens.js` — a dependency-free stand-in for Tailwind or sass — which compiles
`styles/tokens.json` into `assets/css/generated.css`. kiss knows nothing about it: it is a
command line, run before the asset copy, and the copy picks up whatever it wrote.

## Run it

```bash
npm run eg10                   # from the repo root
node 10-asset-pipeline.js      # from examples/
node 10-asset-pipeline.js --dev  # live preview on http://127.0.0.1:3010
```

With `--dev`, the step's `watch` command is started too — once, after `run` has succeeded —
and kept for the session. Edit `styles/tokens.json` while it is up: the tool recompiles the
stylesheet, kiss's assets watcher copies it into the build, and the browser reloads.
Ctrl-C, or a `close()`, ends the watch process; nothing is left running.

## What to copy

The `assets.pipeline` block in `10-asset-pipeline.js`. For Tailwind it is the same shape with
your real command:

```js
assets: {
  pipeline: [
    {
      name: 'tailwind',
      run: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify',
      watch: 'npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css --minify --watch',
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
