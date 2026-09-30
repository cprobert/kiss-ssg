import fs from 'node:fs'
import Kiss from './lib/kiss.js'

// Builds this repository's own docs site from src/ into docs/, which GitHub
// Pages serves under /kiss-ssg/. Every internal URL goes through {{link}} or
// {{absUrl}}, so siteUrl carries that prefix and the dev server swaps in its own.
const dev = process.argv.includes('--dev')
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const kiss = new Kiss({
  dev,
  verbose: true,
  extensionLess: true,
  siteUrl: dev
    ? 'http://127.0.0.1:3001'
    : 'https://cprobert.github.io/kiss-ssg',
  // No site helpers, and no knowledge base: ./AIKB is the engine's own.
  folders: { build: 'docs', helpers: null, aikb: null },
})

kiss
  .page({
    view: 'index.hbs',
    model: 'home.json',
    title: 'Home',
    fullTitle: 'kiss-ssg: a static site generator your coding agent drives',
    description:
      'kiss-ssg is a static site generator for Node built to be driven by a coding agent: you describe the site, the agent builds it, and kiss-ssg check verifies it.',
    version,
  })
  .pages({
    view: 'guide.hbs',
    model: 'guide.json',
    controller: 'guide.js',
    path: 'guide',
    version,
  })
  .page({
    view: 'examples.hbs',
    model: 'examples.json',
    title: 'Examples',
    description:
      'Eleven runnable kiss-ssg sites that ship inside the package: whole sites to copy by situation, and short scripts that show one feature each.',
    version,
  })
  .page({
    view: '404.hbs',
    slug: '404',
    title: 'Page not found',
    description: 'There is no page at this address on the kiss-ssg docs site.',
    ignoreSitemap: true,
    config: { extensionLess: false },
    version,
  })
  .generate()
  .sitemap()
  .llms({
    title: 'kiss-ssg',
    summary:
      'A static site generator for Node built to be driven by a coding agent. The package ships its own API contract at node_modules/kiss-ssg/llms.txt; this file indexes the documentation site.',
    sections: { guide: 'Guide' },
  })

if (!dev) {
  await kiss.complete()
}
