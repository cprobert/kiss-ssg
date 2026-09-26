# Agent-first onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx kiss-ssg init` wires a folder for a coding agent (project-scoped plugins, `CLAUDE.md`, `AGENTS.md`) and drops a starter site; the README becomes an agent quick start and the library reference moves to a shipped `GUIDE.md`.

**Architecture:** `init` follows `check`'s split — every decision in a pure `lib/init.js` (`planInit(state)` returns a list of actions carrying final file content), and `bin/kiss-ssg.js` only reads the folder, writes what the plan says and runs npm. The starter is a verbatim-copied top-level `starter/` folder. The README split is a move, not a rewrite: `GUIDE.md` takes the reference sections with their headings intact so in-file anchors survive.

**Tech Stack:** Node ≥22.12 ESM, Vitest, JSDoc + `tsc --checkJs`, Prettier, ESLint, Claude Code plugin settings (`extraKnownMarketplaces`, `enabledPlugins`).

**Spec:** `planning/specs/2026-09-26-agent-first-onboarding-design.md`. Session log (success criteria, pulse log): `planning/sessions/2026-09-26-agent-first-onboarding.md`.

## Deviation from the spec

The spec says `check`'s `parseArgs` gains `init`. It does not: `init` has its own `parseInitArgs` in `lib/init.js` and the bin dispatches it before `parseArgs`, because `parseArgs`'s signature is pinned by `test/unit/types.test.js` and `init` shares none of its options. Only `HELP` names it. `CHANGELOG.md` and the 2.7.0 bump are left to `/branch-close`.

## Global Constraints

- Node floor `>=22.12`; the package is ESM (`"type": "module"`).
- `init` never overwrites an existing file. `package.json` and `.claude/settings.json` are merged key by key; `CLAUDE.md` / `AGENTS.md` are appended only when the llms.txt reference is missing.
- The starter is written only when **neither** `router.js` nor `src/` exists.
- Installs `kiss-ssg@<version of the running init>` when `node_modules/kiss-ssg` is absent; `--no-install` skips it. `init` never runs `claude`.
- Plugin scope is **project** everywhere the docs show an install.
- Marketplace `kiss-ssg` = GitHub `cprobert/kiss-ssg`; plugins `kiss-ssg@kiss-ssg`, `kiss-memory@kiss-ssg`.
- `bin/` stays a thin wrapper; `lib/init.js` gets `test/unit/init.test.js`, `AIKB/init.md` and a `CLAUDE.md` table row in the same commit.
- A regression/merge-safety test counts only once seen red against the unfixed code.
- Commit messages via `git commit -F -` heredoc, never `-m`. Stage by file. Chain edit + verify + commit with `&&`.
- `llms.txt` must stay LF (Edit writes CRLF on this checkout — normalise before `npm test`).
- Version bump and `CHANGELOG.md` entry are made by `/branch-close` (2.7.0), **not** in this plan.

## Review Focus

1. **An existing `package.json` with `"type": "commonjs"`** — keep it, and say `router.js` uses `import` and will not run until it is `module`. Pinned in Task 2.
2. **An existing file that is not valid JSON** (`package.json`, `.claude/settings.json`) — skip with a reason, never overwrite. Pinned in Task 2.
3. **A user who set `enabledPlugins["kiss-memory@kiss-ssg"]: false`** — respected, not flipped to `true`. Pinned in Task 2.
4. **Windows: `npm` is `npm.cmd`** — the install spawn needs `shell: true` on win32 or it fails with `EINVAL`. Not unit-testable; pinned by the manual packed-tarball run on this Windows machine in Task 4.
5. **A folder named `My Site` or `_draft`** — `package.json` `name` must still be a valid npm name. Pinned in Task 2 (`packageName`).

Also pinned: a `CLAUDE.md` with no trailing newline gets the import on its own line (Task 2); npm never packs a file named `.gitignore`, so the starter ships `gitignore` and `init` renames it (Tasks 2–4).

---

### Task 1: Plugin-declaration probe (throwaway, slice 1)

**Files:** none in the repo. Scratch folder only. Result recorded in the session log.

- [ ] **Step 1: Build the probe folder**

```bash
P="$TEMP/kiss-probe" && rm -rf "$P" && mkdir -p "$P/.claude" && cat > "$P/.claude/settings.json" <<'EOF'
{
  "extraKnownMarketplaces": {
    "kiss-ssg": { "source": { "source": "github", "repo": "cprobert/kiss-ssg" } }
  },
  "enabledPlugins": {
    "kiss-ssg@kiss-ssg": true,
    "kiss-memory@kiss-ssg": true
  }
}
EOF
echo "$P"
```

- [ ] **Step 2: Operator runs the interactive check** (Claude cannot drive the trust dialog). Ask the operator to run, in that folder: `claude`, accept trust, note whether it offers to install the marketplace/plugins, then type `/plugin` and note the scope choices it offers, and confirm `/reload-plugins` exists. Record their answers verbatim.

- [ ] **Step 3: Decide the Quick start** — if the plugins were offered on first launch, the Quick start is `init` → `claude`. If not, the Quick start gains, before `claude`:

```
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
```

and `nextSteps()` in Task 2 prints them. Either way, Task 7 uses the recorded outcome.

- [ ] **Step 4: Record and pulse** — append the result under `## Pulse log` in the session file (via `/branch-pulse`), commit the session file alone:

