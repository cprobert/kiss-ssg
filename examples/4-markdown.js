const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './4-markdown',
    build: '../public/4-markdown',
  },
  verbose: false,
}).page({
  view: 'index.hbs',
  model: {
    partials: {
      dynamic: 'hb',
      markdown: 'md',
    },
  },
})
