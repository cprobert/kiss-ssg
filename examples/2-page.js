const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './2-page',
    build: '../public/2-page',
  },
  verbose: true,
  dev: true,
})
  .page({
    view: 'index.hbs',
  })
  .page({
    view: 'about.hbs',
    model: 'about.json',
    controller: 'about.js',
  })
  .page({
    view: 'xml.hbs',
    ext: 'xml',
    model: { name: 'I am XML' },
    controller: ({ model }) => {
      console.log('Running inline xml controller'.cyan)
      return {
        title: model.name,
      }
    },
  })
  .page({
    view: 'Hello {{model.name}} / Hows it going',
    model: {
      name: 'world',
    },
    slug: 'hello-snippet',
  })
  .generate(function (data) {
    //console.log(data)
    console.log(this.getModelByID('about.json', data))
    // this.viewStats()
  })
