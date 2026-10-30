import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { FORBIDDEN_PACKED } from '../../scripts/gates.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const PACKAGE_PREFIX = 'node_modules/kiss-ssg/'
// npm packs these three whatever `files` says, so a skill may cite them even
// though they are not listed.
const ALWAYS_PACKED = ['package.json', 'README.md', 'LICENSE']
const RUBRIC_SOURCE = '.claude/skills/session-reflect/rubric.md'
const RUBRIC_COPY = 'plugins/kiss-memory/skills/kiss-branch-close/rubric.md'

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

// Every Markdown file in a skill's folder, not only its SKILL.md: a domain
// skill keeps its long material in `references/`, and a path cited there sends
// an agent to a file just as surely as one cited in SKILL.md.
function markdownIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? markdownIn(path.join(dir, e.name))
        : e.name.endsWith('.md')
          ? [path.join(dir, e.name)]
          : [],
    )
}

const everyDoc = plugins.flatMap((plugin) =>
  plugin.skills.flatMap((skill) =>
    markdownIn(path.join(root, plugin.dir, 'skills', skill)).map((file) => ({
      plugin: plugin.name,
      skill,
      file,
      pluginDir: path.join(root, plugin.dir),
      rel: path.relative(root, file).replace(/\\/g, '/'),
    })),
  ),
)

// What npm packs: a top-level entry of `files`, or a file npm always packs,
// less what the `!` entries take out again. The pack gate's own list of those,
// so the two cannot disagree; a top-level check alone passed a path under an
// example's `public/`, which never ships.
function isPacked(relative) {
  const top = relative.split('/')[0]
  if (![...pkg.value.files, ...ALWAYS_PACKED].includes(top)) return false
  return !FORBIDDEN_PACKED.some((pattern) => pattern.test(`${relative}/`))
}

// Markdown never makes a link inside code, so the link reader below drops it
// first, by CommonMark's rules: a fenced block opens on a run of three or more
// backticks or tildes (indented at most three spaces) and closes only on a run
// of the same character at least as long, on a line of its own, or at the end
// of the file; an inline code span is a backtick run closed by a run of exactly
// the same length, and never crosses a blank line, so a stray backtick hides
// nothing past its own paragraph.
function withoutCode(text) {
  const kept = []
  let fence = null
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      if (fence.test(line)) fence = null
      continue
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open) {
      fence = new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}\\s*$`)
      continue
    }
    kept.push(line)
  }
  return kept
    .join('\n')
    .replace(/(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g, '')
}

// The relative Markdown links in a skill's files, `[text](target)`. A plugin
// installs as one folder, so a target must exist and stay inside that plugin's
// folder. A skill that points at another plugin file (a domain skill at the
// shared review protocol) writes a Markdown link, never an inline-code path:
// an inline `./helpers` or `./AIKB` in these skills is a folder in the user's
// site, not a file in the plugin. A URL and an in-page `#anchor` are not
// checked here, and a `node_modules/kiss-ssg/…` path is checked above.
function brokenLinks(text, docDir, pluginDir, exists = fs.existsSync) {
  const inside = path.resolve(pluginDir) + path.sep
  const targets = [...withoutCode(text).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((t) => !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('#'))
    .map((t) => t.split('#')[0])
  return targets.filter((t) => {
    const resolved = path.resolve(docDir, t)
    return !resolved.startsWith(inside) || !exists(resolved)
  })
}

describe('what a skill may point at', () => {
  it('a path inside a folder the files list takes out again is not packed', () => {
    expect(isPacked('examples/1-scan/public/index.html')).toBe(false)
    expect(isPacked('examples/1-scan/router.js')).toBe(true)
    expect(isPacked('test/unit/x.test.js')).toBe(false)
  })

  it('a link to a missing file, or out of its plugin, is broken', () => {
    const exists = (p) => p.endsWith('there.md')
    const text = [
      '[a](../other/there.md)',
      '[b](gone.md)',
      '[c](../../../outside/there.md)',
      '[d](https://example.com/gone.md)',
      '[e](#an-anchor)',
      '`./helpers`',
    ].join(' ')
    expect(brokenLinks(text, '/p/skills/one', '/p', exists)).toEqual([
      'gone.md',
      '../../../outside/there.md',
    ])
  })

  // Markdown never makes a link inside code. Before this, a script in a
  // fenced block whose regex held `](` failed the check as a broken link
  // (kiss-information-architecture's references/measure-structure.md,
  // 2026-10-30).
  it('reads no link inside code, fenced or inline', () => {
    const exists = () => false
    const text = [
      '```js',
      `const m = html.matchAll(/href=["']([^"']*)["']/g)`,
      '[a](in-a-backtick-fence.md)',
      '```',
      '~~~',
      '[b](in-a-tilde-fence.md)',
      '~~~',
      '````md',
      '```',
      '[c](a-shorter-fence-does-not-close-it.md)',
      '````',
      'Inline: `[d](in-a-span.md)` and ``a ` then [e](in-a-double-span.md)``.',
    ].join('\n')
    expect(brokenLinks(text, '/p/skills/one', '/p', exists)).toEqual([])
  })

  it('still reads a link outside code, after a fence or a stray backtick', () => {
    const exists = () => false
    const text = [
      '```',
      'code',
      '```',
      '[a](after-a-fence.md) and `code` then [b](after-a-span.md)',
      '',
      'A stray ` backtick.',
      '',
      'Next paragraph: [c](after-a-stray-backtick.md) and one more `.',
    ].join('\n')
    expect(brokenLinks(text, '/p/skills/one', '/p', exists)).toEqual([
      'after-a-fence.md',
      'after-a-span.md',
      'after-a-stray-backtick.md',
    ])
  })

  it('reads every Markdown file in a skill folder, not only SKILL.md', () => {
    expect(everyDoc.map((d) => d.rel)).toContain(
      'plugins/kiss-memory/skills/kiss-branch-close/rubric.md',
    )
  })
})

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
  it.each(everyDoc)('$rel: every cited package path exists', ({ file }) => {
    const missing = citedPackagePaths(file).filter(
      (relative) => !fs.existsSync(path.join(root, relative)),
    )
    expect(missing).toEqual([])
  })

  it.each(everyDoc)('$rel: every cited package path is packed', ({ file }) => {
    expect(citedPackagePaths(file).filter((r) => !isPacked(r))).toEqual([])
  })

  it.each(everyDoc)(
    '$rel: every relative link lands inside its plugin',
    ({ file, pluginDir }) => {
      const text = fs.readFileSync(file, 'utf8')
      expect(brokenLinks(text, path.dirname(file), pluginDir)).toEqual([])
    },
  )
})

// The rubric ships with kiss-branch-close so a consuming site scores its reflections
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
