// In a project that depends on the package this is `import { utils } from 'kiss-ssg'`.
import { utils } from '../../../lib/kiss.js'

// The feed's contract, in one place. The page controller enforces it and the
// index reports against it, so neither can drift from the other.
export const REQUIRED_FIELDS = ['name', 'slug', 'town', 'address']

export function missingFields(record) {
  return REQUIRED_FIELDS.filter(
    (field) =>
      typeof record?.[field] !== 'string' || record[field].trim() === '',
  )
}

// The feed's key is a display name, not a URL. Deriving the slug here means the
// index and the fan-out cannot disagree about where a stockist's page lives.
export const slugFor = (record) => utils.toSlug(record.slug)

// Controllers may `export default` in v2 (`module.exports =` still works).
export default function stockist({ model }) {
  const missing = missingFields(model)
  // A throw fails this one page and nothing else: the rest of the fan-out is
  // still registered and built, and complete() names this item on its own.
  if (missing.length > 0) {
    throw new Error(
      `Incomplete stockist record — missing ${missing.join(', ')}. Fix the feed, not the site.`,
    )
  }
  return { slug: slugFor(model), title: model.name, model }
}
