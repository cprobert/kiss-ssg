import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const PACKAGE_PREFIX = 'node_modules/kiss-ssg/'
// npm packs these three whatever `files` says, so a skill may cite them even
// though they are not listed.
const ALWAYS_PACKED = ['package.json', 'README.md', 'LICENSE']
const RUBRIC_SOURCE = '.claude/skills/retrospective/rubric.md'
const RUBRIC_COPY = 'plugins/kiss-memory/skills/kiss-close/rubric.md'

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

// Everything below is driven off the marketplace, so a plugin added there is
// held to the same rules without a line of test having to be written for it.
const plugins = (marketplace.value?.plugins ?? []).map((entry) => {
  const dir = path.posix.normalize(entry.source)
  const manifestPath = `${dir}/.claude-plugin/plugin.json`
  const skillsDir = path.join(root, dir, 'skills')
  const skills = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((it) => it.isDirectory())
        .map((it) => it.name)
        .sort()
    : []
  return {
    name: entry.name,
    entry,
    dir,
    manifestPath,
    hasManifest: fs.existsSync(path.join(root, manifestPath)),
    manifest: fs.existsSync(path.join(root, manifestPath))
      ? parseJson(manifestPath)
      : { value: null, error: null },
    skills,
  }
})

const everySkill = plugins.flatMap((plugin) =>
  plugin.skills.map((skill) => ({
    plugin: plugin.name,
    skill,
    file: path.join(root, plugin.dir, 'skills', skill, 'SKILL.md'),
  })),
)

describe('marketplace', () => {
  it('parses as JSON', () => {
    expect(marketplace.error).toBeNull()
  })

  it('names the marketplace and its owner', () => {
    expect(marketplace.value.name).toBe('kiss-ssg')
    expect(marketplace.value.owner.name).toBeTruthy()
    expect(Array.isArray(marketplace.value.plugins)).toBe(true)
  })

  it('ships at least one plugin', () => {
    expect(plugins.length).toBeGreaterThan(0)
  })
})

describe.each(plugins)('plugin $name', (plugin) => {
  it('resolves its source to a directory holding plugin.json', () => {
    expect(fs.statSync(path.join(root, plugin.dir)).isDirectory()).toBe(true)
    expect(plugin.hasManifest).toBe(true)
  })

  it('parses its manifest as JSON', () => {
    expect(plugin.manifest.error).toBeNull()
  })

  it('names itself the same in the manifest and the marketplace', () => {
    expect(plugin.manifest.value.name).toBe(plugin.entry.name)
    expect(plugin.manifest.value.description.length).toBeGreaterThan(0)
    expect((plugin.entry.description ?? '').length).toBeGreaterThan(0)
  })

  // A version bump in package.json has to carry every manifest with it, or the
  // marketplace advertises a version a plugin does not claim.
  it('keeps both manifest versions in step with package.json', () => {
    expect(plugin.manifest.value.version).toBe(pkg.value.version)
    expect(plugin.entry.version).toBe(pkg.value.version)
  })

  it('ships at least one skill', () => {
    expect(plugin.skills.length).toBeGreaterThan(0)
  })
})

describe('skills', () => {
  it.each(everySkill)(
    '$plugin/$skill: frontmatter matches its folder',
    ({ skill, file }) => {
      const fields = readFrontmatter(file)
      expect(fields).not.toBeNull()
      expect(fields.name).toBe(skill)
      expect(fields.description ?? '').not.toBe('')
    },
  )

  // A skill that cites a path the tarball does not ship sends the agent to a
  // file that is not there — the whole point of pointing at llms.txt rather
  // than restating it.
  it.each(everySkill)(
    '$plugin/$skill: every cited package path exists',
    ({ file }) => {
      const missing = citedPackagePaths(file).filter(
        (relative) => !fs.existsSync(path.join(root, relative)),
      )
      expect(missing).toEqual([])
    },
  )

  it.each(everySkill)(
    '$plugin/$skill: every cited package path is packed',
    ({ file }) => {
      const packed = [...pkg.value.files, ...ALWAYS_PACKED]
      const unpacked = citedPackagePaths(file).filter(
        (relative) => !packed.includes(relative.split('/')[0]),
      )
      expect(unpacked).toEqual([])
    },
  )
})

// The rubric ships with kiss-close so a consuming site scores its reflections
// against the same seven dimensions this repo scores its own. A copy is the
// only way to ship it, so this is the thing that stops the two drifting.
describe('shipped rubric', () => {
  it('is the repo rubric verbatim, under a one-line source header', () => {
    const copy = fs.readFileSync(path.join(root, RUBRIC_COPY), 'utf8')
    const source = fs.readFileSync(path.join(root, RUBRIC_SOURCE), 'utf8')
    const firstBreak = copy.indexOf('\n')
    expect(copy.slice(0, firstBreak)).toMatch(/rubric\.md/)
    expect(copy.slice(firstBreak + 1)).toBe(source)
  })
})
