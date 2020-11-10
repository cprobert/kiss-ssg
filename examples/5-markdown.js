const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './5-markdown',
    build: '../public/5-markdown',
  },
  verbose: true,
  dev: true,
}).page({
  view: 'index.hbs',
  model: {
    markdown: '## Im markdown pulled from a model',
    partials: {
      dynamic: 'dynamic',
    },
  },
})
