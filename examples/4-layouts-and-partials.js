const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './4-layouts-and-partials',
    build: '../public/4-layouts-and-partials',
  },
  verbose: true,
  dev: true,
})
  .page({
    view: 'index.hbs',
    model: {
      name: 'World',
      partials: {
        dynamic: 'dynamic',
      },
    },
  })
  .generate()
