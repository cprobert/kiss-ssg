const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './3-pages',
    build: '../public/3-pages',
  },
  dev: true,
})
  .pages({
    view: 'course.hbs',
    model: 'https://learna-cms.herokuapp.com/courses',
    controller: ({ model }) => {
      return {
        slug: model.slug,
        model: model,
      }
    },
    path: 'courses',
  })
  .complete(function (data) {
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
      slug: 'courses',
    })
  })
