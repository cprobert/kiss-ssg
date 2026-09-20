// `export default` is the v2 form; `module.exports =` still works.
import { utils } from 'kiss-ssg'

export default function shelfItem({ model }) {
  return { slug: utils.toSlug(model.name), title: model.name, model }
}
