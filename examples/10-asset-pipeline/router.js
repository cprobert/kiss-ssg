// Tier 0: one file. A pipeline step is config, not code to lift out — it is a
// command the router declares. See llms.txt § The build script.
import Kiss from 'kiss-ssg'

// Facts the site states more than once. Any extra key on the config reaches
// every view as `config.<key>`, which is how the layout gets the site name
// without each page carrying it in a model.
const site = {
  name: 'Aster & Oak',
  tagline: 'Small-batch coffee, roasted in Bristol',
}

// A failed build must be loud: print each failing page and exit non-zero,
// rather than exiting 0 with a page quietly missing. The recipe llms.txt shows.
function reportBuildFailure(err) {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
}

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
//     stylesheet, but it reads a default input instead of your entry file, so
//     everything you authored goes with it — components, theme tokens,
//     @font-face, plugins — leaving generic utilities. A site whose `watch`
//     command has `-i` and whose `run` does not is correct in dev and wrong in
//     production, which is how it survives unnoticed.
//  2. Tailwind v4 scans the WHOLE project for class names, and `@source` adds
//     to that walk rather than replacing it — so your own `.md` files are
//     scanned and an ordinary English word compiles a utility. Harmless until
//     `assets.hash: true`, where the stylesheet's hash is its filename: one
//     word typed into a README renames it and changes the `<link href>` on
//     every page. `@import 'tailwindcss' source(none)` plus explicit `@source`
//     paths (resolved against the stylesheet's folder) is the fix.
const tokens = 'node tools/tokens.js'

const kiss = new Kiss({
  site,
  nav: [{ href: 'index.html', label: 'The pipeline' }],
  // Two URLs this site does not host. They go through `{{asset}}` like every
  // other reference the templates emit: the helper hands back anything that
  // already names its own origin, so a template never branches on where a
  // file lives — and never prefixes `{{root}}` onto one of these, because a
  // URL that carries its own origin has no base to climb back to.
  cdn: {
    // The form to prefer: absolute, scheme and all.
    fonts: 'https://fonts.asterandoak.example/inter.css',
    // Protocol-relative — no scheme, the form a good many CDN snippets still
    // hand you. kiss passes it through untouched, so a snippet pasted from a
    // vendor works as given; `https://` is the form to write when the choice
    // is yours.
    insights: '//cdn.asterandoak.example/js/insights.js',
  },
  // No `folders` block: `src: './src'` and `build: './public'` are the
  // defaults, so a site laid out the ordinary way configures nothing.
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
kiss.copyAssets('./src/assets', './public')

kiss
  .page({
    view: 'index.hbs',
    title: 'An asset pipeline',
    model: {
      command: tokens,
      // A 16-pixel dot with no file behind it. `data:` carries no `//`, which
      // is exactly how it used to be mistaken for a path into the build and
      // fail it; it is passed through like any other reference that names no
      // file this build wrote.
      badge:
        'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%227%22%20fill%3D%22%23b4531f%22%2F%3E%3C%2Fsvg%3E',
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
