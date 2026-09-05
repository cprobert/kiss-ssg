import Kiss from '../lib/kiss.js'
const kiss = new Kiss({
  folders: {
    src: './5-helpers',
    build: '../public/5-helpers',
  },
  verbose: true,
  dev: true,
  port: 8080,
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