```bash
git add planning/sessions/2026-09-26-agent-first-onboarding.md && git commit -F - <<'EOF'
Pulse: plugin-declaration probe result

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

---

### Task 2: `lib/init.js` — the plan

**Files:**

- Create: `lib/init.js`
- Test: `test/unit/init.test.js`

**Interfaces:**

- Produces (used by Task 4's bin and Task 3's starter test):
  - `INIT_HELP: string`
  - `STARTER_MARKER = 'Started by \`npx kiss-ssg init\`'`
  - `STARTER_RENAMES = { gitignore: '.gitignore' }`
  - `LLMS_IMPORT = '@node_modules/kiss-ssg/llms.txt'`
  - `PLUGINS = ['kiss-ssg@kiss-ssg', 'kiss-memory@kiss-ssg']`
  - `FIRST_PROMPT: string`
  - `parseInitArgs(argv: string[]) → { install: boolean, help: boolean, error: string|null }`
  - `packageName(folderName: string) → string`
  - `planInit(state: InitState) → InitAction[]`
  - `describeAction(action: InitAction) → string`
  - `nextSteps({ probeOffered: boolean }) → string`
  - `InitState = { folderName: string, version: string, install: boolean, hasEngine: boolean, hasRouter: boolean, hasSrc: boolean, files: { 'package.json': string|null, 'CLAUDE.md': string|null, 'AGENTS.md': string|null, '.claude/settings.json': string|null }, starter: Record<string, string> }` — `starter` maps a path relative to `starter/` (e.g. `gitignore`, `src/pages/index.hbs`) to its text.
  - `InitAction = { kind: 'write', path, content, verb: 'create'|'merge'|'append', detail? } | { kind: 'skip', path, reason } | { kind: 'install', spec }`

- [ ] **Step 1: Write the failing tests** — `test/unit/init.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  LLMS_IMPORT,
  PLUGINS,
  STARTER_MARKER,
  packageName,
  parseInitArgs,
  planInit,
  describeAction,
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
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run test/unit/init.test.js`. Expected: FAIL, `Failed to load url ../../lib/init.js`.

- [ ] **Step 3: Implement `lib/init.js`**

```js
// The decision core behind `kiss-ssg init`: given what is already in the
// folder, which files to create, which to merge into and which to leave alone.
// Pure — `bin/kiss-ssg.js` reads the folder, writes what this returns and runs
// npm. Nothing here overwrites: an existing file is merged into key by key,
// appended to, or skipped with a reason the person can act on.

export const MARKETPLACE = 'kiss-ssg'
export const MARKETPLACE_REPO = 'cprobert/kiss-ssg'
export const PLUGINS = ['kiss-ssg@kiss-ssg', 'kiss-memory@kiss-ssg']
export const LLMS_IMPORT = '@node_modules/kiss-ssg/llms.txt'
// `kiss-site-new` reads this line to tell a starter it should grow from a site
// it must preserve.
export const STARTER_MARKER = 'Started by `npx kiss-ssg init`'
// npm never packs a file named `.gitignore`, so the starter ships without the dot.
/** @type {Record<string, string>} */
export const STARTER_RENAMES = { gitignore: '.gitignore' }
export const FIRST_PROMPT =
  'Use the kiss-site-new skill to build me a site for <who it is for and what it should say>, with <the pages it needs>. Run the build check when you are done.'

const SCRIPTS = {
  build: 'node router.js',
  dev: 'node router.js --dev',
  check: 'kiss-ssg check router.js',
}

const CLAUDE_MD = `# CLAUDE.md

This is a kiss-ssg static site. The engine's API contract, read on every session:

${LLMS_IMPORT}
`

const AGENTS_MD = `## kiss-ssg

This is a kiss-ssg static site. Before changing the build script, views, models or
controllers, read \`node_modules/kiss-ssg/llms.txt\` (the API contract) and copy the
shape of the matching site in \`node_modules/kiss-ssg/examples/\`. Verify every change
with \`npx kiss-ssg check router.js\`, which exits 1 on any failed page.
`

export const INIT_HELP = `kiss-ssg init [--no-install]

  Set this folder up for a coding agent, and start a site if there is none:

    package.json           created, or merged: "type": "module", and the
                           build, dev and check scripts
    CLAUDE.md, AGENTS.md   point the agent at node_modules/kiss-ssg/llms.txt
    .claude/settings.json  the kiss-ssg marketplace and its two plugins, at
                           project scope, so everyone who opens the folder in
                           Claude Code is offered the same skills
    router.js, src/        a starter site — only when neither exists yet
    node_modules/kiss-ssg  npm install --save-dev kiss-ssg@<this version>,
                           unless it is there already or --no-install is given

  An existing file is never overwritten. Running it twice changes nothing.`

/**
 * @typedef {Object} InitArgs
 * @property {boolean} install run npm when the engine is missing
 * @property {boolean} help print {@link INIT_HELP}
 * @property {string|null} error a usage error: print it with the help and exit 1
 */

/**
 * @param {string[]} [argv] everything after `init`
 * @returns {InitArgs}
 */
export function parseInitArgs(argv = []) {
  /** @type {InitArgs} */
  const parsed = { install: true, help: false, error: null }
  for (const arg of argv) {
    if (arg === '--no-install') parsed.install = false
    else if (arg === '--help' || arg === '-h') parsed.help = true
    else {
      parsed.error = `init takes no ${arg.startsWith('-') ? 'option' : 'argument'} ${arg}`
      return parsed
    }
  }
  return parsed
}

/**
 * A valid npm package name from a folder name: lower case, runs of anything
 * npm refuses collapsed to one hyphen, no leading dot, underscore or hyphen.
 *
 * @param {string} folderName
 * @returns {string}
 */
export function packageName(folderName) {
  const name = folderName
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/[-.]+$/, '')
  return name || 'kiss-site'
}

/**
 * @typedef {Object} InitState
 * @property {string} folderName the folder's own name, for a new package.json
 * @property {string} version the running kiss-ssg's version, which is what gets installed
 * @property {boolean} install `--no-install` was not given
 * @property {boolean} hasEngine `node_modules/kiss-ssg` exists
 * @property {boolean} hasRouter `router.js` exists
 * @property {boolean} hasSrc `src/` exists
 * @property {{ 'package.json': string|null, 'CLAUDE.md': string|null, 'AGENTS.md': string|null, '.claude/settings.json': string|null }} files each file's text, or null when absent
 * @property {Record<string, string>} starter the shipped `starter/` folder: path relative to it → text
 */

/**
 * @typedef {{ kind: 'write', path: string, content: string, verb: 'create'|'merge'|'append', detail?: string }
 *   | { kind: 'skip', path: string, reason: string }
 *   | { kind: 'install', spec: string }} InitAction
 */

