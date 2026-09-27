// Tier 1 of the build-script convention (llms.txt § The build script), and the
// only reference example that reaches it. This router registers one custom
// helper, and **one is the trigger** — not three, not a proportion of the file.
// A helper registered inline here could not be imported, so it could not be
// unit-tested, and that is as true of the first helper as of the fourth. It
// lives in helpers/ with the pure function exported and the registrar a thin
// adapter over it; the folder cost one file and one import.
import { existsSync } from 'node:fs'
// `utils` is a named export in v2, not `kiss-ssg/libs/utils.js`.
import Kiss, { utils } from 'kiss-ssg'

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

// Named once, because the page below reports it: under `npx kiss-ssg check` and
// `npx kiss-ssg aikb` the engine builds into a staging sibling with a random
// name, so `kiss.config.folders.build` is not the same string twice.
const buildFolder = './public'

const kiss = new Kiss({
  site,
  nav: [{ href: 'index.html', label: 'The recipes' }],
  // v2 reads these folder keys and no others. `root` and `static` were in the
  // v1 defaults but no module ever read them, so they are gone rather than
  // quietly ignored — a `root:` key here would just sit there unread.
  folders: {
    build: buildFolder,
    // The knowledge base is source, not output: it lives beside the site's own
    // files, survives cleanBuild, and is committed. Not derived from `src`,
    // which is why it is named here rather than picked up with the rest.
    // Nothing here writes it — `npx kiss-ssg aikb 9-migrated-from-v1.js` does,
    // from a build that passed. An ordinary build only reports on it.
    aikb: './AIKB',
  },
  // Where the site will live. The layout's share card (`og:image`) has to be an
  // absolute URL — a scraper never resolves a relative one — and this is what
  // `absUrl` joins it onto; `{{canonical}}` reads it too.
  siteUrl: 'https://asterandoak.example',
  verbose: true,
  dev,
  port: 3009,
  livereloadPort: 35739,
})

// The site's custom helpers are in helpers/ because it has one and one is the
// trigger. There is no call to make: `config.folders.helpers` defaults to
// `./helpers`, and kiss imports that folder's index.js and calls its
// registerHelpers export itself. The v1 trap they replace — a helper reading
// the global handlebars module, which renders nothing at all, silently, on a
// green build — is explained where the helper now lives.

// Two sources, one output folder. v1 wrote whichever page came last when two
// claimed one path; v2 fails the build. Dedupe before registering — the
// catalogue owns its slugs, and the bench lots yield.
const catalogue = [
  {
    name: 'Arch Blend',
    origin: 'Brazil and Peru',
    note: 'The house espresso.',
  },
  {
    name: 'Guji Uraga',
    origin: 'Ethiopia',
    note: 'Peach, jasmine, a lot of it.',
  },
]
const benchLots = [
  {
    name: 'Guji Uraga',
    origin: 'Ethiopia',
    note: 'A second sample of the same lot, roasted lighter.',
  },
  {
    name: 'Oak Cascara',
    origin: 'Bolivia',
    note: 'Cherry husk, steeped like tea. Still an experiment.',
  },
]
const claimed = new Set(catalogue.map((item) => utils.toSlug(item.name)))
const benchToBuild = benchLots.filter(
  (item) => !claimed.has(utils.toSlug(item.name)),
)
const dropped = benchLots.filter((item) => claimed.has(utils.toSlug(item.name)))

// Post-build work lives in a function, not only in complete()'s callback: a
// failed build never runs that callback, so the catch has to run it too.
const finish = (outcome) =>
  console.log(`post-build step ran after a ${outcome} build`)

