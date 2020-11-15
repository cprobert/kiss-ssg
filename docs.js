const Kiss = require('./kiss-ssg')
const kiss = new Kiss({
  folders: {
    build: 'docs',
  },
})
  .scan()
  .generate()
