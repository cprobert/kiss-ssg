// The consent fixture site: a layout wired the way the guide says, a home page
// that gates GTM, a statistics script and a YouTube embed, and the cookie and
// privacy pages. Shared by `test/integration/consent.test.js` and the browser
// suite (slice 4), so both prove the same site.

export const CONSENT_LAYOUT = [
  '<!doctype html><html lang="en"><head>',
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
  '{{consentHead}}',
  '<title>{{#block "name"}}{{/block}}</title>',
  '</head><body>',
  '{{consentBanner}}',
  '<main>{{#block "body"}}{{/block}}</main>',
  '<footer>{{consentSettings}} <a href="{{link "cookies"}}">Cookies</a></footer>',
  '</body></html>',
].join('')

/** @param {string} body @param {string} [name] */
export const consentPage = (body, name = 'Page') =>
  `{{#extend "layout"}}{{#content "name"}}${name}{{/content}}{{#content "body"}}${body}{{/content}}{{/extend}}`

export const CONSENT_FILES = {
  'src/layouts/layout.hbs': CONSENT_LAYOUT,
  'src/pages/index.hbs': consentPage(
    [
      '<h1>Home</h1>',
      '{{consentScript "gtm"}}',
      '{{#consentScript "stats"}}<script src="/js/stats.js" async></script><script>window.statsReady = true</script>{{/consentScript}}',
      '<p>A video.</p>',
      '{{embed "youtube" id="abc123" title="Our video"}}',
    ].join(''),
    'Home',
  ),
  'src/pages/cookies.hbs': consentPage(
    '<h1>Cookies</h1>{{consentTable}}',
    'Cookies',
  ),
  'src/pages/privacy.hbs': consentPage('<h1>Privacy</h1>', 'Privacy'),
  'src/assets/js/stats.js': 'window.statsLoaded = true',
}

export const CONSENT_CONFIG = {
  services: {
    gtm: { id: 'GTM-TEST' },
    stats: {
      category: 'statistics',
      label: 'Visit counter',
      provider: 'This site',
      cookies: ['_st', '_st_*'],
    },
    youtube: {},
  },
}