/**
 * @param {string} text
 * @returns {Record<string, any>|null} the parsed object, or null when it is not a JSON object
 */
function parseObject(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : null
  } catch {
    return null
  }
}

const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`

/**
 * @param {string|null} text
 * @param {string} folderName
 * @returns {InitAction}
 */
function planPackageJson(text, folderName) {
  const path = 'package.json'
  if (text === null)
    return {
      kind: 'write',
      path,
      verb: 'create',
      content: toJson({
        name: packageName(folderName),
        private: true,
        type: 'module',
        scripts: SCRIPTS,
      }),
    }
  const pkg = parseObject(text)
  if (!pkg)
    return {
      kind: 'skip',
      path,
      reason: `not valid JSON — left alone; add "type": "module" and the ${Object.keys(SCRIPTS).join(', ')} scripts by hand`,
    }
  const added = []
  const notes = []
  const merged = { ...pkg }
  if (merged.type === undefined) {
    merged.type = 'module'
    added.push('type')
  } else if (merged.type !== 'module')
    notes.push(
      `kept "type": "${merged.type}" — router.js uses import, so set "type": "module" or rename it router.mjs`,
    )
  const scripts = { ...(merged.scripts ?? {}) }
  for (const [name, command] of Object.entries(SCRIPTS)) {
    if (scripts[name] === undefined) {
      scripts[name] = command
      added.push(`scripts.${name}`)
    } else if (scripts[name] !== command) notes.push(`kept scripts.${name}`)
  }
  merged.scripts = scripts
  if (added.length === 0)
    return {
      kind: 'skip',
      path,
      reason: ['already set up', ...notes].join('; '),
    }
  return {
    kind: 'write',
    path,
    verb: 'merge',
    content: toJson(merged),
    detail: [`added ${added.join(', ')}`, ...notes].join('; '),
  }
}

/**
 * @param {string|null} text
 * @returns {InitAction}
 */
function planSettings(text) {
  const path = '.claude/settings.json'
  /** @type {Record<string, any>} */
  let settings = {}
  if (text !== null) {
    settings = parseObject(text)
    if (!settings)
      return {
        kind: 'skip',
        path,
        reason:
          'not valid JSON — left alone; install the plugins with claude plugin install kiss-ssg@kiss-ssg --scope project',
      }
  }
  const added = []
  const markets = { ...(settings.extraKnownMarketplaces ?? {}) }
  if (!markets[MARKETPLACE]) {
    markets[MARKETPLACE] = {
      source: { source: 'github', repo: MARKETPLACE_REPO },
    }
    added.push(`marketplace ${MARKETPLACE}`)
  }
  // A plugin the user switched off stays off: `in`, not truthiness.
  const enabled = { ...(settings.enabledPlugins ?? {}) }
  for (const plugin of PLUGINS)
    if (!(plugin in enabled)) {
      enabled[plugin] = true
      added.push(plugin)
    }
  if (added.length === 0)
    return { kind: 'skip', path, reason: 'already declares the plugins' }
  return {
    kind: 'write',
    path,
    verb: text === null ? 'create' : 'merge',
    content: toJson({
      ...settings,
      extraKnownMarketplaces: markets,
      enabledPlugins: enabled,
    }),
    detail: `added ${added.join(', ')}`,
  }
}

/**
 * @param {string} path
 * @param {string|null} text
 * @param {string} fresh the whole file when there is none
 * @param {string} addition appended when there is one without the reference
 * @returns {InitAction}
 */
function planPointer(path, text, fresh, addition) {
  if (text === null)
    return { kind: 'write', path, verb: 'create', content: fresh }
  if (text.includes('node_modules/kiss-ssg/llms.txt'))
    return { kind: 'skip', path, reason: 'already points at llms.txt' }
  const joint = text.endsWith('\n') ? '\n' : '\n\n'
  return {
    kind: 'write',
    path,
    verb: 'append',
    content: `${text}${joint}${addition}`,
  }
}

/**
 * @param {InitState} state
 * @returns {InitAction[]}
 */
function planStarter(state) {
  if (state.hasRouter || state.hasSrc)
    return [
      {
        kind: 'skip',
        path: 'router.js',
        reason: `a site is already here (${state.hasRouter ? 'router.js' : 'src/'}) — no starter written`,
      },
    ]
  return Object.entries(state.starter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([from, content]) =>
        /** @type {InitAction} */ ({
          kind: 'write',
          path: STARTER_RENAMES[from] ?? from,
          verb: 'create',
          content,
        }),
    )
}

/**
 * What `kiss-ssg init` will do to this folder, in order. Install is last, so
 * a failed network still leaves every file written.
 *
 * @param {InitState} state
 * @returns {InitAction[]}
 */
export function planInit(state) {
  /** @type {InitAction[]} */
  const actions = [
    planPackageJson(state.files['package.json'], state.folderName),
    ...planStarter(state),
    planPointer(
      'CLAUDE.md',
      state.files['CLAUDE.md'],
      CLAUDE_MD,
      `${LLMS_IMPORT}\n`,
    ),
    planPointer('AGENTS.md', state.files['AGENTS.md'], AGENTS_MD, AGENTS_MD),
    planSettings(state.files['.claude/settings.json']),
  ]
  if (!state.hasEngine) {
    if (state.install)
      actions.push({ kind: 'install', spec: `kiss-ssg@${state.version}` })
    else
      actions.push({
        kind: 'skip',
        path: 'node_modules/kiss-ssg',
        reason:
          '--no-install; run npm install --save-dev kiss-ssg before building',
      })
  }
  return actions
}

/**
 * @param {InitAction} action
 * @returns {string}
 */
export function describeAction(action) {
  if (action.kind === 'install') return `  install  ${action.spec}`
  if (action.kind === 'skip')
    return `  skip     ${action.path} — ${action.reason}`
  const line = `  ${action.verb.padEnd(8)} ${action.path}`
  return action.detail ? `${line} (${action.detail})` : line
}

/**
 * What to do after `init`: open the agent, accept the plugins, paste a prompt.
 *
 * @param {{ probeOffered: boolean }} options whether Claude Code offers declared plugins on first launch (Task 1's probe)
 * @returns {string}
 */
export function nextSteps({ probeOffered }) {
  const install = probeOffered
    ? '  2. Trust the folder and accept the kiss-ssg plugins it offers.'
    : [
        '  2. Install the skills for this project, then restart claude:',
        '       claude plugin marketplace add cprobert/kiss-ssg --scope project',
        '       claude plugin install kiss-ssg@kiss-ssg --scope project',
        '       claude plugin install kiss-memory@kiss-ssg --scope project',
      ].join('\n')
  return [
    'Next:',
    '  1. Run `claude` in this folder.',
    install,
    '  3. Paste:',
    `       ${FIRST_PROMPT}`,
    '',
    'Build it yourself any time with `npm run build`, preview with `npm run dev`,',
    'and verify with `npm run check`.',
  ].join('\n')
}
```

