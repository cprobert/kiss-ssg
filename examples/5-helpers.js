const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    root: '..',
    src: './5-helpers',
    build: '../public/5-helpers',
  },
  verbose: true,
  dev: true,
})
  .page({
    view: 'index.hbs',
    model: {
      markdown: '## Im markdown pulled from a model',
      partials: {
        dynamic: 'dynamic',
      },
    },
  })
  .generate(() => {
    console.log('Generated')
  })
  .complete(() => {
    console.log('Complete')
  })
