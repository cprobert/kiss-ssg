const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './1-scan',
    build: '../public/1-scan',
  },
  verbose: true,
  dev: true,
})
  .scan()
  .generate()
