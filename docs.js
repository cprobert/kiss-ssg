import Kiss from './lib/kiss.js'

new Kiss({
  dev: true,
  verbose: true,
  folders: { build: 'docs' },
})
  .scan()
  .generate()
