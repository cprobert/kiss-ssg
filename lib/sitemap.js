import fs from 'fs-extra'

export function buildSitemapEntries(
  stack,
  { siteUrl, buildDir, now = new Date().toISOString() },
) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  return stack
    .filter((entry) => !entry.page.options.ignoreSitemap)
    .map((entry) => {
      const options = entry.page.options
      let urlPath = entry.buildTo.slice(buildDir.length)
      urlPath = urlPath.replace(/\.[^./]+$/, '')
      urlPath = urlPath.replace(/\/index$/, '') || '/'
      return {
        loc: `${baseUrl}${urlPath}`,
        lastmod: options.sitemapLastmod || now,
        priority: options.sitemapPriority || '1.00',
        changefreq: options.sitemapChangefreq,
      }
    })
}

export function renderSitemapXml(urls) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const url of urls) {
    xml += '  <url>\n'
    xml += `    <loc>${url.loc}</loc>\n`
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`
    if (url.changefreq)
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`
    xml += `    <priority>${url.priority}</priority>\n`
    xml += '  </url>\n'
  }
  return xml + '</urlset>'
}

export async function writeSitemap(
  stack,
  { config, logger, overwrite = true },
) {
  if (!config.siteUrl) {
    logger.error('Cannot generate sitemap.xml: config.siteUrl is not set')
    return { status: 'no-site-url', urls: null }
  }
  const buildDir = config.folders.build
  const sitemapPath = `${buildDir}/sitemap.xml`
  if (!overwrite && fs.existsSync(sitemapPath)) {
    logger.info('Skipping sitemap.xml: already exists')
    return { status: 'skipped', urls: null }
  }
  const urls = buildSitemapEntries(stack, { siteUrl: config.siteUrl, buildDir })
  await fs.outputFile(sitemapPath, renderSitemapXml(urls))
  logger.success(sitemapPath)
  return { status: 'written', urls }
}
