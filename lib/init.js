// The decision core behind `kiss-ssg init`: given what is already in the
// folder, which files to create, which to merge into and which to leave alone.
// Pure — `bin/kiss-ssg.js` reads the folder, writes what this returns and runs
// npm. Nothing here overwrites: an existing file is merged into key by key,
// appended to, or skipped with a reason the person can act on.

export const MARKETPLACE = 'kiss-ssg'
export const MARKETPLACE_REPO = 'cprobert/kiss-ssg'
export const PLUGINS = ['kiss-ssg@kiss-ssg', 'kiss-memory@kiss-ssg']
export const LLMS_IMPORT = '@node_modules/kiss-ssg/llms.txt'
/**
 * Claude Code's plugin lines, and only those (no `mkdir`, `init` or `claude`):
 * the README, the docs homepage and `llms.txt` carry the same lines, and a test
 * compares them with these. They install at project scope, recorded in the
 * site's `.claude/settings.json`.
 *
 * @type {string[]}
 */
export const CLAUDE_STEPS = [
  `claude plugin marketplace add ${MARKETPLACE_REPO} --scope project`,
  ...PLUGINS.map((plugin) => `claude plugin install ${plugin} --scope project`),
]
/**
 * Codex's plugin lines, and only those. Codex reads the same marketplace
 * (`.claude-plugin/marketplace.json`). It enables plugins per project, from a
 * trusted project's `.codex/config.toml` (which `init` writes), but installs
 * them per user, and `codex plugin add` also switches them on for every folder
 * — so these run once per user (Codex CLI 0.157.1; `AIKB/upstream.md`).
 *
 * @type {string[]}
 */
export const CODEX_STEPS = [
  `codex plugin marketplace add ${MARKETPLACE_REPO}`,
  ...PLUGINS.map((plugin) => `codex plugin add ${plugin}`),
]
// `kiss-site-new` reads this line to tell a starter it should grow from a site
// it must preserve.
export const STARTER_MARKER = 'Started by `npx kiss-ssg init`'
// npm never packs a file named `.gitignore`, so the starter ships without the dot.
/** @type {Record<string, string>} */
export const STARTER_RENAMES = { gitignore: '.gitignore' }
export const FIRST_PROMPT =
  'Use the kiss-site-new skill to build me a site for <who it is for and what it should say>, with <the pages it needs>. It will be served by <the host, e.g. Netlify> at <https://its-address>. Run the build check when you are done.'
// The other front door: someone who already has a site — most often one made
// in Claude or ChatGPT, given as a link. `init` only offered the new-site
// prompt, so that person was told how to describe a site they already had.
export const IMPORT_PROMPT =
  'Use the kiss-site-import skill to turn <the link to your Claude artifact, ChatGPT share or live page> into a real site, keeping exactly how it looks. Run the build check when you are done.'

const SCRIPTS = {
  build: 'node router.js',
  dev: 'node router.js --dev',
  check: 'kiss-ssg check router.js',
  aikb: 'kiss-ssg aikb router.js',
}

const CLAUDE_MD = `# CLAUDE.md

This is a kiss-ssg static site. The engine's API contract, read on every session:

${LLMS_IMPORT}
`

// What an AGENTS.md has to mention to count as pointing at the contract.
const LLMS_POINTER = 'node_modules/kiss-ssg/llms.txt'

const AGENTS_POINTER = `## kiss-ssg

This is a kiss-ssg static site. Before changing the build script, views, models or
controllers, read \`node_modules/kiss-ssg/llms.txt\` (the API contract) and copy the
shape of the matching site in \`node_modules/kiss-ssg/examples/\`. Verify every change
with \`npx kiss-ssg check router.js\`, which exits 1 on any failed page.
`

