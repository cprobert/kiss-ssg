// Tier 1 (llms.txt § The build script): a `config/` folder, because the
// address, the email and the phone each appeared twice in the single file this
// site was converted from. No custom helpers, so no `helpers/` folder.
//
// Nothing here is special to an imported site. That is the point of the
// example: once `tools/convert.mjs` has run and the hand pass is done, what
// you have is an ordinary kiss site, and this is an ordinary router.
import Kiss from 'kiss-ssg'
import { business, nav } from './config/site.js'

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

const kiss = new Kiss({
  business,
  nav,
  siteUrl: 'https://wholesale.asterandoak.example',
  // The artifact was one page served at one URL, so there is nothing to
  // redirect yet. When it grows a second page, `aliases` and
  // `redirects: { format: … }` are the pair to reach for — see example 11.
  links: { trailingSlash: true },
  dev,
})
  // `title` and `description` are page options, not model fields — the layout
  // reads `{{title}}`/`{{description}}`, and the audit reports a page that has
  // no description. The artifact had both in its <head>; this is where they
  // live once the <head> belongs to every page rather than to this one.
  .page({
    view: 'index.hbs',
    model: 'index.json',
    title: 'Aster & Oak — Wholesale Coffee, Bristol',
    description:
      'Small-batch coffee roasted in Bristol and delivered to cafés, kitchens and offices across the South West.',
  })
  // Added after the conversion was verified, not during it: the artifact had
  // no 404, because a single file served at one address has nowhere to get
  // lost. `ignoreSitemap` keeps it out of the sitemap it would otherwise join.
  .page({
    view: '404.hbs',
    title: 'Page not found',
    description: 'That page could not be found.',
    ignoreSitemap: true,
  })
  .generate()
  .sitemap()
  .robots()

await kiss.complete().catch(reportBuildFailure)
