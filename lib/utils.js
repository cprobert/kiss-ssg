import { createHash } from 'node:crypto'
import { globSync } from 'glob'

export function trimLines(lines) {
  let text = ''
  lines.split('\n').forEach((line) => {
    text = text + line.trim() + '\n'
  })
  return text
}

export function toSlug(slug) {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[\W_]+/g, '-')
}

export function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function trimPath(path) {
  if (path.startsWith('/')) path = path.substring(1)
  if (path.endsWith('/')) path = path.substring(0, path.length - 1)
  return path
}

export function sanitizePath(path) {
  if (!path) return path
  return trimPath(path)
    .split('/')
    .map((segment) => toSlug(segment).trim())
    .join('/')
}

// glob v9+ strips a leading `./` from the paths it returns, while every
// `config.folders.*` default carries one — so a caller slicing the folder off a
// result would slice the wrong number of characters. Normalising both sides
// through this is what keeps that arithmetic honest.
export function posixPath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

// glob v7 returned results sorted; v9+ returns them in filesystem walk order,
// which would make page order, partial registration order and sitemap order
// depend on the machine. Sorting here keeps a build deterministic.
export function globFiles(pattern) {
  return globSync(posixPath(pattern)).map(posixPath).sort()
}

export function hashId(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return createHash('md5').update(text).digest('hex')
}

const utils = {
  trimLines,
  toSlug,
  toTitleCase,
  trimPath,
  sanitizePath,
  posixPath,
  globFiles,
  hashId,
}
export default utils