// Checked for on its own, so an AGENTS.md an earlier `init` wrote (the pointer
// and nothing else) gains this section when `init` is run again.
const AGENTS_CODEX = `## kiss-ssg skills

The recipes for working on this site are skills, in two plugins: \`kiss-ssg\`
(\`kiss-site-new\`, \`kiss-site-import\`, \`kiss-page-add\`, \`kiss-build-check\`,
\`kiss-site-review\`, \`kiss-site-migrate\`) and \`kiss-memory\` (\`kiss-site-brief\`,
\`kiss-branch-open\`, \`kiss-branch-pulse\`, \`kiss-branch-close\`,
\`kiss-memory-consolidate\`). For Codex, \`.codex/config.toml\` records and enables
them for this site once Codex trusts the folder, but Codex installs plugins per
user: if they are not installed yet, run these in a shell (once per user; they
also switch the plugins on for every folder) and then start a new \`codex\`
session:

\`\`\`sh
${CODEX_STEPS.join('\n')}
\`\`\`

Claude Code installs the same plugins for this folder: \`npx kiss-ssg init\`
prints its three commands.
`

// The first Codex line marks the section: an AGENTS.md that has it is left alone.
const CODEX_MARKER = CODEX_STEPS[0]

const AGENTS_MD = `${AGENTS_POINTER}\n${AGENTS_CODEX}`

export const INIT_HELP = `kiss-ssg init [--no-install]

  Set this folder up for a coding agent, and start a site if there is none:

    package.json           created, or merged: the build, dev, check and aikb
                           scripts, and — only with the starter — "type":
                           "module" and "main": "router.js"
    CLAUDE.md, AGENTS.md   point the agent at node_modules/kiss-ssg/llms.txt;
                           AGENTS.md also names the kiss skills and the
                           codex plugin commands — added at the end of an
                           AGENTS.md that lacks them, such as one an
                           earlier init wrote
    .claude/settings.json  the kiss-ssg marketplace and its two plugins, the
                           entries claude plugin install --scope project
                           writes, so the site records which skills it uses
    .codex/config.toml     the same marketplace and plugins for Codex, which
                           a trusted project's config enables for that folder;
                           an existing file gains only the tables it lacks
    router.js, src/        a starter site — only when no project is here yet
                           (no router.js, no src/, no package.json main file
                           or build script) — and its node_modules/ and
                           public/ ignore rules,
                           added to any .gitignore already here
    node_modules/kiss-ssg  npm install --save-dev kiss-ssg@<this version>,
                           unless it is installed, package.json already asks
                           for a version, or --no-install is given

  Claude Code does not install plugins a settings file declares, so init ends
  by printing the three --scope project install commands to run before claude.
  Codex enables plugins per project, from .codex/config.toml once it trusts
  the folder, but installs them per user, and codex plugin add also switches
  them on for every folder: init prints its three codex plugin commands too,
  to run once per user before codex.

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
 * @property {boolean} hasEngine `node_modules/kiss-ssg/package.json` exists — an installed engine, not merely a folder by that name
 * @property {boolean} hasRouter `router.js` exists
 * @property {boolean} hasSrc `src/` exists
 * @property {boolean} hasMain `package.json`'s `main` names a file that exists
 * @property {{ 'package.json': string|null, 'CLAUDE.md': string|null, 'AGENTS.md': string|null, '.claude/settings.json': string|null, '.codex/config.toml': string|null, '.gitignore': string|null }} files each file's text, or null when absent
 * @property {Record<string, string>} starter the shipped `starter/` folder: path relative to it → text
 */

/**
 * @typedef {{ kind: 'write', path: string, content: string, verb: 'create'|'merge'|'append', detail?: string }
 *   | { kind: 'skip', path: string, reason: string }
 *   | { kind: 'install', spec: string }} InitAction
 */

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * @param {string} text
 * @returns {Record<string, any>|null} the parsed object, or null when it is not a JSON object
 */
function parseObject(text) {
  try {
    const value = JSON.parse(text)
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`

