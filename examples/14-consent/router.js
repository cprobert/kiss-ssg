// Tier 0: one file. A consent manager is one config block and six helpers in
// the layout and pages, not code to lift out. See llms.txt § Helpers.
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
    { id: 'index', label: 'Home' },
    { id: 'roasting', label: 'Watch a roast' },
  ],
  siteUrl: 'https://asterandoak.example',
  // Every service the site loads that stores or reads anything on a visitor's
  // device, declared once. The banner, the settings dialog, the cookie table
  // and the gating on every page are all made from this block.
  consent: {
    services: {
      // The name picks the preset: the loader URL, Google's cookies, Consent
      // Mode. The id is this site's own container; replace it with yours.
      // `gtm` is `marketing` by default, because a container can load tags
      // that are not Google's and Consent Mode reaches only Google's own.
      gtm: { id: 'GTM-XXXXXXX' },
      // A first-party script is still storage on the visitor's device, so it
      // is declared like any other. No preset has this name, so it says its
      // category, and the cookie it sets, for the table.
      visits: {
        category: 'statistics',
        label: 'Visit counter',
        provider: 'Aster & Oak',
        description: 'Counts how many times this browser has visited.',
        cookies: [
          {
            name: 'ao_visits',
            duration: '1 year',
            description: 'How many times this browser has visited',
          },
        ],
      },
      youtube: {},
    },
    // No `endpoint`: nothing is sent anywhere when a visitor chooses. A site
    // whose container runs Google Ads should set one (an https URL or a path
    // on its own server that stores the POSTed choice), so it can show what a
    // visitor agreed to; the audit's `consent-records-missing` says so here.
    ui: {
      // An asset path, looked up the way {{asset}} looks one up.
      logo: 'img/logo.svg',
      // The page with {{consentRecord}}, linked from the settings dialog as
      // "See your consent history". Its id, so a page that moves keeps it.
      history: 'privacy',
      // The site's own custom properties, so the banner follows its dark
      // scheme too. A theme value is any CSS value.
      theme: {
        background: 'var(--surface)',
        text: 'var(--ink)',
        accent: 'var(--accent)',
        accentText: 'var(--on-accent)',
        border: 'var(--control)',
        radius: '12px',
      },
    },
  },
  dev,
})
  .page({
    view: 'index.hbs',
    title: site.tagline,
    description:
      'A small-batch coffee roastery in Bristol, with a cafe on the roastery floor.',
  })
  .page({
    view: 'roasting.hbs',
    title: 'Watch a roast',
    description: 'Twelve minutes in the drum, from green beans to first crack.',
  })
  // The page the banner links to: `ui.policy` is a page id, `cookies` by
  // default, and a build with no page of that id fails.
  .page({
    view: 'cookies.hbs',
    title: 'Cookies',
    description:
      'The cookies this site sets, what each is for, and for how long.',
  })
  .page({
    view: 'privacy.hbs',
    title: 'Privacy',
    description: 'What Aster & Oak does with information about you.',
  })
  .page({
    view: '404.hbs',
    title: 'Page not found',
    description: 'This page is not on the Aster & Oak site.',
    ignoreSitemap: true,
  })
  .generate()
  .sitemap()
  .llms({
    title: site.name,
    summary:
      'A small-batch coffee roastery in Bristol, with a cafe on the roastery floor.',
    sections: { root: 'Pages' },
  })
  .robots()

await kiss.complete().catch(reportBuildFailure)
