// The one place the `claude -p` argument list for an arm is built.
//
// An arm is a headless Claude Code session in a copy of a site. It runs with
// an allow-list of tools and a deny list on top, and never with a permission
// bypass: `--dangerously-skip-permissions` read as creating unsafe agents and
// the session's permission check refused it (2026-11-01, upgrade-arms.md).
// Every value that reaches the list is checked first, and the finished list is
// checked again, so no input can produce a bypass flag.
//
// Flags verified against `claude --help` of Claude Code 2.1.316 (2026-11-02):
// -p, --output-format stream-json, --verbose, --setting-sources,
// --strict-mcp-config, --no-chrome, --no-session-persistence, --plugin-dir,
// --permission-mode (acceptEdits), --permission-prompts (none: anything not
// allowed is denied, nobody is asked), --max-budget-usd, --model,
// --allowedTools and --disallowedTools (both variadic, so they come last; the
// brief goes in on stdin, not as a positional a variadic option would eat).
import path from 'node:path'

/**
 * The tools an arm may use. PowerShell is left out on purpose: the deny list
 * is written as `Bash(...)` rules, and a shell the deny list does not cover
 * would walk round it. Bash is allowed whole, as in every earlier arm, so an
 * arm works the way a real session does; the deny list below is what it may
 * not do.
 */
export const ALLOWED_TOOLS = Object.freeze([
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'Skill',
  'Bash',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
])

/**
 * Commands an arm may not run: commit, push and remote (the copy is the
 * record, and the baseline is what it is diffed against), GitHub, publishing
 * and every deploy CLI a fleet site has used. Prefix rules, the `:*` form the
 * 2026-10-31 arms ran with. A rule is a prefix, so `git -C . commit` is not
 * caught here; `summarise` reports commits made after the baseline and every
 * commit attempt in the transcript, whichever way it was spelled.
 */
export const DENIED_COMMANDS = Object.freeze([
  'git commit',
  'git push',
  'git remote',
  'gh',
  'npm publish',
  'netlify',
  'npx netlify',
  'firebase',
  'npx firebase',
  'vercel',
  'npx vercel',
  'wrangler',
  'npx wrangler',
])

export const DENIED_TOOLS = Object.freeze(
  DENIED_COMMANDS.map((command) => `Bash(${command}:*)`),
)

/** Flags that bypass or offer to bypass permission checks. */
export const BYPASS_FLAGS = Object.freeze([
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
])

/** Permission modes that are, or decide in place of, the allow-list. */
export const BYPASS_MODES = Object.freeze(['bypassPermissions', 'auto'])

export const PERMISSION_MODE = 'acceptEdits'

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,127}$/
const MAX_BUDGET_USD = 100

/**
 * Throws when `argv` contains a bypass flag, a bypass permission mode, or a
 * value that is spelled as a bypass flag. Run on every list this module
 * returns.
 *
 * @param {string[]} argv
 */
export function assertNoBypass(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i])
    const flag = arg.split('=')[0]
    // Anywhere, not only in flag position: a value spelled as a bypass (a
    // model id of "bypassPermissions") has no business in the list either.
    if (
      BYPASS_FLAGS.includes(flag) ||
      /bypassPermissions|dangerously/i.test(arg)
    )
      throw new Error(`refusing a permission bypass: ${arg}`)
    if (flag === '--permission-mode') {
      const mode = arg.includes('=')
        ? arg.slice(arg.indexOf('=') + 1)
        : argv[i + 1]
      if (
        mode === undefined ||
        BYPASS_MODES.includes(mode) ||
        mode !== PERMISSION_MODE
      )
        throw new Error(`refusing permission mode ${mode}`)
    }
  }
}

/**
 * The argument list for one arm's `claude -p` session. The brief is not in it:
 * it goes in on stdin.
 *
 * @param {{ pluginDir: string, budget: number, model?: string|null }} options
 * @returns {string[]}
 */
export function buildClaudeArgv({ pluginDir, budget, model = null }) {
  if (typeof pluginDir !== 'string' || !path.isAbsolute(pluginDir))
    throw new Error(`pluginDir must be an absolute path, got ${pluginDir}`)
  if (pluginDir.startsWith('-'))
    throw new Error(`pluginDir must not start with "-": ${pluginDir}`)
  if (
    typeof budget !== 'number' ||
    !Number.isFinite(budget) ||
    budget <= 0 ||
    budget > MAX_BUDGET_USD
  )
    throw new Error(
      `budget must be a number of US dollars above 0 and at most ${MAX_BUDGET_USD}, got ${budget}`,
    )
  if (model !== null && (typeof model !== 'string' || !MODEL_ID.test(model)))
    throw new Error(
      `model must be a model id (letters, digits, . _ : - [ ]), got ${model}`,
    )
  const argv = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    'local',
    '--strict-mcp-config',
    '--no-chrome',
    '--no-session-persistence',
    '--plugin-dir',
    pluginDir,
    '--permission-mode',
    PERMISSION_MODE,
    '--permission-prompts',
    'none',
    '--max-budget-usd',
    String(budget),
    ...(model ? ['--model', model] : []),
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DENIED_TOOLS,
  ]
  assertNoBypass(argv)
  return argv
}

// POSIX shell quoting: a word made only of safe characters is left bare,
// anything else is single-quoted with each ' closed, escaped and reopened.
/** @param {string} word */
export function shellQuote(word) {
  const text = String(word)
  if (text !== '' && /^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/**
 * The exact command, as one bash line (Git Bash on Windows, any POSIX shell
 * elsewhere), copy-paste ready for the operator when the session's own
 * permission check refuses to launch it. Paths are written with forward
 * slashes, which Git Bash and Windows both accept.
 *
 * @param {{ cwd: string, argv: string[], stdin: string, stdout: string, stderr: string, env?: Record<string,string> }} options
 */
export function formatCommand({ cwd, argv, stdin, stdout, stderr, env = {} }) {
  const slash = (/** @type {string} */ p) => p.replace(/\\/g, '/')
  const envPart = Object.entries(env)
    .map(([k, v]) => `${k}=${shellQuote(slash(v))}`)
    .join(' ')
  return [
    `cd ${shellQuote(slash(cwd))} &&`,
    envPart,
    'claude',
    argv.map((a) => shellQuote(a.startsWith('-') ? a : slash(a))).join(' '),
    `< ${shellQuote(slash(stdin))}`,
    `> ${shellQuote(slash(stdout))}`,
    `2> ${shellQuote(slash(stderr))}`,
  ]
    .filter(Boolean)
    .join(' ')
}