After Task 1, set the bin's call to `nextSteps({ probeOffered: <probe result> })`; if the probe found the plugins are offered, the `false` branch is still kept as the documented fallback and tested below.

Add to the test file:

```js
import { nextSteps, FIRST_PROMPT } from '../../lib/init.js'

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
```

- [ ] **Step 4: Run** `npx vitest run test/unit/init.test.js` — PASS. Then **see each merge-safety test red**: temporarily change `if (!(plugin in enabled))` to `if (!enabled[plugin])`, confirm "a plugin the user turned off" fails; revert. Temporarily make `planPackageJson` assign `merged.type = 'module'` unconditionally, confirm "keeps commonjs" fails; revert. Temporarily drop the `!pkg` guard, confirm "not valid JSON" fails; revert. Note each red in the commit message.

- [ ] **Step 5: Typecheck, types, lint, format**

```bash
npm run typecheck && npm run types && git status --short types/ && npx eslint lib/init.js test/unit/init.test.js && npx prettier --write lib/init.js test/unit/init.test.js
```

Fix any `checkJs` error by annotating (a `/** @type {InitAction} */` cast on a literal whose `kind` widened to `string`), never by loosening the config. Expected: new `types/init.d.ts`; read it — `planInit(state: InitState): InitAction[]` must not be `any`.

- [ ] **Step 6: AIKB doc + table row** — create `AIKB/init.md` with the five template headings (`## Responsibility`, `## Public interface`, `## Depends on`, `## Depended on by`, `## Non-obvious behavior`): responsibility = the plan for `init`; interface = the exports above; depends on nothing; depended on by `bin/kiss-ssg.js`; non-obvious = never overwrites, `in` not truthiness for disabled plugins, install last, `gitignore` rename and why, starter written only when neither `router.js` nor `src/` exists, the marker `kiss-site-new` reads. Add to CLAUDE.md's module table after the `check` row:

```
| `kiss-ssg init` plan                  | `lib/init.js`                | `AIKB/init.md`                |
```

Run `npx vitest run test/aikb.test.js` — PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/init.js test/unit/init.test.js types/init.d.ts AIKB/init.md CLAUDE.md && git commit -F - <<'EOF'
init: the plan — what kiss-ssg init creates, merges and leaves alone

Pure decision core for the new command; the bin will only execute it.
Merge-safety tests seen red: disabled plugin re-enabled, commonjs
overwritten, invalid JSON overwritten.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

---

### Task 3: `starter/` — the site `init` drops

**Files:**

- Create: `starter/router.js`, `starter/gitignore`, `starter/src/layouts/layout.hbs`, `starter/src/pages/index.hbs`
- Modify: `package.json` (`files`), `scripts/gates.mjs` (`REQUIRED_PACKED`)
- Test: `test/unit/init.test.js` (starter-on-disk assertions)

**Interfaces:**

- Consumes: `STARTER_MARKER`, `STARTER_RENAMES` from Task 2.
- Produces: the `starter/` folder the bin reads (Task 4).

- [ ] **Step 1: Failing test** — append to `test/unit/init.test.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { STARTER_RENAMES } from '../../lib/init.js'

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
```

Run `npx vitest run test/unit/init.test.js` — FAIL (no `starter/`).

- [ ] **Step 2: Write the starter**

`starter/router.js`:

```js
// Started by `npx kiss-ssg init` — the smallest site kiss's conventions
// produce. Grow it rather than replace it. The API contract is
// node_modules/kiss-ssg/llms.txt; whole sites to copy by shape are in
// node_modules/kiss-ssg/examples/.
import Kiss from 'kiss-ssg'

// A failed build must be loud: print each failing page and exit non-zero,
// rather than exiting 0 with a page quietly missing.
function reportBuildFailure(err) {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
}

const dev = process.argv.includes('--dev')

// No `folders` block: `src: './src'` and `build: './public'` are the defaults.
// Any extra key reaches every view as `config.<key>`.
const kiss = new Kiss({
  site: { name: 'My kiss site' },
  dev,
})
  .scan()
  .generate()

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
```

`starter/gitignore`:

```
node_modules/
public/
```

`starter/src/layouts/layout.hbs`:

```hbs
<html lang='en'>
  <head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1' />
    <title>{{config.site.name}}</title>
  </head>
  <body>
    <main>
      {{#block 'main'}}{{/block}}
    </main>
  </body>
</html>
```

`starter/src/pages/index.hbs`:

```hbs
{{#extend 'layout'}}
  {{#content 'main'}}
    <h1>{{config.site.name}}</h1>
    <p>Built with kiss-ssg. Ask your coding agent to turn this into the site you
      want.</p>
  {{/content}}
{{/extend}}
```

- [ ] **Step 3: Ship it** — in `package.json` `files`, add `"starter"` after `"examples"` and `"GUIDE.md"` after `"llms.txt"` (GUIDE.md lands in Task 6; the pack gate is not run until then). In `scripts/gates.mjs` `REQUIRED_PACKED`, add `'starter/router.js'`, `'starter/gitignore'`, `'GUIDE.md'`.

