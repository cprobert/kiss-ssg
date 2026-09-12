import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
// In a project that depends on the package this is `import { utils } from 'kiss-ssg'`.
import { utils } from '../../../lib/kiss.js'
import { tagUrl } from './tag.js'

// The record's contract, in one place: the fan-out enforces it here and the
// build script reads the same folder through `loadPosts` below, so the listing
// and the post pages can never disagree about what a post is.
export const REQUIRED_FIELDS = ['title', 'slug', 'date', 'summary', 'body']

export function missingFields(record) {
  return REQUIRED_FIELDS.filter(
    (field) =>
      typeof record?.[field] !== 'string' || record[field].trim() === '',
  )
}

// The record's `slug` is the URL, not its filename: the files are dated so they
// sort in a folder listing, and a date in a URL is a decision nobody wants to
// take back later.
export const slugFor = (record) => utils.toSlug(record.slug)

// One derivation, used by the post page, the listing, the tag pages and the
// home page. A second copy of this line is how a site starts linking to pages
// it does not build.
export const urlFor = (record) => `/blog/${slugFor(record)}/`

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Formatted from the UTC parts rather than `toLocaleDateString`, so the bytes a
// page writes do not depend on the machine's locale or time zone. A build that
// is not byte-stable cannot be diffed against the recorded one.
export function dateLabel(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * The posts folder, newest first — what the listing, the tag pages and the home
 * page are built from. The fan-out reads the same folder for itself through
 * `model: 'posts'`; this is the same records in the order a reader wants them.
 *
 * @param {string} dir the models/posts folder, relative to the cwd
 */
export function loadPosts(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

// What a post looks like everywhere it is *listed* rather than read: the shape
// the listing, the tag pages and the home page all render through one partial.
export const summaryCard = (record) => ({
  title: record.title,
  url: urlFor(record),
  date: record.date,
  dateLabel: dateLabel(record.date),
  summary: record.summary,
  tags: (record.tags ?? []).map((name) => ({ name, url: tagUrl(name) })),
})

// Controllers may `export default` in v2 (`module.exports =` still works).
export default function post({ model }) {
  const missing = missingFields(model)
  // A throw fails this one page and nothing else: the rest of the fan-out is
  // still registered and built, and complete() names this item on its own.
  if (missing.length > 0) {
    throw new Error(
      `Incomplete post — missing ${missing.join(', ')}. Fix the record, not the site.`,
    )
  }
  return {
    slug: slugFor(model),
    // `title`, `description` and `date` are set on the *page*, not left in the
    // model: they are what `.feed()` orders and titles its items by, what
    // `llms.txt` lists, and what the layout puts in <title> and the meta
    // description. A post dated only inside its model would still be found —
    // `.feed()` reads the page option first and the model second — but nothing
    // else would see it.
    title: model.title,
    description: model.summary,
    date: model.date,
    model: {
      ...model,
      url: urlFor(model),
      dateLabel: dateLabel(model.date),
      tags: (model.tags ?? []).map((name) => ({ name, url: tagUrl(name) })),
    },
  }
}
