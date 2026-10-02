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
  IMPORT_PROMPT,
  INIT_HELP,
  CLAUDE_STEPS,
  CODEX_STEPS,
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
  hasMain: false,
  starter: STARTER,
  ...over,
  files: {
    'package.json': null,
    'CLAUDE.md': null,
    'AGENTS.md': null,
    '.claude/settings.json': null,
    '.codex/config.toml': null,
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
      planInit(state({ hasRouter: true, files: { 'package.json': existing } })),
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

  // Reversed 2026-10-02. This used to keep "commonjs" and print a note — but
  // npm 11's `npm init -y` writes `"type": "commonjs"` by default, so anyone
  // who ran it first got a starter whose build crashed with "Cannot use import
  // statement outside a module" (the clean-room import run). When init is
  // writing the starter there is no code yet that could depend on CommonJS:
  // the value is npm's boilerplate, not the site's choice.
  it('switches "type": "commonjs" to "module" when it writes the starter, and says so', () => {
    const existing = JSON.stringify({ name: 'x', type: 'commonjs' })
    const action = byPath(
      planInit(state({ files: { 'package.json': existing } })),
      'package.json',
    )
    expect(json(action).type).toBe('module')
    expect(action.detail).toMatch(/commonjs/)
  })

  // The same boilerplate's other half: `npm init -y` also writes
  // "main": "index.js", a file nobody writes. The starter was given no main,
  // so `main` still named a file that did not exist (Claude clean room,
  // 2026-10-02) although llms.txt says the starter sets it to router.js.
  it('points "main" at router.js when it writes the starter and main names no file', () => {
    const existing = JSON.stringify({ name: 'x', main: 'index.js' })
    const action = byPath(
      planInit(state({ files: { 'package.json': existing } })),
      'package.json',
    )
    expect(json(action).main).toBe('router.js')
    expect(action.detail).toMatch(/index\.js/)
  })

  it('keeps "type": "commonjs" in a project that already has code', () => {
    const existing = JSON.stringify({
      name: 'x',
      type: 'commonjs',
      scripts: { build: 'node router.js' },
    })
    const action = byPath(
      planInit(state({ hasRouter: true, files: { 'package.json': existing } })),
      'package.json',
    )
    expect(json(action).type).toBe('commonjs')
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
          '.codex/config.toml': written['.codex/config.toml'],
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

  // Codex, at /branch-close: the create path lacked the guard the merge path had.
  it.each([
    ['an existing package.json', '{}'],
    ['no package.json', null],
  ])(
    'adds no router.js scripts to a site that has src/ but no router.js, with %s',
    (_, text) => {
      const action = byPath(
        planInit(state({ hasSrc: true, files: { 'package.json': text } })),
        'package.json',
      )
      expect(action.kind).toBe('skip')
      expect(action.reason).toMatch(/no router\.js/)
    },
  )

  // Found by the final review: router.js and src/ are kiss's shape, not every
  // project's. A CommonJS app with `main: index.js` got "type": "module".
  it('takes a package.json whose main file exists for a site, and leaves it alone', () => {
    const actions = planInit(
      state({
        hasMain: true,
        files: {
          'package.json': JSON.stringify({
            main: 'index.js',
            scripts: { start: 'node index.js' },
          }),
        },
      }),
    )
    expect(starterWrites(actions)).toEqual([])
    expect(byPath(actions, 'package.json').kind).toBe('skip')
  })

  it('takes a package.json with its own build script for a site', () => {
    const actions = planInit(
      state({
        files: {
          'package.json': JSON.stringify({ scripts: { build: 'eleventy' } }),
        },
      }),
    )
    expect(starterWrites(actions)).toEqual([])
    expect(byPath(actions, 'router.js').reason).toMatch(/scripts\.build/)
  })

  // `npm init -y` names an index.js that does not exist and a placeholder
  // test script: that folder is empty, and still gets the starter.
  it('still starts a site in a folder npm init -y has just made', () => {
    const actions = planInit(
      state({
        files: {
          'package.json': JSON.stringify({
            main: 'index.js',
            scripts: { test: 'echo "Error: no test specified" && exit 1' },
          }),
        },
      }),
    )
    expect(byPath(actions, 'router.js').kind).toBe('write')
    expect(json(byPath(actions, 'package.json')).type).toBe('module')
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

  // The other front door. Someone who already has a site — most often one
  // made in Claude or ChatGPT, given as a link — was only ever shown the
  // new-site prompt, telling them to describe a site they already had.
  it('offers the import prompt too, naming the import skill and a link', () => {
    expect(nextSteps()).toContain(IMPORT_PROMPT)
    expect(IMPORT_PROMPT).toMatch(/kiss-site-import/)
    expect(IMPORT_PROMPT).toMatch(/link/)
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

// One marketplace and one set of skills serve both agents (measured
// 2026-10-02, Codex CLI 0.157.1: `codex plugin marketplace add` reads the
// existing .claude-plugin/marketplace.json). Codex has no project scope, so
// its lines install per user and are printed beside Claude Code's.
describe('Codex beside Claude Code', () => {
  it('CLAUDE_STEPS are the three project-scope plugin lines, in order', () => {
    expect(CLAUDE_STEPS).toEqual([
      'claude plugin marketplace add cprobert/kiss-ssg --scope project',
      'claude plugin install kiss-ssg@kiss-ssg --scope project',
      'claude plugin install kiss-memory@kiss-ssg --scope project',
    ])
  })

  it('CODEX_STEPS are the three codex plugin lines, in order', () => {
    expect(CODEX_STEPS).toEqual([
      'codex plugin marketplace add cprobert/kiss-ssg',
      'codex plugin add kiss-ssg@kiss-ssg',
      'codex plugin add kiss-memory@kiss-ssg',
    ])
  })

  // Each agent's block is followed by its own "Run …" line, and the prompts
  // come after both: the order a person reads them in is the order to run them.
  it('prints the Claude block, Run claude, the Codex block, Run codex, then the prompts', () => {
    const text = nextSteps()
    const order = [
      ...CLAUDE_STEPS,
      'Run `claude` in this folder.',
      ...CODEX_STEPS,
      'Run `codex` in this folder.',
      FIRST_PROMPT,
      IMPORT_PROMPT,
    ].map((line) => {
      const at = text.indexOf(line)
      expect(at, line).toBeGreaterThan(-1)
      return at
    })
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('says the Codex plugins install once per user, not per folder', () => {
    expect(nextSteps()).toMatch(/Codex[\s\S]*once per user/)
    expect(INIT_HELP).toMatch(/Codex[\s\S]*per user/)
  })
})

// Codex does have a project layer (measured 2026-10-02, Codex CLI 0.157.1): a
// trusted project's .codex/config.toml enables plugins for that folder. init
// writes it as the counterpart of .claude/settings.json, in the form Codex
// writes itself, and appends only the tables a file lacks — no TOML parser.
const CODEX_TOML = `[marketplaces.kiss-ssg]
source_type = "git"
source = "https://github.com/cprobert/kiss-ssg.git"

[plugins."kiss-ssg@kiss-ssg"]
enabled = true

[plugins."kiss-memory@kiss-ssg"]
enabled = true
`

describe('.codex/config.toml records the skills for Codex', () => {
  const codex = (text) =>
    byPath(
      planInit(state({ files: { '.codex/config.toml': text } })),
      '.codex/config.toml',
    )

  it('a fresh folder gets the whole file, exactly', () => {
    expect(codex(null)).toMatchObject({
      kind: 'write',
      verb: 'create',
      content: CODEX_TOML,
    })
  })

  it('an existing file gains only the tables whose header it lacks, after every byte it had', () => {
    const existing =
      'model = "o4"\n\n[plugins."kiss-ssg@kiss-ssg"]\nenabled = false\n'
    const action = codex(existing)
    expect(action).toMatchObject({ kind: 'write', verb: 'append' })
    expect(action.content.startsWith(existing)).toBe(true)
    const added = action.content.slice(existing.length)
    expect(added).toContain('[marketplaces.kiss-ssg]')
    expect(added).toContain('[plugins."kiss-memory@kiss-ssg"]')
    // The site switched kiss-ssg off: its table is not written a second time.
    expect(added).not.toContain('[plugins."kiss-ssg@kiss-ssg"]')
    expect(action.content.split('[plugins."kiss-ssg@kiss-ssg"]')).toHaveLength(
      2,
    )
  })

  it('a file with all three tables is skipped', () => {
    expect(codex(CODEX_TOML).kind).toBe('skip')
    expect(codex(`# mine\n${CODEX_TOML}`).kind).toBe('skip')
  })

  it('appending twice changes nothing the second time', () => {
    const once = codex('model = "o4"').content
    expect(codex(once).kind).toBe('skip')
  })

  // TOML forbids defining a table twice, so appending one the file already
  // has makes the whole file unloadable. Codex's review (2026-10-02) found the
  // first header check compared exact lines: a trailing comment, other quotes
  // or spacing slipped past it and init corrupted a valid config.
  it.each([
    ['a trailing comment', '[plugins."kiss-ssg@kiss-ssg"] # off on purpose'],
    ['single quotes and spacing', "[ plugins . 'kiss-ssg@kiss-ssg' ]"],
  ])(
    'recognises a header written with %s, and does not define it again',
    (_, header) => {
      const existing = `${header}\nenabled = false\n`
      const action = codex(existing)
      expect(action.content.startsWith(existing)).toBe(true)
      expect(action.content.slice(existing.length)).not.toContain(
        'kiss-ssg@kiss-ssg"]',
      )
    },
  )

  it('recognises a quoted marketplace header', () => {
    const existing = '[marketplaces."kiss-ssg"]\nsource_type = "local"\n'
    expect(codex(existing).content.slice(existing.length)).not.toContain(
      '[marketplaces.',
    )
  })

  it.each([
    ['a dotted key', 'plugins."kiss-ssg@kiss-ssg".enabled = false\n'],
    [
      'an inline table',
      '[plugins]\n"kiss-memory@kiss-ssg" = { enabled = false }\n',
    ],
    ['a [marketplaces] table', '[marketplaces]\nkiss-ssg = { source = "x" }\n'],
  ])(
    'leaves a file that defines a key as %s untouched, and says why',
    (_, existing) => {
      const action = codex(existing)
      expect(action.kind).toBe('skip')
      expect(action.reason).toMatch(/by hand/)
    },
  )

  it('appends to a CRLF file with CRLF, on a line of its own', () => {
    const crlf = 'model = "o4"\r\n'
    const action = codex(crlf)
    expect(action.content.startsWith(crlf)).toBe(true)
    expect(action.content.slice(crlf.length)).not.toMatch(/[^\r]\n/)
    expect(action.content).toContain('\r\n[marketplaces.kiss-ssg]\r\n')
  })

  it('nextSteps and the help name the project file and the per-user install', () => {
    expect(nextSteps()).toContain('.codex/config.toml')
    expect(INIT_HELP).toContain('.codex/config.toml')
  })
})

// What every site `init`'d before 2.8.0 has in AGENTS.md: the llms.txt
// pointer and nothing about the skills.
const OLD_AGENTS_MD = `## kiss-ssg

This is a kiss-ssg static site. Before changing the build script, views, models or
controllers, read \`node_modules/kiss-ssg/llms.txt\` (the API contract) and copy the
shape of the matching site in \`node_modules/kiss-ssg/examples/\`. Verify every change
with \`npx kiss-ssg check router.js\`, which exits 1 on any failed page.
`

describe('AGENTS.md carries the Codex install', () => {
  const agents = (text) =>
    byPath(planInit(state({ files: { 'AGENTS.md': text } })), 'AGENTS.md')

  it('a fresh AGENTS.md is written whole: llms.txt, check, the skills and every Codex line', () => {
    const action = agents(null)
    expect(action).toMatchObject({ kind: 'write', verb: 'create' })
    expect(action.content).toContain('node_modules/kiss-ssg/llms.txt')
    expect(action.content).toContain('npx kiss-ssg check router.js')
    for (const skill of [
      'kiss-site-new',
      'kiss-site-import',
      'kiss-page-add',
      'kiss-build-check',
      'kiss-site-review',
      'kiss-site-migrate',
      'kiss-site-brief',
    ])
      expect(action.content).toContain(skill)
    for (const line of CODEX_STEPS) expect(action.content).toContain(line)
    expect(action.content).toMatch(/once per user/)
  })

  it('an old-style AGENTS.md gains the Codex section, after every byte it had', () => {
    const action = agents(OLD_AGENTS_MD)
    expect(action).toMatchObject({ kind: 'write', verb: 'append' })
    expect(action.content.startsWith(`${OLD_AGENTS_MD}\n`)).toBe(true)
    for (const line of CODEX_STEPS) expect(action.content).toContain(line)
    // The pointer is already there, so it is not written a second time.
    expect(action.content.split('node_modules/kiss-ssg/llms.txt')).toHaveLength(
      OLD_AGENTS_MD.split('node_modules/kiss-ssg/llms.txt').length,
    )
  })

  it('appends to a CRLF AGENTS.md with CRLF', () => {
    const crlf = OLD_AGENTS_MD.replace(/\n/g, '\r\n')
    const action = agents(crlf)
    expect(action.content.startsWith(crlf)).toBe(true)
    expect(action.content.slice(crlf.length)).not.toMatch(/[^\r]\n/)
  })

  it('an AGENTS.md that already has the section is skipped', () => {
    const fresh = agents(null).content
    expect(agents(fresh).kind).toBe('skip')
    expect(agents(agents(OLD_AGENTS_MD).content).kind).toBe('skip')
  })

  it('an AGENTS.md of the site owner’s own gains the pointer and the section', () => {
    const action = agents('## House style\n')
    expect(action.verb).toBe('append')
    expect(action.content.startsWith('## House style\n')).toBe(true)
    expect(action.content).toContain('node_modules/kiss-ssg/llms.txt')
    for (const line of CODEX_STEPS) expect(action.content).toContain(line)
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
  // Measured 2026-09-27: behind `if (!dev)`, a dev server that could not bind
  // its port exited 0; awaited, it exits 1, and a free port keeps serving.
  it('awaits complete() in dev too, so a dev server that cannot start exits 1', () => {
    const router = fs.readFileSync(path.join(dir, 'router.js'), 'utf8')
    expect(router).toContain('await kiss.complete().catch(reportBuildFailure)')
    expect(router).not.toContain('if (!dev)')
  })
})
