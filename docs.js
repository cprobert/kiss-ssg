import Kiss from './kiss-ssg.js'

new Kiss({
  dev: true,
  verbose: true,
  folders: { build: 'docs' },
})
  .scan()
  .generate()
