import Kiss from './lib/kiss.js'

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  dev,
  verbose: true,
  folders: { build: 'docs' },
})

kiss.scan().generate()

if (!dev) {
  await kiss.complete()
}
