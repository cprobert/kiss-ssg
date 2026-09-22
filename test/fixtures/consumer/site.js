// @ts-check
// A plain-JavaScript site, type-checked against the shipped declarations.
// It must stay clean: `test/unit/types.test.js` runs `tsc --noEmit` over it, so
// anything the published types get wrong shows up as a failing test rather than
// in a consumer's editor.
import Kiss, { utils, renderRedirects } from 'kiss-ssg'

/** @type {import('kiss-ssg').KissConfigInput} */
const config = {
  siteUrl: 'https://example.com',
  cleanBuild: 'atomic',
  season: 'autumn', // an arbitrary key: reaches views as {{config.season}}
  folders: { src: './src', build: './public' },
  fetch: {
    headers: { Authorization: 'token' },
    timeout: 5000,
    cache: '.cache',
  },
  assets: { hash: true },
  // A custom redirect writer composing a shipped renderer rather than
  // reimplementing the encoding. Type-checked here on purpose: this is what
  // proves the published declarations carry the re-export, not just the
  // source.
  redirects: {
    format: (rules) => [
      { file: 'edge/_redirects', contents: renderRedirects(rules) },
    ],
  },
}

/** @type {import('kiss-ssg').KissController} */
const addTitle = ({ model }) => ({
  title: utils.toTitleCase(model.name),
  slug: utils.toSlug(model.name),
})

const kiss = new Kiss(config)

kiss
  .page({ view: 'index.hbs', title: 'Home', model: { name: 'home' } })
  .page({
    view: 'about.hbs',
    controller: addTitle,
    ignoreSitemap: true,
    ignoreLlms: true,
    llmsSection: 'Pages',
  })
  .pages({ view: 'team.hbs', model: 'team', controller: 'team.js' })
  .scan()
  .generate((data) => {
    kiss.getModelByID('team', data)
  })
  .sitemap({ overwrite: false }, (urls) => {
    urls.forEach((url) => console.log(url.loc, url.priority))
  })
  .llms(
    {
      title: 'Example',
      summary: 'What this site is.',
      sections: { root: 'Pages', team: 'The team' },
    },
    (text) => console.log(text.length),
  )

try {
  const data = await kiss.complete()
  console.log(data.length, kiss.config.folders.build, kiss.handlebars.compile)
} catch (error) {
  const failed = /** @type {import('kiss-ssg').BuildError} */ (error)
  for (const failure of failed.failures)
    console.error(failure.view, failure.buildTo, failure.error.message)
}
// The internal registry declaration must reject unknown producer kinds too.
import { OutputRegistry } from '../../../types/output-registry.js'
const outputs = new OutputRegistry({ warn: console.warn })
outputs.claim('public/test.html', 'page', 'page')
// @ts-expect-error A typo must not silently become a new precedence category.
outputs.claim('public/test.html', 'page', 'paeg')
