// Tier 0, at 123 lines and deliberately so: the shape here is two Kiss
// instances in sequence, which is what makes the file long. Length alone is the
// symptom; the trigger for a `helpers/` folder is helpers outgrowing the route
// table, and there are none (llms.txt § The build script).
import { existsSync, readdirSync } from 'node:fs'
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

// The "cohort" here is a season: a fresh menu built once and never rebuilt.
// It becomes a filesystem path (`folders.build`), so it has to look like a
// slug before it reaches the constructor — an empty string would resolve
// `archiveDir + '/'` to the archive's own root, and `cleanBuild` would then
// be pointed at every season that came before it.
const season = process.argv[2] || 'test'
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(season)) {
  console.error(
    `Refusing season "${season}": must be a lowercase slug, e.g. "2026-spring".`,
  )
  process.exit(1)
}

const archiveDir = './public'
const seasonDir = `${archiveDir}/${season}`

// One Kiss instance per season. `folders.build` is the only thing that
// differs between two runs of this script; `season` reaches the layout as
// `config.season` and is the only thing that differs in the rendered page.
const kiss = new Kiss({
  site,
  season,
  nav: [{ href: 'index.html', label: 'This season' }],
  folders: {
    build: seasonDir,
    // Each season must still be renderable years after the shared assets
    // folder has moved on, so it carries its own copy of the CSS rather than
    // a folder kiss would otherwise keep re-copying from a shared source.
    assets: null,
  },
  // A safe re-run: the build lands in a staging sibling and is swapped into
  // `seasonDir` only once `complete()` resolves, so a typo'd rebuild of a
  // season already shipped can never leave it half-built or wiped — see
  // README "Building more than one site from one source tree".
  cleanBuild: 'atomic',
  dev: false,
  verbose: true,
})
  .copyAssets('./src/assets', seasonDir)
  .scan()
  .generate()

await kiss.complete().catch((err) => {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
})

if (process.exitCode) process.exit()

console.log(`Season "${season}" built to: ${seasonDir}`)

// The top-level index is a second, small Kiss instance: it lists whatever
// season folders exist on disk right now and writes one file, `index.html`,
// straight into `archiveDir`. `cleanBuild: false` matters here more than
// anywhere else in these examples — the default `true` would empty
// `archiveDir` in the constructor, taking every season folder this index is
// about to list down with it.
const seasons = existsSync(archiveDir)
  ? readdirSync(archiveDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : []

const indexKiss = new Kiss({
  site,
  seasons,
  folders: {
    build: archiveDir,
    // No assets of its own: a copied stylesheet would land in `archiveDir`
    // itself and the next run's `readdirSync` above would list it as if it
    // were another season folder.
    assets: null,
  },
  cleanBuild: false,
  dev: false,
})

indexKiss
  .page({
    slug: 'index',
    title: 'Every season',
    view: `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Every season &middot; {{config.site.name}}</title>
      <style>
        body { font: 16px/1.6 system-ui, sans-serif; background: #f7f4ef; color: #23201c; margin: 0; }
        main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
        h1 { font-size: 1.6rem; }
        ul { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
        li { border: 1px solid #e5ddd2; border-radius: 10px; padding: 0.9rem 1.1rem; background: #fff; }
        a { color: #7d4526; font-weight: 600; text-decoration: none; }
      </style></head>
      <body><main><p>{{config.site.name}} &middot; {{config.site.tagline}}</p>
      <h1>Every season {{config.site.name}} has printed</h1>
      <ul>
        {{#each config.seasons}}
        <li><a href="{{this}}/index.html">{{this}}</a></li>
        {{else}}
        <li>No seasons built yet.</li>
        {{/each}}
      </ul>
      </main></body></html>`,
  })
  .generate()

await indexKiss.complete()

console.log(
  `Archive index built to: ${archiveDir}/index.html (${seasons.length} season(s))`,
)
