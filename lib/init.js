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
    .claude/settings.json  the kiss-ssg marketplace and its two plugins, the
                           entries claude plugin install --scope project
                           writes, so the site records which skills it uses
    router.js, src/        a starter site — only when neither exists yet
    node_modules/kiss-ssg  npm install --save-dev kiss-ssg@<this version>,
                           unless it is there already or --no-install is given

  Claude Code does not install plugins a settings file declares, so init ends
  by printing the three --scope project install commands to run before claude.

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
 * What to do after `init`: install the plugins, open the agent, paste a prompt.
 * The install commands are printed rather than implied by the settings file:
 * Claude Code does not offer to install plugins a project's
 * `.claude/settings.json` declares when it first opens the folder (observed
 * 2026-09-26 on a clean profile), so a declaration alone installs nothing.
 *
 * @returns {string}
 */
export function nextSteps() {
  return [
    'Next:',
    '  1. Install the skills for this project:',
    '       claude plugin marketplace add cprobert/kiss-ssg --scope project',
    '       claude plugin install kiss-ssg@kiss-ssg --scope project',
    '       claude plugin install kiss-memory@kiss-ssg --scope project',
    '  2. Run `claude` in this folder.',
    '  3. Paste:',
    `       ${FIRST_PROMPT}`,
    '',
    'Build it yourself any time with `npm run build`, preview with `npm run dev`,',
    'and verify with `npm run check`.',
  ].join('\n')
}