// The line ending a file already uses, so an addition does not mix them.
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * What says a project is already here, or `null` when nothing does. kiss's own
 * shape (`router.js`, `src/`) is not every project's, so a `main` that names a
 * real file, or a `build` script that is not ours, counts too. `npm init -y`
 * leaves neither — its `main` names an `index.js` it never writes — so a
 * folder it has just made still gets the starter.
 *
 * @param {InitState} state
 * @returns {string|null}
 */
function existingSite(state) {
  if (state.hasRouter) return 'router.js'
  if (state.hasSrc) return 'src/'
  const pkg =
    state.files['package.json'] === null
      ? null
      : parseObject(state.files['package.json'])
  if (state.hasMain && pkg) return `package.json main ${pkg.main}`
  const build = pkg && isObject(pkg.scripts) ? pkg.scripts.build : undefined
  if (build !== undefined && build !== SCRIPTS.build)
    return `package.json scripts.build "${build}"`
  return null
}

/**
 * `true` when this run writes the starter: nothing that looks like a site is
 * here yet. Only then does `init` decide the folder's module type and `main` —
 * on a site it did not write, those are the site's own business.
 *
 * @param {InitState} state
 */
const writesStarter = (state) => existingSite(state) === null

/**
 * @param {string|null} text
 * @param {InitState} state
 * @returns {InitAction}
 */
