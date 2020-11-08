const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './2-page',
    build: '../public/2-page',
  },
})
  .page({
    view: 'index.hbs',
  })
  .page({
    view: 'xml.hbs',
    ext: 'xml',
    model: { name: 'I am XML' },
  })
