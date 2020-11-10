const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './5-markdown',
    build: '../public/5-markdown',
  },
  verbose: false,
}).page({
  view: 'index.hbs',
  model: {
    markdown: '## Im markdown from a model',
    partials: {
      dynamic: 'hb',
      markdown: 'md',
    },
  },
})
