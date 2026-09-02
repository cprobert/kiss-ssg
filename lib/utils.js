import { createHash } from 'node:crypto'

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

export function hashId(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return createHash('md5').update(text).digest('hex')
}

const utils = { trimLines, toSlug, toTitleCase, trimPath, sanitizePath, hashId }
export default utils
