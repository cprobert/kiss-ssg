// The command line of scripts/arms.mjs, parsed and checked in one place, so a
// typo is an error before anything is copied, installed or spent.
//
// The CLI is the seam with the measurement step, fixed by the contract
// (planning/plans/2026-11-02-kiss-legal-and-privacy.md), with its critique
// section winning over its body: the plugin tree comes from `git archive` of a
// recorded sha (`--plugin-ref`), never from a live directory, so `--plugin
// <dir>` is refused with that reason rather than quietly accepted.
import { parseArgs } from 'node:util'

export class ArmsUsageError extends Error {}

export const COMMANDS = /** @type {const} */ (['setup', 'run', 'summarise'])

// An arm name becomes a folder name and a log label: letters, digits and
// hyphens only, so it is the same on Windows and in a shell line.
const ARM_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

/** @type {Record<string, Record<string, { type: 'string'|'boolean', default?: any }>>} */
const OPTIONS = {
  setup: {
    site: { type: 'string' },
    commit: { type: 'string' },
    arm: { type: 'string' },
    'plugin-ref': { type: 'string' },
    'plugin-path': { type: 'string', default: 'plugins/kiss-ssg' },
    plugin: { type: 'string' },
    engine: { type: 'string' },
    out: { type: 'string' },
    model: { type: 'string' },
  },
  run: {
    'arm-dir': { type: 'string' },
    brief: { type: 'string' },
    budget: { type: 'string', default: '6' },
    model: { type: 'string' },
    'print-only': { type: 'boolean', default: false },
  },
  summarise: {
    'arm-dir': { type: 'string' },
    'answer-key': { type: 'string' },
    bench: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
}

const REQUIRED = {
  setup: ['site', 'commit', 'arm', 'plugin-ref', 'out'],
  run: ['arm-dir', 'brief'],
  summarise: ['arm-dir'],
}

export const USAGE = `Usage:
  node scripts/arms.mjs setup     --site <repo> --commit <sha> --arm <name> --plugin-ref <ref> --out <dir>
                                  [--plugin-path plugins/kiss-ssg] [--engine <tgz>] [--model <id>]
  node scripts/arms.mjs run       --arm-dir <dir> --brief <file> [--budget <usd>] [--model <id>] [--print-only]
  node scripts/arms.mjs summarise --arm-dir <dir> [--answer-key <file>] [--bench a1k9|fixture] [--json]`

/**
 * Parse `argv` (without node and the script) into a command and its options.
 * Throws `ArmsUsageError` for an unknown command or option, a missing required
 * option, or a value that cannot be right.
 *
 * @param {string[]} argv
 * @returns {{ command: 'setup'|'run'|'summarise', options: Record<string, any> }}
 */
export function parseArmsArgs(argv) {
  const [command, ...rest] = argv
  if (!COMMANDS.includes(/** @type {any} */ (command)))
    throw new ArmsUsageError(
      `${command ? `unknown command "${command}"` : 'no command'}: expected one of ${COMMANDS.join(', ')}`,
    )
  let values
  try {
    ;({ values } = parseArgs({
      args: rest,
      options: OPTIONS[command],
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    throw new ArmsUsageError(`${command}: ${error.message}`)
  }
  if (command === 'setup' && values.plugin !== undefined)
    throw new ArmsUsageError(
      'setup: --plugin <dir> is not accepted: the plugin tree is taken from git archive of a recorded sha. Pass --plugin-ref <ref> (a branch, tag or sha of this repository)',
    )
  const missing = REQUIRED[command].filter((name) => values[name] === undefined)
  if (missing.length)
    throw new ArmsUsageError(
      `${command}: missing ${missing.map((m) => `--${m}`).join(', ')}`,
    )
  /** @type {Record<string, any>} */
  const options = { ...values }
  delete options.plugin
  if (command === 'setup' && !ARM_NAME.test(options.arm))
    throw new ArmsUsageError(
      `setup: --arm "${options.arm}" must be letters, digits and hyphens (at most 64)`,
    )
  if (command === 'run') {
    const budget = Number(options.budget)
    if (!Number.isFinite(budget) || budget <= 0)
      throw new ArmsUsageError(
        `run: --budget "${options.budget}" must be a positive number of US dollars`,
      )
    options.budget = budget
  }
  if (
    command === 'summarise' &&
    options.bench !== undefined &&
    !['a1k9', 'fixture'].includes(options.bench)
  )
    throw new ArmsUsageError(
      `summarise: --bench "${options.bench}" must be a1k9 or fixture`,
    )
  return { command: /** @type {any} */ (command), options }
}
