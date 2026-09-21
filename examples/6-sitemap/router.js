// Tier 0: one file. `.sitemap()` and `.llms()` belong in the terminal chain of
// the router itself — they are part of what the site emits, not logic to lift
// out. See llms.txt § The build script for what does leave this file.
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

const kiss = new Kiss({
  site,
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'about/index.html', label: 'About' },
    { href: 'stockists/index.html', label: 'Stockists' },
  ],
  // No `folders` block: `src: './src'` and `build: './public'` are the
  // defaults, so a site laid out the ordinary way configures nothing.
  // The sitemap needs to know where the site will live; without it kiss logs
  // an error and skips the file rather than guessing.
  siteUrl: 'https://asterandoak.example',
  // Pages build to <slug>/index.html, so every URL in the sitemap is a folder.
  extensionLess: true,
  // The only example that turns cache busting on: the shared layout's
  // `{{asset 'css/site.css'}}` renders a hashed filename here and the plain
  // path in the other five, from the same line.
  assets: { hash: true },
  verbose: true,
  dev,
})
  .page({ view: 'index.hbs' })
  .page({ view: 'about.hbs' })

  // Linked from nowhere and deliberately left out of the sitemap.
  .page({ view: 'rota.hbs', ignoreSitemap: true })

  // Changes weekly and matters less than the front page, so it says so.
  .page({
    view: 'stockists.hbs',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'weekly',
  })
  .generate()
  .sitemap({}, function (urls) {
    console.log('sitemap.xml lists:', urls)
  })

  // The sitemap's sibling: llms.txt, the llmstxt.org index an answer engine
  // reads first. Same registry, same URLs — `rota` is out of both, because a
  // page kept out of the sitemap is kept out of this too. The summary is
  // inline here; a path to a `.md` file would be read instead.
  .llms({
    title: 'Aster & Oak',
    summary:
      'A small-batch coffee roastery in Bristol. Beans, brewing notes and the shops that stock us.',
    sections: { root: 'Pages' },
    notes: 'Prices and opening hours change seasonally.',
  })

  // The third sibling, and the one that points a crawler at the other two.
  // Called bare it writes `User-agent: * / Allow: /` plus a `Sitemap:` line —
  // and that line is the point: it is built by the same join as every `<loc>`
  // above, so it names the sitemap this build actually wrote rather than a URL
  // someone typed into a static file once. Drop `.sitemap()` from this chain
  // and the line disappears rather than going stale, because advertising a
  // sitemap that does not exist is a fetch error in every crawler that reads it.
  .robots()

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
