import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  LLMS_IMPORT,
  PLUGINS,
  STARTER_MARKER,
  STARTER_RENAMES,
  packageName,
  parseInitArgs,
  planInit,
  describeAction,
  nextSteps,
  FIRST_PROMPT,
} from '../../lib/init.js'

const STARTER = {
  'router.js': `// ${STARTER_MARKER}\nimport Kiss from 'kiss-ssg'\n`,
  gitignore: 'node_modules/\npublic/\n',
  'src/pages/index.hbs': '<h1>hi</h1>\n',
}

const state = (over = {}) => ({
  folderName: 'my-site',
  version: '2.7.0',
  install: true,
  hasEngine: false,
  hasRouter: false,
  hasSrc: false,
  starter: STARTER,
  ...over,
  files: {
    'package.json': null,
    'CLAUDE.md': null,
    'AGENTS.md': null,
    '.claude/settings.json': null,
    ...(over.files ?? {}),
  },
})

const byPath = (actions, p) => actions.find((a) => a.path === p)
const json = (action) => JSON.parse(action.content)

describe('parseInitArgs', () => {
  it('installs by default', () => {
    expect(parseInitArgs([])).toEqual({
      install: true,
      help: false,
      error: null,
    })
  })
  it('--no-install skips the install', () => {
    expect(parseInitArgs(['--no-install']).install).toBe(false)
  })
  it('--help asks for help', () => {
    expect(parseInitArgs(['--help']).help).toBe(true)
  })
  it('rejects anything else, including a script', () => {
    expect(parseInitArgs(['router.js']).error).toMatch(/router\.js/)
    expect(parseInitArgs(['--force']).error).toMatch(/--force/)
  })
})

describe('packageName', () => {
  it.each([
    ['my-site', 'my-site'],
    ['My Site', 'my-site'],
    ['_draft', 'draft'],
    ['..', 'kiss-site'],
    ['Café & Bar', 'caf-bar'],
  ])('%s → %s', (input, out) => expect(packageName(input)).toBe(out))
})

describe('planInit on an empty folder', () => {
  const actions = planInit(state())

  it('creates package.json as an ES module with build, dev and check scripts', () => {
    const pkg = json(byPath(actions, 'package.json'))
    expect(pkg).toMatchObject({
      name: 'my-site',
      private: true,
      type: 'module',
      scripts: {
        build: 'node router.js',
        dev: 'node router.js --dev',
        check: 'kiss-ssg check router.js',
      },
    })
  })

  it('writes the starter, renaming gitignore to .gitignore', () => {
    expect(byPath(actions, 'router.js').content).toContain(STARTER_MARKER)
    expect(byPath(actions, '.gitignore').verb).toBe('create')
    expect(byPath(actions, 'gitignore')).toBeUndefined()
    expect(byPath(actions, 'src/pages/index.hbs').kind).toBe('write')
  })

  it('imports llms.txt from CLAUDE.md and points AGENTS.md at it', () => {
    expect(byPath(actions, 'CLAUDE.md').content).toContain(LLMS_IMPORT)
    expect(byPath(actions, 'AGENTS.md').content).toContain(
      'node_modules/kiss-ssg/llms.txt',
    )
  })

  it('declares the marketplace and both plugins at project scope', () => {
    const settings = json(byPath(actions, '.claude/settings.json'))
    expect(settings.extraKnownMarketplaces['kiss-ssg']).toEqual({
      source: { source: 'github', repo: 'cprobert/kiss-ssg' },
    })
    for (const p of PLUGINS) expect(settings.enabledPlugins[p]).toBe(true)
  })

  it('installs its own version, last', () => {
    expect(actions.at(-1)).toEqual({ kind: 'install', spec: 'kiss-ssg@2.7.0' })
  })
})

