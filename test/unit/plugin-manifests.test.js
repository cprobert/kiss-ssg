import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const PLUGIN_DIR = 'plugins/kiss-ssg'
const PACKAGE_PREFIX = 'node_modules/kiss-ssg/'
// npm packs these three whatever `files` says, so a skill may cite them even
// though they are not listed.
const ALWAYS_PACKED = ['package.json', 'README.md', 'LICENSE']

function parseJson(relative) {
  const raw = fs.readFileSync(path.join(root, relative), 'utf8')
  try {
    return { value: JSON.parse(raw), error: null }
  } catch (error) {
    return { value: null, error }
  }
}

// Minimal `---`-delimited frontmatter reader: one `key: value` per line, which
// is all a SKILL.md header is. Not a YAML parser.
function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return fields
}

// Every inline-code span in the file. Skills cite shipped files as
// `node_modules/kiss-ssg/…`, and those are the ones that have to resolve.
function citedPackagePaths(file) {
  const text = fs.readFileSync(file, 'utf8')
  return [...text.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1].trim())
    .filter((cited) => cited.startsWith(PACKAGE_PREFIX))
    .map((cited) => cited.slice(PACKAGE_PREFIX.length).replace(/\/$/, ''))
}

const pkg = parseJson('package.json')
const marketplace = parseJson('.claude-plugin/marketplace.json')
const plugin = parseJson(`${PLUGIN_DIR}/.claude-plugin/plugin.json`)

const skillsDir = path.join(root, PLUGIN_DIR, 'skills')
const skillNames = fs
  .readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('plugin manifests', () => {
  it('both manifests parse as JSON', () => {
    expect(marketplace.error).toBeNull()
    expect(plugin.error).toBeNull()
  })

  it('names the marketplace and its owner', () => {
    expect(marketplace.value.name).toBe('kiss-ssg')
    expect(marketplace.value.owner.name).toBeTruthy()
    expect(Array.isArray(marketplace.value.plugins)).toBe(true)
  })

  it('resolves plugins[0].source to a directory holding plugin.json', () => {
    const source = marketplace.value.plugins[0].source
    const dir = path.resolve(root, source)
    expect(fs.statSync(dir).isDirectory()).toBe(true)
    expect(fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))).toBe(
      true,
    )
  })

  // A version bump in package.json has to carry both manifests with it, or the
  // marketplace advertises a version the plugin does not claim.
  it('keeps both manifest versions in step with package.json', () => {
    expect(plugin.value.version).toBe(pkg.value.version)
    expect(marketplace.value.plugins[0].version).toBe(pkg.value.version)
  })

  it('gives the plugin a name and a description', () => {
    expect(plugin.value.name).toBe('kiss-ssg')
    expect(plugin.value.description.length).toBeGreaterThan(0)
  })
})

describe('skills', () => {
  it('ships at least one skill', () => {
    expect(skillNames.length).toBeGreaterThan(0)
  })

  it.each(skillNames)('%s: frontmatter matches its folder', (name) => {
    const fields = readFrontmatter(path.join(skillsDir, name, 'SKILL.md'))
    expect(fields).not.toBeNull()
    expect(fields.name).toBe(name)
    expect(fields.description ?? '').not.toBe('')
  })

  // A skill that cites a path the tarball does not ship sends the agent to a
  // file that is not there — the whole point of pointing at llms.txt rather
  // than restating it.
  it.each(skillNames)('%s: every cited package path exists', (name) => {
    const file = path.join(skillsDir, name, 'SKILL.md')
    const missing = citedPackagePaths(file).filter(
      (relative) => !fs.existsSync(path.join(root, relative)),
    )
    expect(missing).toEqual([])
  })

  it.each(skillNames)('%s: every cited package path is packed', (name) => {
    const file = path.join(skillsDir, name, 'SKILL.md')
    const packed = [...pkg.value.files, ...ALWAYS_PACKED]
    const unpacked = citedPackagePaths(file).filter(
      (relative) => !packed.includes(relative.split('/')[0]),
    )
    expect(unpacked).toEqual([])
  })
})