- [ ] **Step 4:** `npx vitest run test/unit/init.test.js test/unit/gates.test.js` — PASS. `npx prettier --check starter/router.js`.

- [ ] **Step 5: Commit**

```bash
git add starter package.json scripts/gates.mjs test/unit/init.test.js && git commit -F - <<'EOF'
init: the starter site, shipped as starter/

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

---

### Task 4: `kiss-ssg init` in the bin, end to end (slice 2 closes)

**Files:**

- Modify: `bin/kiss-ssg.js` (dispatch `init` before `parseArgs`), `lib/check.js` (`HELP` names `init`)
- Test: `test/integration/init.test.js`

**Interfaces:**

- Consumes: `parseInitArgs`, `planInit`, `describeAction`, `nextSteps`, `INIT_HELP` from Task 2; `starter/` from Task 3.

- [ ] **Step 1: Failing integration test** — `test/integration/init.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

// The real bin in a real empty folder, then the real check over what it wrote:
// the only proof that the starter `init` drops actually builds.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')

const dirs = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function emptySite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-init-'))
  dirs.push(dir)
  // The engine as a consuming site resolves it; a junction needs no admin on Windows.
  fs.mkdirSync(path.join(dir, 'node_modules'))
  fs.symlinkSync(
    repoRoot,
    path.join(dir, 'node_modules', 'kiss-ssg'),
    'junction',
  )
  return dir
}

const run = (cwd, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })

function snapshot(dir) {
  const out = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), {
      withFileTypes: true,
    })) {
      const p = path.posix.join(rel, e.name)
      if (e.name === 'node_modules' || e.name === 'public') continue
      if (e.isDirectory()) walk(p)
      else
        out[p] = crypto
          .createHash('sha1')
          .update(fs.readFileSync(path.join(dir, p)))
          .digest('hex')
    }
  }
  walk('')
  return out
}

describe('kiss-ssg init', () => {
  it('turns an empty folder into a site that passes check', () => {
    const dir = emptySite()
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/create\s+router\.js/)
    expect(init.stdout).toContain('Next:')
    for (const f of [
      'package.json',
      'router.js',
      '.gitignore',
      'CLAUDE.md',
      'AGENTS.md',
      '.claude/settings.json',
      'src/pages/index.hbs',
    ])
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true)
    const check = run(dir, 'check', '--summary', 'router.js')
    expect(check.status, check.stderr).toBe(0)
  })

  it('changes nothing when run a second time', () => {
    const dir = emptySite()
    run(dir, 'init', '--no-install')
    const before = snapshot(dir)
    const again = run(dir, 'init', '--no-install')
    expect(again.status).toBe(0)
    expect(again.stdout).not.toMatch(/^\s+(create|merge|append)\b/m)
    expect(snapshot(dir)).toEqual(before)
  })

  it('rejects an argument with the help', () => {
    const res = run(emptySite(), 'init', 'router.js')
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('kiss-ssg init [--no-install]')
  })
})
```

Run `npx vitest run test/integration/init.test.js` — FAIL (`unknown command: init`).

- [ ] **Step 2: Dispatch in the bin** — in `bin/kiss-ssg.js`, add imports and this block **before** `const parsed = parseArgs(...)`:

```js
import {
  INIT_HELP,
  describeAction,
  nextSteps,
  parseInitArgs,
  planInit,
} from '../lib/init.js'
```

```js
// `init` is its own command with its own arguments, so it is handled before
// check's parse: it runs no build script and prints no report.
if (process.argv[2] === 'init') {
  const init = parseInitArgs(process.argv.slice(3))
  if (init.error || init.help) {
    if (init.error) console.error(`kiss-ssg: ${init.error}\n`)
    ;(init.error ? console.error : console.log)(INIT_HELP)
    process.exit(init.error ? 1 : 0)
  }
  const cwd = process.cwd()
  const here = (p) => path.join(cwd, p)
  const read = (p) =>
    fs.existsSync(here(p)) ? fs.readFileSync(here(p), 'utf8') : null
  const starterDir = path.join(import.meta.dirname, '..', 'starter')
  /** @type {Record<string, string>} */
  const starter = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(starterDir, rel), {
      withFileTypes: true,
    })) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(p)
      else starter[p] = fs.readFileSync(path.join(starterDir, p), 'utf8')
    }
  }
  walk('')
  const { version } = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, '..', 'package.json'),
      'utf8',
    ),
  )
  const actions = planInit({
    folderName: path.basename(cwd),
    version,
    install: init.install,
    hasEngine: fs.existsSync(here('node_modules/kiss-ssg')),
    hasRouter: fs.existsSync(here('router.js')),
    hasSrc: fs.existsSync(here('src')),
    files: {
      'package.json': read('package.json'),
      'CLAUDE.md': read('CLAUDE.md'),
      'AGENTS.md': read('AGENTS.md'),
      '.claude/settings.json': read('.claude/settings.json'),
    },
    starter,
  })
  let status = 0
  for (const action of actions) {
    console.log(describeAction(action))
    if (action.kind === 'write') {
      fs.mkdirSync(path.dirname(here(action.path)), { recursive: true })
      fs.writeFileSync(here(action.path), action.content)
    } else if (action.kind === 'install') {
      // npm is npm.cmd on Windows, which Node will not spawn without a shell.
      const npm = spawnSync('npm', ['install', '--save-dev', action.spec], {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      })
      if (npm.status !== 0) {
        console.error(
          `kiss-ssg: npm install --save-dev ${action.spec} failed; run it yourself before building`,
        )
        status = 1
      }
    }
  }
  console.log(`\n${nextSteps({ probeOffered: PROBE_RESULT })}`)
  process.exit(status)
}
```

Replace `PROBE_RESULT` with the literal `true` or `false` recorded in Task 1.

- [ ] **Step 3: HELP** — in `lib/check.js`, change the first line of `HELP` to `kiss-ssg <command> [args…]` and insert before `check <script>`:

```
  init             set this folder up for a coding agent and, if it has no
                   site yet, drop a starter one (kiss-ssg init --help)
