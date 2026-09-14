import Kiss from '../lib/kiss.js'
import {
  sharedFolders,
  site,
  script,
  reportBuildFailure,
} from './_shared/site.js'

const dev = process.argv.includes('--dev')

// The tool this site builds its stylesheet with. In a real project this is
// `npx @tailwindcss/cli -i src/styles/site.css -o src/assets/css/site.css
// --minify` (and the same command with --watch); here it is a dependency-free
// stand-in so the example runs with nothing installed. Either way kiss knows
// nothing about it — it is a command line, and that is the whole contract.
//
// Two things about that real command, because kiss knowing nothing about the
// tool is exactly what makes them hard to spot (both are written up in
// README.md and llms.txt, verified on Tailwind 4.3.3):
//
//  1. Keep the `-i`. Without it the CLI still exits 0 and still writes a
//     stylesheet, but it reads a default input instead of your entry file and
//     silently drops every custom rule in it. A site whose `watch` command has
//     `-i` and whose `run` does not is correct in dev and wrong in production.
//  2. Tailwind v4 scans the WHOLE project for class names, and `@source` adds
//     to that walk rather than replacing it — so your own `.md` files are
//     scanned and an ordinary English word compiles a utility. Harmless until
//     `assets.hash: true`, where the stylesheet's hash is its filename: one
//     word typed into a README renames it and changes the `<link href>` on
//     every page. `@import 'tailwindcss' source(none)` plus explicit `@source`
//     paths (resolved against the stylesheet's folder) is the fix.
const tokens = 'node 10-asset-pipeline/tools/tokens.js'

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [{ href: 'index.html', label: 'The pipeline' }],
  folders: {
    src: './10-asset-pipeline',
    build: '../public/10-asset-pipeline',
    layouts: sharedFolders.layouts,
    partials: sharedFolders.partials,
    // Assets stay local (derived from `src`), because this is the folder the
    // pipeline step writes into: `10-asset-pipeline/assets/css/generated.css`
    // is generated, gitignored, and copied into the build like any other asset.
  },
  assets: {
    pipeline: [
      {
        name: 'tokens',
        // Runs before the asset copy, every build — so what it writes is in
        // the build folder by the time the first page renders. A non-zero exit
        // would fail the build as `<pipeline: tokens>`.
        run: tokens,
        // dev only, started once after `run` succeeded and killed by close():
        // the tool stays up and recompiles on its own, and kiss's assets
        // watcher copies each result into the build and reloads the browser.
        watch: `${tokens} --watch`,
      },
    ],
  },
  verbose: true,
  dev,
  port: 3010,
  livereloadPort: 35740,
})

// The shared look lives outside this site's own assets folder, so it comes in
// as a second copy. Copies (and the pipeline steps before them) run one after
// another in registration order, never concurrently.
kiss.copyAssets(sharedFolders.assets, '../public/10-asset-pipeline')

kiss
  .page({
    view: 'index.hbs',
    title: 'An asset pipeline',
    model: {
      command: tokens,
    },
  })
  .generate(function () {
    // `report()` is null until complete() settles; the pipeline is reported
    // there as `[{ name, ok, duration }]`.
    this.viewStats()
  })

if (!dev) {
  await kiss
    .complete(function () {
      for (const step of this.report().pipeline) {
        console.log(
          `pipeline: ${step.name} ${step.ok ? 'ok' : 'FAILED'} in ${step.duration}ms`,
        )
      }
    })
    .catch(reportBuildFailure)
}
