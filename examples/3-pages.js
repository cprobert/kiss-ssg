const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './3-pages',
    build: '../public/3-pages',
    assets: null,
    layouts: null,
    models: null,
    controllers: null,
    partials: null,
  },
  addPagesOnGenerate: false,
  verbose: true,
  dev: true,
})
  .pages({
    view: 'courses/course.hbs',
    model: 'https://learna-cms.herokuapp.com/courses',
    controller: ({ model }) => {
      return {
        slug: model.slug,
        model: model,
      }
    },
    path: 'courses',
  })
  .generate(function (data) {
    // data is an array of models from all promises
    // this.getModelByID is a helper to rehydrate the model on completion
    const courseModel = this.getModelByID(
      'https://learna-cms.herokuapp.com/courses',
      data
    )
    // It can then be reused for pages such as indexes
    this.page({
      model: courseModel,
      view: 'courses/index.hbs',
      controller: ({ model }) => {
        return {
          title: 'List of courses',
          model: model,
        }
      },
      slug: 'index',
    }).generate(function () {
      this.scan()
      this.viewStats()
    })
  })
