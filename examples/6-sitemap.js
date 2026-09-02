import Kiss from '../kiss-ssg.js'
const kiss = new Kiss({
  folders: {
    src: './6-sitemap',
    build: '../public/6-sitemap',
  },
  siteUrl: 'https://example.com',
  extensionLess: true,
  verbose: true,
  dev: true,
})
  .page({ view: 'index.hbs' })
  .page({ view: 'about.hbs' })
  .page({ view: 'private.hbs', ignoreSitemap: true })
  .page({
    view: 'special.hbs',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'weekly',
  })
  .generate()
  .sitemap({}, function (urls) {
    console.log('Sitemap URLs:'.cyan, urls)
  })
