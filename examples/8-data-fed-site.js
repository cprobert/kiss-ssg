import Kiss from '../lib/kiss.js'
import {
  sharedFolders,
  site,
  script,
  reportBuildFailure,
} from './_shared/site.js'
import {
  missingFields,
  slugFor,
} from './8-data-fed-site/controllers/stockist.js'

const dev = process.argv.includes('--dev')

// `'atomic'` is what a publishing pipeline wants — and it is why this run,
// which fails one page on purpose, would publish nothing at all: a failed
// build discards the staging folder and leaves the last good output untouched.
// Pass --atomic to watch that happen. The default is a plain clean build so
// the five good pages are on disk to look at after the failure.
const cleanBuild = process.argv.includes('--atomic') ? 'atomic' : true

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [{ href: 'index.html', label: 'Where to buy' }],
  folders: {
    src: './8-data-fed-site',
    build: '../public/8-data-fed-site',
    // The knowledge base is source, not output: it lives beside the site's own
    // files, survives cleanBuild, and is committed. Not derived from `src`,
    // which is why it is named here rather than picked up with the rest.
    aikb: './8-data-fed-site/AIKB',
    ...sharedFolders,
  },
  siteUrl: 'https://asterandoak.example',
  // The layout asks for `css/site.css`; the config decides it ships as
  // css/site.<hash>.css. No template changes when the policy does.
  assets: { hash: true },
  cleanBuild,
  verbose: true,
  dev,
  port: 3008,
  livereloadPort: 35738,
})

kiss
  // The fan-out: one JSON file per stockist in models/stockists, one page each
  // from a single view. Adding the seventh shop means writing the seventh file.
  .pages({
    view: 'stockists/stockist.hbs',
    model: 'stockists',
    // .pages() takes the output folder from `path`; it does not infer one.
    path: 'stockists',
    // A controller file, resolved by name from folders.controllers. It
    // validates the record and derives the slug — the two jobs a feed-fed
    // fan-out always has. One bad record fails only its own page, and
    // complete() names it `stockists/stockist.hbs [item N: <slug>]`.
    controller: 'stockist.js',
  })
  // The index reads the same folder and reports against the same validator, so
  // it can say which record is broken instead of quietly omitting it.
  .page({
    view: 'index.hbs',
    title: 'Where to buy',
    model: 'stockists',
    controller: ({ model }) => ({
      model: {
        stocked: model
          .filter((record) => missingFields(record).length === 0)
          .map((record) => ({ ...record, slug: slugFor(record) })),
        incomplete: model
          .filter((record) => missingFields(record).length > 0)
          .map((record) => ({
            name: record.name ?? '(unnamed)',
            key: record.slug ?? '(no slug)',
            missing: missingFields(record).join(', '),
          })),
      },
    }),
  })
  .generate()
  .sitemap()
  // The build writes down what it knows: the pages, the fan-out's model and
  // controller, the partials each page rendered. What it cannot know — why the
  // controller throws instead of skipping — is the authored half, in
  // 8-data-fed-site/AIKB/notes/controllers/stockist.md. The report says which
  // subjects still have no note; a failed build writes the folder too, which is
  // how this example ships one.
  .aikb()

if (!dev) {
  // Without this await a broken feed exits 0 and ships a site with a hole in
  // it. reportBuildFailure prints each failure and sets the exit code.
  await kiss.complete().catch(reportBuildFailure)
}
