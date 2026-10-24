import { createHash } from 'node:crypto'

/**
 * One page of a learning package, as its manifest lists it.
 *
 * @typedef {object} ManifestMember
 * @property {string} id the page's `id`: its item and resource identifiers come from it, so they stay the same while it does
 * @property {string} title the item's title in the table of contents
 * @property {string} href the page's path inside the package, forward slashes
 * @property {string[]} files every file the page's resource lists: the page, then the files it needs, as paths inside the package
 * @property {string} [section] a title to group the page under, with the other members of that section
 */

/**
 * A learning package, as its manifest describes it.
 *
 * @typedef {object} ManifestPackage
 * @property {string} id the package's id
 * @property {string} title the organization's title
 * @property {'imscp' | 'scorm12'} format
 * @property {ManifestMember[]} members the pages, in the order the table of contents lists them
 */

const FORMATS = {
  imscp: {
    open: '<manifest identifier="{id}" version="1.1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">',
    metadata: null,
    resource: 'type="webcontent"',
  },
  scorm12: {
    open: '<manifest identifier="{id}" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">',
    metadata: [
      '<metadata>',
      '  <schema>ADL SCORM</schema>',
      '  <schemaversion>1.2</schemaversion>',
      '</metadata>',
    ],
    resource: 'type="webcontent" adlcp:scormtype="sco"',
  },
}

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/**
 * Text or an attribute value with the five XML special characters escaped.
 *
 * @param {string} value
 * @returns {string}
 */
const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ENTITIES[/** @type {keyof typeof ENTITIES} */ (c)],
  )

/**
 * A path inside the package as a URI reference: each segment percent-encoded,
 * the slashes between them kept.
 *
 * @param {string} href
 * @returns {string}
 */
const encodeHref = (href) => href.split('/').map(encodeURIComponent).join('/')

/**
 * A valid XML ID (an NCName) for `raw` after `prefix`, the same for the same
 * `raw` whatever other ids a manifest holds and in whatever order. A raw id
 * that is already `[A-Za-z0-9_.-]+` is kept. Any other is cleaned (every run
 * of other characters becomes one `-`, and `-` at either end goes) and given
 * `-` and the first 8 hex digits of the raw id's sha1, so two ids that clean
 * alike (`a/b`, `a-b`, `a b`) stay apart. A raw id that already ends in `-`
 * and 8 hex digits is treated the same, so a kept id never looks like a
 * cleaned one: an LMS keeps learners' records by
 * these identifiers, so one must never move to another page. The prefix
 * starts with a letter, so the ID does too. With `used`, an ID already given
 * (two raw ids whose hashes collide) gets `-2`, `-3`, …: a last resort.
 *
 * @param {string} prefix
 * @param {string} raw
 * @param {Set<string>} [used]
 * @returns {string}
 */
export function xmlId(prefix, raw, used) {
  const text = String(raw)
  const clean = text.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  const base =
    clean && clean === text && !/-[0-9a-f]{8}$/.test(text)
      ? prefix + clean
      : `${prefix}${clean ? `${clean}-` : ''}${createHash('sha1').update(text).digest('hex').slice(0, 8)}`
  let id = base
  for (let n = 2; used?.has(id); n++) id = `${base}-${n}`
  used?.add(id)
  return id
}

/**
 * The `imsmanifest.xml` of a learning package, as text: an IMS content
 * package 1.1 or a SCORM 1.2 package. It is written straight into the
 * package's zip, never through the page pipeline, whose HTML minifier breaks
 * XML. The same package always gives the same text.
 *
 * Every identifier has a prefix (`MANIFEST-`, `ORG-`, `ITEM-`, `RES-`) and is
 * a valid XML ID, unique in the document. A page's item and resource
 * identifiers come from its `id`, not its path or position: an LMS matches a
 * package's items by identifier when it is uploaded again, so they must stay
 * the same while the page does.
 *
 * @param {ManifestPackage} pkg
 * @returns {string}
 */
export function renderManifest(pkg) {
  const format = FORMATS[pkg.format]
  if (!format)
    throw new Error(
      `package ${pkg.id}: unknown format ${JSON.stringify(pkg.format)} (imscp or scorm12)`,
    )
  const used = new Set()
  const manifestId = xmlId('MANIFEST-', pkg.id, used)
  const orgId = xmlId('ORG-', pkg.id, used)
  const members = pkg.members.map((m) => ({
    ...m,
    itemId: xmlId('ITEM-', m.id, used),
    resId: xmlId('RES-', m.id, used),
  }))

  // The table of contents: a member with a section goes under that section's
  // item, made where the section first appears; the rest stay where they are.
  /** @type {Array<{ section: string, id: string, members: typeof members } | (typeof members)[number]>} */
  const top = []
  /** @type {Map<string, { section: string, id: string, members: typeof members }>} */
  const sections = new Map()
  for (const m of members) {
    if (m.section == null) {
      top.push(m)
      continue
    }
    let section = sections.get(m.section)
    if (!section) {
      section = {
        section: m.section,
        id: xmlId('ITEM-SECTION-', m.section, used),
        members: [],
      }
      sections.set(m.section, section)
      top.push(section)
    }
    section.members.push(m)
  }

  /**
   * @param {(typeof members)[number]} m
   * @param {string} indent
   */
  const item = (m, indent) => [
    `${indent}<item identifier="${m.itemId}" identifierref="${m.resId}">`,
    `${indent}  <title>${escapeXml(m.title)}</title>`,
    `${indent}</item>`,
  ]

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    format.open.replace('{id}', manifestId),
  ]
  if (format.metadata) lines.push(...format.metadata.map((l) => `  ${l}`))
  lines.push(
    `  <organizations default="${orgId}">`,
    `    <organization identifier="${orgId}">`,
  )
  lines.push(`      <title>${escapeXml(pkg.title)}</title>`)
  for (const entry of top) {
    if ('members' in entry) {
      lines.push(
        `      <item identifier="${entry.id}">`,
        `        <title>${escapeXml(entry.section)}</title>`,
      )
      for (const m of entry.members) lines.push(...item(m, '        '))
      lines.push('      </item>')
    } else lines.push(...item(entry, '      '))
  }
  lines.push('    </organization>', '  </organizations>', '  <resources>')
  for (const m of members) {
    lines.push(
      `    <resource identifier="${m.resId}" ${format.resource} href="${escapeXml(encodeHref(m.href))}">`,
    )
    for (const f of m.files)
      lines.push(`      <file href="${escapeXml(encodeHref(f))}"/>`)
    lines.push('    </resource>')
  }
  lines.push('  </resources>', '</manifest>')
  return `${lines.join('\n')}\n`
}