describe('planInit never destroys anything', () => {
  it('skips the install when the engine is there, or with --no-install', () => {
    expect(
      planInit(state({ hasEngine: true })).some((a) => a.kind === 'install'),
    ).toBe(false)
    const skipped = planInit(state({ install: false }))
    expect(skipped.some((a) => a.kind === 'install')).toBe(false)
    expect(byPath(skipped, 'node_modules/kiss-ssg').reason).toMatch(
      /npm install --save-dev kiss-ssg/,
    )
  })

  it('leaves an existing site alone: no starter file when router.js exists', () => {
    const actions = planInit(state({ hasRouter: true }))
    expect(
      actions.filter(
        (a) =>
          a.kind === 'write' && a.path in { 'router.js': 1, '.gitignore': 1 },
      ),
    ).toEqual([])
    expect(byPath(actions, 'router.js')).toMatchObject({ kind: 'skip' })
  })

  it('leaves an existing site alone: no starter file when src/ exists', () => {
    const actions = planInit(state({ hasSrc: true }))
    expect(byPath(actions, 'src/pages/index.hbs')).toBeUndefined()
    expect(byPath(actions, 'router.js').kind).toBe('skip')
  })

  it('merges package.json without replacing a key the site already set', () => {
    const existing = JSON.stringify({
      name: 'theirs',
      version: '1.0.0',
      type: 'module',
      scripts: { build: 'node build.js', test: 'vitest' },
      dependencies: { x: '1' },
    })
    const action = byPath(
      planInit(state({ files: { 'package.json': existing } })),
      'package.json',
    )
    expect(action.verb).toBe('merge')
    const pkg = json(action)
    expect(pkg.name).toBe('theirs')
    expect(pkg.dependencies).toEqual({ x: '1' })
    expect(pkg.scripts).toEqual({
      build: 'node build.js',
      test: 'vitest',
      dev: 'node router.js --dev',
      check: 'kiss-ssg check router.js',
    })
    expect(action.detail).toMatch(/kept scripts\.build/)
  })

  it('keeps "type": "commonjs" and says router.js will not run', () => {
    const existing = JSON.stringify({ name: 'x', type: 'commonjs' })
    const action = byPath(
      planInit(state({ files: { 'package.json': existing } })),
      'package.json',
    )
    expect(json(action).type).toBe('commonjs')
    expect(action.detail).toMatch(/"type": "module"/)
  })

  it.each(['package.json', '.claude/settings.json'])(
    'skips a %s that is not valid JSON rather than overwrite it',
    (file) => {
      const action = byPath(
        planInit(state({ files: { [file]: '{ nope' } })),
        file,
      )
      expect(action.kind).toBe('skip')
      expect(action.reason).toMatch(/not valid JSON/)
    },
  )

  it('merges settings.json, keeping other plugins and a plugin the user turned off', () => {
    const existing = JSON.stringify({
      permissions: { allow: ['Bash(npm test)'] },
      enabledPlugins: {
        'other@elsewhere': true,
        'kiss-memory@kiss-ssg': false,
      },
    })
    const settings = json(
      byPath(
        planInit(state({ files: { '.claude/settings.json': existing } })),
        '.claude/settings.json',
      ),
    )
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test)'] })
    expect(settings.enabledPlugins).toEqual({
      'other@elsewhere': true,
      'kiss-memory@kiss-ssg': false,
      'kiss-ssg@kiss-ssg': true,
    })
  })

  it('appends the import to a CLAUDE.md with no trailing newline, on its own line', () => {
    const action = byPath(
      planInit(state({ files: { 'CLAUDE.md': '# Mine\nrules' } })),
      'CLAUDE.md',
    )
    expect(action.verb).toBe('append')
    expect(action.content).toBe(`# Mine\nrules\n\n${LLMS_IMPORT}\n`)
  })

  it('an initialised folder plans nothing but skips', () => {
    const first = planInit(state({ hasEngine: true }))
    const written = Object.fromEntries(
      first.filter((a) => a.kind === 'write').map((a) => [a.path, a.content]),
    )
    const again = planInit(
      state({
        hasEngine: true,
        hasRouter: true,
        hasSrc: true,
        files: {
          'package.json': written['package.json'],
          'CLAUDE.md': written['CLAUDE.md'],
          'AGENTS.md': written['AGENTS.md'],
          '.claude/settings.json': written['.claude/settings.json'],
        },
      }),
    )
    expect(again.every((a) => a.kind === 'skip')).toBe(true)
  })
})

describe('describeAction', () => {
  it('prints one aligned line per action', () => {
    expect(
      describeAction({
        kind: 'write',
        path: 'router.js',
        content: '',
        verb: 'create',
      }),
    ).toBe('  create   router.js')
    expect(
      describeAction({
        kind: 'skip',
        path: 'CLAUDE.md',
        reason: 'already imports llms.txt',
      }),
    ).toBe('  skip     CLAUDE.md — already imports llms.txt')
    expect(describeAction({ kind: 'install', spec: 'kiss-ssg@2.7.0' })).toBe(
      '  install  kiss-ssg@2.7.0',
    )
  })
})

describe('nextSteps', () => {
  it('always ends on the prompt to paste', () => {
    for (const probeOffered of [true, false])
      expect(nextSteps({ probeOffered })).toContain(FIRST_PROMPT)
  })
  it('names the project-scope install commands when plugins are not offered', () => {
    expect(nextSteps({ probeOffered: false })).toContain(
      'claude plugin install kiss-ssg@kiss-ssg --scope project',
    )
  })
})

describe('the shipped starter', () => {
  const dir = path.resolve(import.meta.dirname, '../../starter')
  it('carries the marker kiss-site-new reads', () => {
    expect(fs.readFileSync(path.join(dir, 'router.js'), 'utf8')).toContain(
      STARTER_MARKER,
    )
  })
  it('ships its ignore file without the dot, which npm would drop', () => {
    expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(false)
    for (const from of Object.keys(STARTER_RENAMES))
      expect(fs.existsSync(path.join(dir, from))).toBe(true)
  })
})