```

- [ ] **Step 4:** `npx vitest run test/integration/init.test.js test/integration/check.test.js test/unit/check.test.js` — PASS (update any `HELP` snapshot assertion in `test/unit/check.test.js` that matched the old first line). `npm run typecheck && npm run lint`.

- [ ] **Step 5: Packed tarball, on this Windows machine** (success criterion 2; Review Focus 4):

```bash
cd /c/Code/kiss-ssg && npm pack --silent && T="$TEMP/kiss-tarball" && rm -rf "$T" && mkdir "$T" && cd "$T" && npm install --save-dev /c/Code/kiss-ssg/kiss-ssg-*.tgz && npx kiss-ssg init && npm run check; echo "exit $?"; tar -tzf /c/Code/kiss-ssg/kiss-ssg-*.tgz | grep -E 'starter/|GUIDE' ; rm /c/Code/kiss-ssg/kiss-ssg-*.tgz
```

Expected: `init` reports `create router.js` and no install line (the tarball is already installed); `npm run check` exits 0; the tarball lists `package/starter/gitignore`. Then, in a second empty folder, `npx --yes --package /c/Code/kiss-ssg/kiss-ssg-*.tgz kiss-ssg init` (repack first) to exercise the **install** path on Windows; it will try `kiss-ssg@<version>` from the registry — for an unpublished version expect the npm failure message and exit 1, which is the honest behaviour; record it.

- [ ] **Step 6: Commit, then pulse**

```bash
git add bin/kiss-ssg.js lib/check.js test/integration/init.test.js test/unit/check.test.js && git commit -F - <<'EOF'
init: kiss-ssg init executes the plan; empty folder to a passing check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

Offer `/branch-pulse` (slice 2 boundary), with the tarball run's output as evidence.

---

### Task 5: `GUIDE.md` — move the reference out of the README

**Files:**

- Create: `GUIDE.md`
- Modify: `README.md` (reference sections removed — the new top half is Task 6), `test/aikb.test.js:20,163`, `test/unit/skill-coverage.test.js` (`consumerFacing`)

- [ ] **Step 1: Re-point the tests first (they go red)** — in `test/aikb.test.js` replace

```js
const readmeMd = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
```

with

```js
const guideMd = fs.readFileSync(path.join(root, 'GUIDE.md'), 'utf8')
```

and in the `README.md default config block` test rename it `GUIDE.md default config block matches resolveConfig({})` and pass `guideMd`. In `skill-coverage.test.js` `consumerFacing`, change `const files = ['llms.txt', 'README.md']` to `const files = ['llms.txt', 'README.md', 'GUIDE.md']`. Run `npx vitest run test/aikb.test.js` — FAIL (`ENOENT GUIDE.md`).

- [ ] **Step 2: Move** — with a script, so nothing is retyped:

```bash
cd /c/Code/kiss-ssg && node -e "
const fs=require('fs');const r=fs.readFileSync('README.md','utf8').replace(/\r\n/g,'\n');
const L=r.split('\n');
const at=(h)=>L.findIndex(l=>l===h);
const types=at('## Types'), agent=at('## Using an AI coding agent?'), usage=at('## Usage');
if([types,agent,usage].includes(-1)) throw new Error('anchor moved');
const guide=['# kiss-ssg guide','',
'The library reference: every method, option and helper, for a person reading or hand-editing a kiss site. If you are starting a site, start with the [README](README.md) — it sets up a coding agent to write this for you. An agent reads the same contract in [\`llms.txt\`](llms.txt).','',
...L.slice(types,agent),...L.slice(usage)].join('\n');
fs.writeFileSync('GUIDE.md',guide);
fs.writeFileSync('README.md',[...L.slice(0,types),...L.slice(agent,usage)].join('\n'));
" && grep -c '^## ' GUIDE.md README.md
```

Expected: GUIDE.md holds Types, Usage (and its `###` sections), Development file changes, Migrating from v1.

- [ ] **Step 3: Fix the one cross-file anchor inside GUIDE.md** — `(see [Using an AI coding agent?](#using-an-ai-coding-agent))` → `(see [the README](README.md#what-you-just-installed))`. Then find every other reference:

```bash
grep -rnE "README\.md#|README's \"|\]\(#" --include=*.md --include=*.txt --include=*.js --include=*.hbs . | grep -v node_modules | grep -v '^./docs/' | grep -v '^./planning/'
```

Every `(#anchor)` in GUIDE.md must match a GUIDE.md heading; `plugins/kiss-ssg/README.md:14` is fixed in Task 7.

- [ ] **Step 4:** `npx prettier --write GUIDE.md && npx vitest run test/aikb.test.js test/unit/skill-coverage.test.js` — PASS.

- [ ] **Step 5: Commit** (README is intermediate here; Task 6 rewrites its top)