kiss
  // Every page says what it is about in its own `description`, which the
  // layout's meta tag reads; the site tagline is only the fallback.
  .page({
    view: 'index.hbs',
    title: 'The recipes',
    description:
      'Every kiss-ssg v1 to v2 migration recipe, as one site that builds clean.',
  })
  .page({
    view: 'await-complete.hbs',
    title: 'Awaiting complete()',
    description:
      'Await complete() and catch it, or a build with missing pages still exits 0.',
  })
  .page({
    view: 'folders.hbs',
    title: 'The folders v2 reads',
    description:
      'The folder keys v2 reads, and where v1’s unread root and static keys went.',
    // The resolved folders, straight off the instance — the page cannot claim
    // a key the engine does not have. `build` is the exception, and deliberately
    // so: a staged run (check, or a record) is building into a sibling folder
    // whose name is different every time, and a page that rendered it would
    // change its own bytes on every run — the one thing a committed knowledge
    // base cannot have. So the page names the folder the site asked for.
    model: {
      folders: Object.entries(kiss.config.folders).map(([key, value]) => ({
        key,
        value: key === 'build' ? buildFolder : value,
      })),
    },
  })
  .page({
    view: 'handlebars-instance.hbs',
    title: 'One Handlebars per instance',
    description:
      'Helpers and partials belong to kiss.handlebars, not the global handlebars module.',
    model: { stock: '12 kg', roasted: '2 March' },
  })
  .page({
    view: 'dynamic-partials.hbs',
    title: 'Dynamic partials',
    description:
      'Guarding a dynamic partial whose name comes from the model and may be undefined.',
    model: {
      blocks: [
        { label: 'Stock note', partial: 'stock-note' },
        { label: 'Sourcing note', partial: 'sourcing-note' },
        // No `partial` key at all — the shape that used to render an empty
        // string on a green v1 build.
        { label: 'Roastery note' },
      ],
      stock: '12 kg',
      roasted: '2 March',
    },
  })
  .page({
    view: 'duplicate-paths.hbs',
    title: 'Two sources, one path',
    description:
      'Two fan-outs into one folder: dedupe the slugs before registering either.',
    model: {
      catalogue: catalogue.map((item) => ({
        ...item,
        slug: utils.toSlug(item.name),
      })),
      built: benchToBuild.map((item) => ({
        ...item,
        slug: utils.toSlug(item.name),
      })),
      dropped: dropped.map((item) => ({
        ...item,
        slug: utils.toSlug(item.name),
      })),
    },
  })
  .page({
    view: 'pure-controllers.hbs',
    title: 'Controllers that return',
    description:
      'Controllers return new values rather than mutating the model they were handed.',
    model: {
      pours: [
        { name: 'V60', ratio: '15 g : 250 g' },
        { name: 'Cafetiere', ratio: '60 g : 1000 g' },
      ],
    },
    // Returns new values. The v1 habit — `model.pours.push(...)` — survives
    // into the next rebuild here, because a plain object model is replayed
    // from a snapshot of this call rather than re-read from disk.
    controller: ({ model }) => ({
      model: {
        ...model,
        pours: model.pours.map((pour, index) => ({
          ...pour,
          step: index + 1,
        })),
        count: model.pours.length,
      },
    }),
  })
  .page({
    view: 'smaller-changes.hbs',
    title: 'The smaller changes',
    description:
      'Node 22.12, ESM, the utils named export and the other one-line v2 changes.',
  })
  .pages({
    view: 'shelf/item.hbs',
    path: 'shelf',
    model: catalogue,
    controller: 'shelf-item.js',
  })
  .pages({
    view: 'shelf/item.hbs',
    path: 'shelf',
    model: benchToBuild,
    controller: 'shelf-item.js',
  })
  // What the host serves for a URL the site does not have — `404.html` at the
  // build root. Not content to index, so it stays out of any sitemap.
  .page({
    view: '404.hbs',
    title: 'Page not found',
    description: 'This page is not on the Aster & Oak migration site.',
    ignoreSitemap: true,
  })
  // v2 fires this after the files are written, so a callback can read them.
  .generate(function () {
    const written = existsSync('./public/index.html')
    console.log(
      `generate: index.html on disk when the callback ran: ${written}`,
    )
    // Dev only: under `verbose` it writes debug.json — every page's options
    // and model — into the build, which a published site should not carry.
    if (dev) this.viewStats()
  })

await kiss
  .complete(() => finish('successful'))
  .catch((err) => {
    reportBuildFailure(err)
    finish('failed')
  })
