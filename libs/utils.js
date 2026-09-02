const utils = {
  trimLines(lines) {
    let text = ''
    lines.split('\n').forEach((line) => {
      text = text + line.trim() + '\n'
    })
    return text
  },
  toSlug(slug) {
    return slug
      .toLowerCase()
      .trim()
      .replace(/[\W_]+/g, '-')
  },
  toTitleCase(str) {
    return str
      .toLowerCase()
      .split(' ')
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      })
      .join(' ')
  },
  trimPath(path) {
    if (path.startsWith('/')) path = path.substring(1, path.length)
    if (path.endsWith('/')) path = path.substring(0, path.length - 1)
    return path
  },
  sanitizePath(path) {
    if (path) {
      path = this.trimPath(path)

      let pathSegments = path.split('/')
      const cleanedSegments = []
      pathSegments.forEach((segment) => {
        const slugifiedSegment = this.toSlug(segment)
        cleanedSegments.push(slugifiedSegment.trim())
      })
      path = cleanedSegments.join('/')
    }
    return path
  },
}

export default utils