```bash
git add GUIDE.md README.md test/aikb.test.js test/unit/skill-coverage.test.js && git commit -F - <<'EOF'
docs: move the library reference from README.md to a shipped GUIDE.md

Headings kept, so in-file anchors survive. The config-defaults test and the
contradiction scan follow the content.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

---

### Task 6: README — agent first

**Files:** Modify `README.md` (whole file replaced).

- [ ] **Step 1: Write `README.md`** (if Task 1's probe was negative, insert the three `claude plugin … --scope project` lines between `npx kiss-ssg@latest init` and `claude`, and replace "It offers to install…" with "Restart `claude` if it was already running."):

````markdown
# kiss-ssg

A static site generator built to be driven by a coding agent. You describe the site; the agent writes it with kiss-ssg's skills, and every build hands back a verdict it can act on (`kiss-ssg check`) and a memory of what the site is (`kiss-ssg aikb`). Handlebars views, JSON or fetched models, small JS controllers — nothing to learn before the first page, and nothing hidden from the person who opens it later.

## Quick start

You need [Node 22.12+](https://nodejs.org) and [Claude Code](https://claude.com/claude-code).

```sh
mkdir my-site && cd my-site
npx kiss-ssg@latest init
claude
```

`init` installs kiss-ssg, drops a one-page starter site, points `CLAUDE.md` and `AGENTS.md` at the API contract, and declares kiss-ssg's two Claude Code plugins in `.claude/settings.json` — at **project scope**, so anyone who clones the site is offered the same skills. When `claude` opens, trust the folder. It offers to install the plugins; accept. Then paste:

> Use the kiss-site-new skill to build me a site for **a small bakery in Leeds: home, menu, about, and a news section for seasonal specials**. Run the build check when you're done.

Change the bold part. That's the whole setup. `npm run dev` previews the site with live reload; `npm run build` writes it to `public/`.

Running `init` in a folder that already has a site is safe: it never overwrites a file, merges into `package.json` and `.claude/settings.json` key by key, and leaves an existing `router.js` or `src/` alone. Running it twice changes nothing.

## Prompts to copy

You don't have to name the skills — each one's description is written so Claude reaches for it on its own — but naming one makes the first run predictable.

| You want to…                  | Paste                                                                                          | Skill it reaches                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Start a site                  | Use the kiss-site-new skill to build me a site for …                                           | `kiss-site-new`                          |
| Add a whole section           | Add a blog section to this site: posts from Markdown files, a paginated index and an RSS feed. | `kiss-site-new`                          |
| Add or change one page        | Add a Contact page with our address and opening hours, linked from the nav.                    | `kiss-page-add`                          |
| Find out why a build fails    | The kiss build is failing — run the check and fix what it reports.                             | `kiss-build-check`                       |
| Catch up on a site            | Catch me up on this site: what it is, how it's built and what bites.                           | `kiss-site-brief`                        |
| Upgrade kiss-ssg              | Upgrade this site to the latest kiss-ssg and tell me what changed.                             | `kiss-site-migrate`                      |
| Frame, steer, finish a change | Open a branch for … / Pulse this branch / We're done, close the branch.                        | `kiss-branch-open` / `-pulse` / `-close` |

## What you just installed

**The `kiss-ssg` plugin builds sites.** `kiss-site-new` (a site or a whole section from a description), `kiss-page-add` (one page on a site that already builds), `kiss-build-check` (verify a build and read its report), `kiss-site-migrate` (move a site across kiss-ssg versions). The skills carry no copy of the API — each reads the docs installed in `node_modules/kiss-ssg/`, so the guidance cannot drift from the engine you have. [`plugins/kiss-ssg/`](plugins/kiss-ssg/)

**The `kiss-memory` plugin remembers them.** `npx kiss-ssg aikb router.js` records what the site is into `AIKB/`; `kiss-site-brief` reads it back to a developer returning after two years, and `kiss-branch-open`, `-pulse` and `-close` frame, steer and close a piece of work against the site's own build output, moving the baseline only when the close records it. `kiss-memory-consolidate` tidies between pieces of work. [`plugins/kiss-memory/`](plugins/kiss-memory/)

**In `node_modules/kiss-ssg/`**, for any agent: `llms.txt` (the API contract — `CLAUDE.md` imports it), `examples/` (eleven runnable sites to copy by shape), `AIKB/` (per-module notes), `GUIDE.md` (the reference below), `types/` (declarations your editor reads) and `CHANGELOG.md`.

**The verdict.** `npx kiss-ssg check router.js` runs your build as a dry run and prints one JSON report per site, exit 1 on any failure, without touching the published output — see [Checking a build](GUIDE.md#checking-a-build).

## Setting up by hand

If you'd rather not run `init`, or the site already exists:

```sh
npm install --save-dev kiss-ssg
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
```

Then add `@node_modules/kiss-ssg/llms.txt` to the project's `CLAUDE.md`. Inside a running session, `/plugin` does the same — choose project scope when it asks — followed by `/reload-plugins`.

**Other agents** (Codex, Cursor, Copilot…): the plugins are Claude Code's, but everything they point at ships in the package. Tell the agent, in its own instructions file (`AGENTS.md` for Codex — `init` writes one), to read `node_modules/kiss-ssg/llms.txt` before touching the site and to verify with `npx kiss-ssg check router.js`.

## Requirements

Node 22.12 or newer. kiss-ssg is an ES module (`import Kiss from 'kiss-ssg'`); `require('kiss-ssg')` also works on Node ≥22.12.

## Using the library directly

Every method, option and helper — the build script, `.page()` / `.pages()` / `.scan()`, controllers, assets and cache busting, the sitemap, `llms.txt`, RSS and `robots.txt`, redirects, host URL policy, checking and recording a build, the helpers, and migrating from v1 — is in **[GUIDE.md](GUIDE.md)**.
````

- [ ] **Step 2: Verify the anchors** — `GUIDE.md#checking-a-build` exists (`grep -n '^### Checking a build' GUIDE.md`). `npx prettier --write README.md && npx vitest run test/unit/skill-coverage.test.js test/aikb.test.js`.

- [ ] **Step 3: Eyeball** — render README.md on the pushed branch later; for now read the first 40 lines and confirm the first screen is the Quick start.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -F - <<'EOF'
docs: README is the agent quick start; the reference lives in GUIDE.md

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

---

### Task 7: Everything that tells an agent how to install (slice 3 closes)

**Files:**

- Modify: `plugins/kiss-ssg/README.md` (Install section + line 14 link), `plugins/kiss-memory/README.md` (Install section), `plugins/kiss-ssg/skills/kiss-site-new/SKILL.md` (steps 1–2 + starter rule), `test/unit/skill-coverage.test.js` (COVERAGE row + CONTRADICTIONS row), `llms.txt` (line 7 + a `## Starting a site` section), `CLAUDE.md` (bin paragraph, `files` sentence, commands block)

- [ ] **Step 1: Failing tests** — in `skill-coverage.test.js`, add to `COVERAGE`:

```js
  {
    feature: 'kiss-ssg init — a starter to grow, not a site to preserve',
    pattern: /Started by `npx kiss-ssg init`[\s\S]*grow/,
    skills: [skill('kiss-ssg', 'kiss-site-new')],
  },
```

and to `CONTRADICTIONS`:

