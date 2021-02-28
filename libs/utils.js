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
  resolve: {
    alias: function (path, config) {
      // console.log('Resolving Alias for: ', path)
      // Root Dir
      if (path.startsWith('~~/')) {
        return `${config.folders.root}/${path.substring(3, path.length)}`
      }
      // Assets Dir
      if (path.startsWith('~/assets')) {
        return `${config.folders.assets}/${path.substring(8, path.length)}`
      }
      // Src Dir
      if (path.startsWith('~/')) {
        return `${config.folders.src}/${path.substring(2, path.length)}`
      }

      return `${config.folders.assets}/${utils.stripStartingSlash(path)}`
    },
    deployAlias: function (path, config) {
      // Assets Dir
      if (path.startsWith('~/assets')) {
        return `${path.substring(8, path.length)}`
      }
      // Src Dir
      if (path.startsWith('~/')) {
        return `/${path.substring(2, path.length)}`
      }
      // console.log('No match for', path)
      return path
    },
  },
  stripStartingSlash: function (path) {
    if (path.startsWith('/')) {
      path = path.substring(1, path.length)
      path = utils.stripStartingSlash(path)
    }
    return path
  },
}

module.exports = utils
