const Kiss = require('./kiss-ssg')
const hljs = require('highlight.js')
const kiss = new Kiss({
  dev: true,
  verbose: true,
  folders: {
    build: 'docs',
  },
})

kiss.scan().generate()
