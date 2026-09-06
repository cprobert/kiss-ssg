import { existsSync } from 'node:fs'
// `utils` is a named export in v2, not `kiss-ssg/libs/utils.js`.
import Kiss, { utils } from '../lib/kiss.js'
import {
  sharedFolders,
  site,
  script,
  reportBuildFailure,
} from './_shared/site.js'

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [{ href: 'index.html', label: 'The recipes' }],
  // v2 reads these folder keys and no others. `root` and `static` were in the
  // v1 defaults but no module ever read them, so they are gone rather than
  // quietly ignored — a `root:` key here would just sit there unread.
  folders: {
    src: './9-migrated-from-v1',
    build: '../public/9-migrated-from-v1',
    layouts: sharedFolders.layouts,
    assets: sharedFolders.assets,
  },
  verbose: true,
  dev,
  port: 3009,
  livereloadPort: 35739,
})

// Handlebars is per-instance in v2: `require('handlebars').partials` is empty
// here, so a v1 helper that read the global module rendered nothing at all —
// silently, on a green build. Register on `kiss.handlebars` and read the
// partials off the same environment.
kiss.handlebars.registerHelper('renderPartial', function (name, context) {
  const partial = kiss.handlebars.partials[name]
  if (!partial) return ''
  const template =
    typeof partial === 'function' ? partial : kiss.handlebars.compile(partial)
  return new kiss.handlebars.SafeString(template(context))
})

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
  .page({ view: 'index.hbs', title: 'The recipes' })
  .page({ view: 'await-complete.hbs', title: 'Awaiting complete()' })
  .page({
    view: 'folders.hbs',
    title: 'The folders v2 reads',
    // The resolved folders, straight off the instance — the page cannot claim
    // a key the engine does not have.
    model: {
      folders: Object.entries(kiss.config.folders).map(([key, value]) => ({
        key,
        value,
      })),
    },
  })
  .page({
    view: 'handlebars-instance.hbs',
    title: 'One Handlebars per instance',
    model: { stock: '12 kg', roasted: '2 March' },
  })
  .page({
    view: 'dynamic-partials.hbs',
    title: 'Dynamic partials',
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
  .page({ view: 'smaller-changes.hbs', title: 'The smaller changes' })
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
  // v2 fires this after the files are written, so a callback can read them.
  .generate(function () {
    const written = existsSync('../public/9-migrated-from-v1/index.html')
    console.log(
      `generate: index.html on disk when the callback ran: ${written}`,
    )
    this.viewStats()
  })

if (!dev) {
  await kiss
    .complete(() => finish('successful'))
    .catch((err) => {
      reportBuildFailure(err)
      finish('failed')
    })
}
