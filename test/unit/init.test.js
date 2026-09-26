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
  INIT_HELP,
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
    '.gitignore': null,
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

  it('creates package.json as an ES module pointing main and its scripts at router.js', () => {
    const pkg = json(byPath(actions, 'package.json'))
    expect(pkg).toMatchObject({
      name: 'my-site',
      private: true,
      type: 'module',
      main: 'router.js',
      scripts: {
        build: 'node router.js',
        dev: 'node router.js --dev',
        check: 'kiss-ssg check router.js',
        aikb: 'kiss-ssg aikb router.js',
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

const starterWrites = (actions) =>
  actions.filter(
    (a) =>
      a.kind === 'write' &&
      (a.path === 'router.js' ||
        a.path === '.gitignore' ||
        a.path.startsWith('src/')),
  )

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
    expect(starterWrites(actions)).toEqual([])
    expect(byPath(actions, 'router.js')).toMatchObject({ kind: 'skip' })
  })

  it('leaves an existing site alone: no starter file when src/ exists', () => {
    const actions = planInit(state({ hasSrc: true }))
    expect(starterWrites(actions)).toEqual([])
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
    expect(pkg.version).toBe('1.0.0')
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies).toEqual({ x: '1' })
    expect(pkg.scripts).toEqual({
      build: 'node build.js',
      test: 'vitest',
      dev: 'node router.js --dev',
      check: 'kiss-ssg check router.js',
      aikb: 'kiss-ssg aikb router.js',
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
          '.gitignore': written['.gitignore'],
        },
      }),
    )
    expect(again.every((a) => a.kind === 'skip')).toBe(true)
  })
})

// Found by the Codex review of this branch; each reproduced before it was fixed.
describe('planInit on a folder that already has things in it', () => {
  it('adds the starter ignores to an existing .gitignore instead of replacing it', () => {
    const action = byPath(
      planInit(state({ files: { '.gitignore': '.env\nsecrets/\npublic/\n' } })),
      '.gitignore',
    )
    expect(action.verb).toBe('append')
    expect(action.content).toBe('.env\nsecrets/\npublic/\nnode_modules/\n')
  })

  it('leaves a .gitignore alone when it already has every starter entry', () => {
    const action = byPath(
      planInit(state({ files: { '.gitignore': 'public/\nnode_modules/\n' } })),
      '.gitignore',
    )
    expect(action.kind).toBe('skip')
  })

  it.each(['dependencies', 'devDependencies'])(
    'does not reinstall over a kiss-ssg the site already declares in %s',
    (field) => {
      const actions = planInit(
        state({
          hasRouter: true,
          files: {
            'package.json': JSON.stringify({
              [field]: { 'kiss-ssg': '^1.4.0' },
            }),
          },
        }),
      )
      expect(actions.some((a) => a.kind === 'install')).toBe(false)
      expect(byPath(actions, 'node_modules/kiss-ssg').reason).toMatch(
        /\^1\.4\.0/,
      )
    },
  )

  it.each(['"keep me"', '["keep"]', 'null'])(
    'skips a package.json whose scripts is %s rather than rewrite it',
    (scripts) => {
      const action = byPath(
        planInit(
          state({ files: { 'package.json': `{"scripts":${scripts}}` } }),
        ),
        'package.json',
      )
      expect(action.kind).toBe('skip')
      expect(action.reason).toMatch(/scripts/)
    },
  )

  it.each(['enabledPlugins', 'extraKnownMarketplaces'])(
    'skips a settings.json whose %s is not an object',
    (key) => {
      const action = byPath(
        planInit(
          state({
            files: {
              '.claude/settings.json': JSON.stringify({ [key]: false }),
            },
          }),
        ),
        '.claude/settings.json',
      )
      expect(action.kind).toBe('skip')
      expect(action.reason).toMatch(key)
    },
  )

  it('keeps a marketplace entry the user set, even to null', () => {
    const settings = json(
      byPath(
        planInit(
          state({
            files: {
              '.claude/settings.json': JSON.stringify({
                extraKnownMarketplaces: { 'kiss-ssg': null },
              }),
            },
          }),
        ),
        '.claude/settings.json',
      ),
    )
    expect(settings.extraKnownMarketplaces['kiss-ssg']).toBeNull()
  })

  it('does not change the module type or main of a site whose router.js it did not write', () => {
    const pkg = json(
      byPath(
        planInit(state({ hasRouter: true, files: { 'package.json': '{}' } })),
        'package.json',
      ),
    )
    expect(pkg.type).toBeUndefined()
    expect(pkg.main).toBeUndefined()
    expect(pkg.scripts.build).toBe('node router.js')
  })

  it('adds no router.js scripts to a site that has src/ but no router.js', () => {
    const action = byPath(
      planInit(state({ hasSrc: true, files: { 'package.json': '{}' } })),
      'package.json',
    )
    expect(action.kind).toBe('skip')
    expect(action.reason).toMatch(/no router\.js/)
  })

  it('appends to a CRLF CLAUDE.md with CRLF', () => {
    const action = byPath(
      planInit(state({ files: { 'CLAUDE.md': '# Mine\r\n' } })),
      'CLAUDE.md',
    )
    expect(action.content).toBe(`# Mine\r\n\r\n${LLMS_IMPORT}\r\n`)
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
  it('includes the prompt to paste', () => {
    expect(nextSteps()).toContain(FIRST_PROMPT)
  })

  // The clean-room run asked why it was told to install plugins init had
  // just declared; the answer has to be where the question arises.
  it('says why the declared plugins still have to be installed', () => {
    expect(nextSteps()).toMatch(/declar[\s\S]*installs nothing/)
  })

  // Claude Code does not offer the plugins a settings file declares, so the
  // install has to happen before the session that would use them starts.
  it('installs the plugins before claude is started', () => {
    const text = nextSteps()
    expect(text.indexOf('claude plugin install')).toBeGreaterThan(-1)
    expect(text.indexOf('claude plugin install')).toBeLessThan(
      text.indexOf('Run `claude`'),
    )
  })

  it('names every install command at project scope', () => {
    for (const line of [
      'claude plugin marketplace add cprobert/kiss-ssg --scope project',
      'claude plugin install kiss-ssg@kiss-ssg --scope project',
      'claude plugin install kiss-memory@kiss-ssg --scope project',
    ])
      expect(nextSteps()).toContain(line)
  })

  it('help says the install commands still have to be run', () => {
    expect(INIT_HELP).toMatch(/does not install plugins/)
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