```js
  {
    why: 'plugins install at project scope; a bare user-scope install line is the instruction this branch replaced',
    patterns: [/^\/plugin install kiss-(?:ssg|memory)@kiss-ssg`?$/m, /`\/plugin install kiss-(?:ssg|memory)@kiss-ssg`/],
  },
```

Run `npx vitest run test/unit/skill-coverage.test.js` — FAIL on both (the skill lacks the marker; the plugin READMEs and `llms.txt:7` still carry bare installs).

- [ ] **Step 2: `kiss-site-new`** — in `SKILL.md` step 1, after the first paragraph add:

```markdown
If the folder was set up with `npx kiss-ssg init`, the engine is already installed and step 2's import is already in `CLAUDE.md` — say so and move on. `init` also drops a one-page starter: a `router.js` whose first line reads `// Started by \`npx kiss-ssg init\``. That file is a starter to grow, not a site to preserve — edit its config and add to `src/`in place rather than writing a second build script beside it. A`router.js` **without** that line is somebody's site: build around it.
```

- [ ] **Step 3: Plugin READMEs** — replace each `## Install` block with:

````markdown
## Install

In a new folder, `npx kiss-ssg@latest init` declares both plugins for the project and Claude Code offers them the next time it opens there. To add them to a site that already exists, from its folder:

```
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
```

Project scope writes them into the site's `.claude/settings.json`, so everyone who opens the site gets the same skills. Inside a running session, `/plugin` does the same — choose project scope — followed by `/reload-plugins`. See the root [README's Quick start](../../README.md#quick-start).
````

(kiss-memory's copy omits nothing — both plugins are listed in both, since `init` declares both.) Fix `plugins/kiss-ssg/README.md:14`'s `README.md#using-an-ai-coding-agent` — it is inside the replaced block, so it is gone.

- [ ] **Step 4: `llms.txt`** (LF!) — replace the install clause on line 7 with: ``install from this repository's marketplace at project scope — `npx kiss-ssg init` declares both in the site's `.claude/settings.json`, or `claude plugin marketplace add cprobert/kiss-ssg --scope project` then `claude plugin install kiss-ssg@kiss-ssg --scope project` and `claude plugin install kiss-memory@kiss-ssg --scope project`.``. Add before `## Checking a build`:

```markdown
## Starting a site

`npx kiss-ssg init` sets the current folder up for a coding agent and never overwrites a file: it creates or merges `package.json` (`"type": "module"`, `build` / `dev` / `check` scripts), appends `@node_modules/kiss-ssg/llms.txt` to `CLAUDE.md` and a pointer to `AGENTS.md`, declares the `kiss-ssg` marketplace and both plugins in `.claude/settings.json`, installs `kiss-ssg` at its own version unless `--no-install`, and — only when neither `router.js` nor `src/` exists — drops a one-page starter whose `router.js` begins `// Started by \`npx kiss-ssg init\``. Grow that starter; do not write a second build script beside it. Running `init` twice changes nothing.
```

Then `node -e "const f='llms.txt',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"`.

- [ ] **Step 5: `CLAUDE.md`** — the `bin/kiss-ssg.js` sentence becomes `` `bin/kiss-ssg.js` is the published command line (`npx kiss-ssg init`, `npx kiss-ssg check <script>` and `npx kiss-ssg aikb <script>`) — a thin wrapper whose decisions all live in `lib/init.js` and `lib/check.js`. ``; the `files` sentence lists `GUIDE.md` and `starter/`; the commands block gains

```
npx kiss-ssg init              # set a folder up for an agent: project-scope plugins,
                               # CLAUDE.md/AGENTS.md, package.json scripts, and a starter
                               # site when there is none. Never overwrites; --no-install.
```

- [ ] **Step 6:** `npm test` — PASS; `npx prettier --write plugins llms.txt CLAUDE.md` then re-normalise `llms.txt` to LF; `grep -rn "using-an-ai-coding-agent" --include=*.md --include=*.txt . | grep -v node_modules | grep -v planning/` — empty.

- [ ] **Step 7: Commit, then pulse**

```bash
git add plugins llms.txt CLAUDE.md test/unit/skill-coverage.test.js && git commit -F - <<'EOF'
docs: every install instruction is project scope and knows about init

kiss-site-new grows an init starter instead of writing beside it; a bare
user-scope /plugin install line is now a contradiction the scan rejects.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YaYRZXyYMEeJFGeEUrDHLX
EOF
```

Offer `/branch-pulse` (slice 3 boundary).

---

### Task 8: Independent evidence

- [ ] **Step 1: Gates** — `npm run gates`. All five green; paste the tail.
- [ ] **Step 2: Corpse check** — run `/corpse-collector`; every finding about `README.md#` anchors, `GUIDE.md`, `init` or `starter/` is fixed on the branch.
- [ ] **Step 3: Clean-room run** (success criterion 6) — pack the tarball; spawn one fresh `general-purpose` agent with **only**: the packed tarball path, an empty temp folder, and the text of the new README's Quick start, told to follow it literally with `npm install --save-dev <tarball>` substituted for the registry, then act on the pasted bakery prompt using `node_modules/kiss-ssg/` docs (a sub-agent cannot install plugins, so the brief also gives it the absolute path `C:/Code/kiss-ssg/plugins/kiss-ssg/skills/kiss-site-new/SKILL.md` to follow as the skill), and to report every point where the README was ambiguous, plus the final `npx kiss-ssg check router.js` exit code. It must not commit. Fix what it trips on; record the result in the session log.
- [ ] **Step 4: Codex review** (success criterion 7) — `/codex:rescue` over `lib/init.js`, `bin/kiss-ssg.js`'s init block and `starter/`, asking specifically: what can `init` destroy, and on what folder states does it write something the person did not expect. Re-derive every finding locally before acting (CLAUDE.md § Rules). If Codex is unavailable, the session log says the branch has no independent review.
- [ ] **Step 5:** Commit any fixes by file with `-F`; offer `/branch-pulse`. `/branch-close` (version 2.7.0, CHANGELOG) only when the operator asks.