function planPackageJson(text, state) {
  const path = 'package.json'
  const starting = writesStarter(state)
  // A project that builds some other way: scripts naming a router.js that
  // does not exist would advertise commands that cannot run — whether the
  // package.json is being created or merged into.
  if (!starting && !state.hasRouter)
    return {
      kind: 'skip',
      path,
      reason:
        'no router.js — the site builds some other way, so no scripts were added',
    }
  if (text === null)
    return {
      kind: 'write',
      path,
      verb: 'create',
      content: toJson({
        name: packageName(state.folderName),
        private: true,
        ...(starting ? { type: 'module', main: 'router.js' } : {}),
        scripts: SCRIPTS,
      }),
    }
  const pkg = parseObject(text)
  if (!pkg)
    return {
      kind: 'skip',
      path,
      reason: `not valid JSON — left alone; add the ${Object.keys(SCRIPTS).join(', ')} scripts by hand`,
    }
  if (pkg.scripts !== undefined && !isObject(pkg.scripts))
    return {
      kind: 'skip',
      path,
      reason: '"scripts" is not an object — left alone rather than rewritten',
    }
  const added = []
  const notes = []
  const merged = { ...pkg }
  if (starting) {
    if (merged.type === undefined) {
      merged.type = 'module'
      added.push('type')
    } else if (merged.type === 'commonjs') {
      // npm 11's `npm init -y` writes "commonjs" by default, and a starter is
      // only written when the folder has no code yet — so the value is npm's
      // boilerplate, not the site's choice. Keeping it made the starter's own
      // router.js crash on its first `import` (the clean-room import run,
      // 2026-10-02). Changed, and said so.
      merged.type = 'module'
      notes.push(
        'changed "type" from "commonjs" (npm init\'s default) to "module" — the starter\'s router.js uses import',
      )
    } else if (merged.type !== 'module')
      notes.push(
        `kept "type": "${merged.type}" — router.js uses import, so set "type": "module" or rename it router.mjs`,
      )
    if (merged.main === undefined) {
      merged.main = 'router.js'
      added.push('main')
    } else if (merged.main !== 'router.js') {
      // Starting means no `main` names a real file (`existingSite`), so this is
      // npm init's "index.js" boilerplate, not a choice (Claude clean room,
      // 2026-10-02): point it at the starter, and say so.
      notes.push(
        `changed "main" from "${merged.main}" (a file that does not exist) to "router.js"`,
      )
      merged.main = 'router.js'
    }
  }
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
  const install =
    'install the plugins with claude plugin install kiss-ssg@kiss-ssg --scope project'
  /** @type {Record<string, any>} */
  let settings = {}
  if (text !== null) {
    settings = parseObject(text)
    if (!settings)
      return {
        kind: 'skip',
        path,
        reason: `not valid JSON — left alone; ${install}`,
      }
  }
  for (const key of ['extraKnownMarketplaces', 'enabledPlugins'])
    if (settings[key] !== undefined && !isObject(settings[key]))
      return {
        kind: 'skip',
        path,
        reason: `${key} is not an object — left alone; ${install}`,
      }
  const added = []
  // An entry the user wrote stays theirs, whatever its value: `in`, not
  // truthiness — so a plugin switched off stays off.
  const markets = { ...(settings.extraKnownMarketplaces ?? {}) }
  if (!(MARKETPLACE in markets)) {
    markets[MARKETPLACE] = {
      source: { source: 'github', repo: MARKETPLACE_REPO },
    }
    added.push(`marketplace ${MARKETPLACE}`)
  }
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

// `.codex/config.toml`, the counterpart of `.claude/settings.json`, in the form
// Codex writes itself (CLI 0.157.1). A trusted project's file enables these for
// that folder; the install is still `CODEX_STEPS`, per user.
const CODEX_TABLES = [
  {
    header: `[marketplaces.${MARKETPLACE}]`,
    key: `marketplaces.${MARKETPLACE}`,
    body: `source_type = "git"\nsource = "https://github.com/${MARKETPLACE_REPO}.git"\n`,
  },
  ...PLUGINS.map((plugin) => ({
    header: `[plugins."${plugin}"]`,
    key: `plugins.${plugin}`,
    body: 'enabled = true\n',
  })),
]
const tableText = ({ header, body }) => `${header}\n${body}`

/**
 * A table header line's key, compared by meaning rather than spelling:
 * `[ plugins . 'x' ] # note` and `[plugins."x"]` are both `plugins.x`. Null for
 * any other line. Splitting on dots is naive about a quoted segment holding a
 * dot, which no key kiss writes has, so such a key simply never matches.
 *
 * @param {string} line
 * @returns {string|null}
 */
function tomlHeaderKey(line) {
  const match = /^\s*\[(?!\[)([^\]]*)\]\s*(?:#.*)?$/.exec(line)
  if (!match) return null
  return match[1]
    .split('.')
    .map((segment) => segment.trim().replace(/^(["'])(.*)\1$/, '$2'))
    .join('.')
}

/**
 * Each table the file does not define is appended, whole, in the file's own
 * line ending; a table already there is the site's, whatever it says (a
 * plugin switched off stays off). No TOML parser, and TOML forbids defining a
 * table twice, so a duplicate would make the whole file unloadable: headers are
 * compared by meaning (`tomlHeaderKey`), and a file that defines one of these
 * keys any other way — a dotted key, an inline table, a `[marketplaces]` table —
 * is left exactly as it is, with a note to add the rest by hand.
 *
 * @param {string|null} text
 * @returns {InitAction}
 */
function planCodexConfig(text) {
  const path = '.codex/config.toml'
  if (text === null)
    return {
      kind: 'write',
      path,
      verb: 'create',
      content: CODEX_TABLES.map(tableText).join('\n'),
    }
  const lines = text.split(/\r?\n/)
  const have = new Set(lines.map(tomlHeaderKey).filter(Boolean))
  const missing = CODEX_TABLES.filter((table) => !have.has(table.key))
  // Anything else that names one of these keys is a definition this check
  // cannot see the shape of: appending could define it twice.
  const other = lines.filter(
    (line) => tomlHeaderKey(line) === null && !/^\s*#/.test(line),
  )
  // An allow-list, not a list of bad shapes: two review rounds each found a
  // shape a deny-list missed (an inline `plugins = {}`, then `[[plugins]]`),
  // because any form that makes `plugins` or `marketplaces` something other
  // than a plain table — an inline table, an array of tables, a dotted key, a
  // quoted key — cannot take an appended [header]. So a line that mentions
  // either word is safe only as a plain header under it; anything else, even a
  // shape nobody has thought of, leaves the file alone.
  const parentWord = /\b(?:plugins|marketplaces)\b/
  const safeHeader = (key) =>
    key === 'plugins' ||
    key.startsWith('plugins.') ||
    key.startsWith('marketplaces.')
  const unsafeParent = lines.some((line) => {
    if (/^\s*#/.test(line) || !parentWord.test(line)) return false
    const key = tomlHeaderKey(line)
    return key === null || !safeHeader(key)
  })
  const elsewhere = [
    ...PLUGINS.filter((plugin) => other.some((line) => line.includes(plugin))),
    ...(unsafeParent ? ['plugins or marketplaces'] : []),
  ]
  if (missing.length > 0 && elsewhere.length > 0)
    return {
      kind: 'skip',
      path,
      reason: `defines ${elsewhere.join(', ')} in a form init does not merge; add the rest by hand`,
    }
  if (missing.length === 0)
    return { kind: 'skip', path, reason: 'already declares the plugins' }
  const eol = eolOf(text)
  const joint = text === '' ? '' : text.endsWith('\n') ? eol : `${eol}${eol}`
  return {
    kind: 'write',
    path,
    verb: 'append',
    content: `${text}${joint}${missing.map(tableText).join('\n').replace(/\n/g, eol)}`,
    detail: `added ${missing.map((table) => table.header).join(', ')}`,
  }
}

/**
 * An instructions file: written whole when there is none, otherwise appended
 * with each part it lacks — checked part by part, so a file an earlier `init`
 * wrote gains a part added since. Existing text is never rewritten. Each part
 * is `marker` (the text whose presence says the file has it), `text` (what is
 * appended when it does not), `has` (the skip reason's words for it, "points
 * at llms.txt") and `name` (the detail's words for it, "the llms.txt pointer").
 *
 * @param {string} path
 * @param {string|null} text
 * @param {string} fresh the whole file when there is none
 * @param {{ marker: string, text: string, has: string, name: string }[]} parts
 * @returns {InitAction}
 */
function planPointer(path, text, fresh, parts) {
  if (text === null)
    return { kind: 'write', path, verb: 'create', content: fresh }
  const missing = parts.filter((part) => !text.includes(part.marker))
  if (missing.length === 0)
    return {
      kind: 'skip',
      path,
      reason: `already ${parts.map((part) => part.has).join(' and ')}`,
    }
  const eol = eolOf(text)
  const joint = text.endsWith('\n') ? eol : `${eol}${eol}`
  const addition = missing.map((part) => part.text).join('\n')
  return {
    kind: 'write',
    path,
    verb: 'append',
    content: `${text}${joint}${addition.replace(/\n/g, eol)}`,
    detail: `added ${missing.map((part) => part.name).join(' and ')}`,
  }
}

/**
 * The starter's ignore rules, added to whatever `.gitignore` is already here —
 * a `.env` line a site already ignores must never be lost to a starter.
 *
 * @param {string|null} text
 * @param {string} starterText
 * @returns {InitAction}
 */
function planGitignore(text, starterText) {
  const path = '.gitignore'
  if (text === null)
    return { kind: 'write', path, verb: 'create', content: starterText }
  const have = new Set(text.split(/\r?\n/).map((line) => line.trim()))
  const missing = starterText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !have.has(line))
  if (missing.length === 0)
    return {
      kind: 'skip',
      path,
      reason: 'already ignores what the starter needs',
    }
  const eol = eolOf(text)
  const joint = text === '' || text.endsWith('\n') ? '' : eol
  return {
    kind: 'write',
    path,
    verb: 'append',
    content: `${text}${joint}${missing.join(eol)}${eol}`,
    detail: `added ${missing.join(', ')}`,
  }
}

/**
 * @param {InitState} state
 * @returns {InitAction[]}
 */
function planStarter(state) {
  if (!writesStarter(state))
    return [
      {
        kind: 'skip',
        path: 'router.js',
        reason: `a site is already here (${existingSite(state)}) — no starter written`,
      },
    ]
  return Object.entries(state.starter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, content]) => {
      const path = STARTER_RENAMES[from] ?? from
      if (path === '.gitignore')
        return planGitignore(state.files['.gitignore'], content)
      return /** @type {InitAction} */ ({
        kind: 'write',
        path,
        verb: 'create',
        content,
      })
    })
}

/**
 * The range a site's package.json already asks for, if it asks for kiss-ssg
 * at all — then `npm install` is the command, not `npm install kiss-ssg@x`,
 * which would replace the range the site chose.
 *
 * @param {string|null} text
 * @returns {string|null}
 */
function declaredRange(text) {
  const pkg = text === null ? null : parseObject(text)
  if (!pkg) return null
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ])
    if (isObject(pkg[field]) && typeof pkg[field]['kiss-ssg'] === 'string')
      return pkg[field]['kiss-ssg']
  return null
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
    planPackageJson(state.files['package.json'], state),
    ...planStarter(state),
    planPointer('CLAUDE.md', state.files['CLAUDE.md'], CLAUDE_MD, [
      {
        marker: LLMS_POINTER,
        text: `${LLMS_IMPORT}\n`,
        has: 'points at llms.txt',
        name: 'the llms.txt import',
      },
    ]),
    planPointer('AGENTS.md', state.files['AGENTS.md'], AGENTS_MD, [
      {
        marker: LLMS_POINTER,
        text: AGENTS_POINTER,
        has: 'points at llms.txt',
        name: 'the llms.txt pointer',
      },
      {
        marker: CODEX_MARKER,
        text: AGENTS_CODEX,
        has: 'names the Codex plugins',
        name: 'the kiss skills and their Codex install',
      },
    ]),
    planSettings(state.files['.claude/settings.json']),
    planCodexConfig(state.files['.codex/config.toml']),
  ]
  if (!state.hasEngine) {
    const range = declaredRange(state.files['package.json'])
    if (range !== null)
      actions.push({
        kind: 'skip',
        path: 'node_modules/kiss-ssg',
        reason: `package.json already depends on kiss-ssg ${range} — run npm install to fetch it`,
      })
    else if (state.install)
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
 * What to do after `init`, for either agent: install the plugins, open the
 * agent, paste a prompt. Claude Code's block comes first, then Codex's, each
 * ending with its own "Run …" line, then the prompts both share.
 *
 * The Claude Code commands are printed rather than implied by the settings
 * file: Claude Code does not offer to install plugins a project's
 * `.claude/settings.json` declares when it first opens the folder (observed
 * 2026-09-26 on a clean profile), so a declaration alone installs nothing.
 * Codex enables plugins per project, from the `.codex/config.toml` `init`
 * wrote, once it trusts the folder, but installs them per user, and
 * `codex plugin add` also switches them on for every folder (CLI 0.157.1).
 *
 * @returns {string}
 */
export function nextSteps() {
  /** @param {string[]} lines */
  const commands = (lines) => lines.map((line) => `    ${line}`)
  return [
    'Next:',
    '  With Claude Code, install the skills for this project. init declared',
    '  them in .claude/settings.json, but a declaration installs nothing:',
    ...commands(CLAUDE_STEPS),
    '  Run `claude` in this folder.',
    '',
    '  Or with Codex: init enabled the skills for this folder in',
    '  .codex/config.toml (Codex reads it once it trusts the folder), but',
    '  Codex installs plugins per user. Run these once per user; they also',
    '  switch the skills on for every folder, so skip them if you have before:',
    ...commands(CODEX_STEPS),
    '  Run `codex` in this folder.',
    '',
    '  Then paste one of these. To start a new site:',
    `    ${FIRST_PROMPT}`,
    '  Or, to turn a site you already have into a kiss one:',
    `    ${IMPORT_PROMPT}`,
    '',
    'Build it yourself any time with `npm run build`, preview with `npm run dev`,',
    'and verify with `npm run check`.',
  ].join('\n')
}
