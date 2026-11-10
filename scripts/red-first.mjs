#!/usr/bin/env node
// The red-first record: was a new test seen to fail before the fix? CLAUDE.md
// accepts a regression test only once it has been, and nothing recorded it.
//
//   node scripts/red-first.mjs <test file> [-t <test name>]
//
// It resolves the base branch (`resolveBaseBranch`, the one every branch skill
// uses), checks that base out into a temporary worktree in the OS temp, copies
// ONLY the test file in, links this checkout's node_modules, runs the test
// there, removes the worktree in a `finally` and prints one Markdown line for
// the pulse log:
//
//   - red-first: test/unit/x.test.js failed at main (abc1234), 2026-11-10
//
// The test is run against the base's `lib/`, so it fails there exactly when
// the fix is not in the base. A test that needs a fixture or helper that does
// not exist at the base fails there too, for that reason and not the one it is
// meant to show: read the output before trusting the line.
//
// Exit 0 when the test failed at the base (the wanted result), 1 when it
// passed there (the test proves nothing), 2 when it could not run (a usage
// error, no base, no such test file, a worktree that would not be made, or
// vitest finding no test). The decisions live in the exported functions,
// tested in test/unit/red-first.test.js; the git and vitest calls are thin.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { git, GitError } from '../lib/git.js'
import { isMain } from './is-main.mjs'
import { BaseBranchError, resolveBaseBranch } from './base-branch.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const USAGE = `Usage: node scripts/red-first.mjs <test file> [-t <test name>]

  <test file>  a test file in this checkout (e.g. test/unit/x.test.js)
  -t <name>    run only the tests whose name matches, as vitest's -t does

Runs the test against the base branch's code in a temporary worktree and
prints the line to paste into the pulse log.

Exit 0: it failed at the base (wanted). Exit 1: it passed there, so it proves
nothing. Exit 2: it could not run.`

/**
 * @typedef {Object} RedArgs
 * @property {string|null} file
 * @property {string|null} name
 * @property {boolean} help
 * @property {string|null} error
 */

/**
 * @param {string[]} argv `process.argv.slice(2)`
 * @returns {RedArgs}
 */
export function parseArgs(argv = []) {
  /** @type {RedArgs} */
  const parsed = { file: null, name: null, help: false, error: null }
  const fail = (/** @type {string} */ message) => {
    parsed.error = message
    return parsed
  }
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (arg.startsWith('-')) {
      const eq = arg.indexOf('=')
      const flag = eq === -1 ? arg : arg.slice(0, eq)
      if (flag !== '-t') return fail(`unknown option: ${flag}`)
      const value = eq === -1 ? argv[++at] : arg.slice(eq + 1)
      if (value === undefined || value === '') return fail('-t needs a value')
      parsed.name = value
      continue
    }
    if (parsed.file) return fail(`one test file at a time: ${arg}`)
    parsed.file = arg
  }
  if (parsed.help) return parsed
  if (!parsed.file) return fail('name the test file')
  return parsed
}

/**
 * The one Markdown line the pulse log keeps.
 *
 * @param {{ file: string, name?: string|null, base: string, sha: string, failed: boolean, date: string }} run
 */
export function recordLine({ file, name, base, sha, failed, date }) {
  const what = name ? `${file} -t "${name}"` : file
  return failed
    ? `- red-first: ${what} failed at ${base} (${sha}), ${date}`
    : `- red-first: ${what} PASSED at ${base} (${sha}), ${date}, so it proves nothing`
}

/**
 * What a vitest run says about the test. Status 1 is a failing test, and also
 * what vitest exits with when it found no test to run, which is not red.
 *
 * @param {{ status: number|null, error?: Error|null }} result `spawnSync`'s
 * @param {string} output vitest's stdout and stderr together
 * @returns {'failed'|'passed'|'could-not-run'}
 */
export function outcomeOf(result, output) {
  if (result.error || result.status === null) return 'could-not-run'
  if (result.status === 0) return 'passed'
  if (result.status !== 1) return 'could-not-run'
  if (/No test files? found|No test found/i.test(output)) return 'could-not-run'
  return 'failed'
}

/**
 * @param {'failed'|'passed'|'could-not-run'} outcome
 * @returns {0|1|2}
 */
export function exitCodeFor(outcome) {
  return outcome === 'failed' ? 0 : outcome === 'passed' ? 1 : 2
}

/**
 * The arguments to vitest, program name first.
 *
 * @param {string} file
 * @param {string|null} name
 */
export function vitestArgs(file, name) {
  return ['vitest', 'run', file, ...(name ? ['-t', name] : [])]
}

/**
 * Runs the test at the base and returns what happened. The worktree is always
 * removed, link first: removing a worktree that holds a link to node_modules
 * must never be allowed to follow it.
 *
 * @param {RedArgs & { file: string }} args
 * @param {string} base
 */
function runAtBase(args, base) {
  const source = path.resolve(process.cwd(), args.file)
  const relative = path.relative(ROOT, source)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`${args.file} is not inside this repository`)
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile())
    throw new Error(`no such test file: ${args.file}`)
  const file = relative.split(path.sep).join('/')

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'red-first-'))
  const tree = path.join(temp, 'base')
  const link = path.join(tree, 'node_modules')
  let added = false
  let linked = false
  try {
    git(['worktree', 'add', '--detach', tree, base], { cwd: ROOT })
    added = true
    const sha = git(['rev-parse', '--short', 'HEAD'], { cwd: tree }).trim()
    fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true })
    fs.copyFileSync(source, path.join(tree, file))
    // A junction needs no privilege on Windows; elsewhere it is a plain
    // directory symlink.
    fs.symlinkSync(path.join(ROOT, 'node_modules'), link, 'junction')
    linked = true
    const bin = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
    const run = spawnSync(
      process.execPath,
      [bin, ...vitestArgs(file, args.name).slice(1)],
      {
        cwd: tree,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    return { file, sha, output, outcome: outcomeOf(run, output) }
  } finally {
    if (linked) {
      try {
        fs.unlinkSync(link)
      } catch {
        fs.rmdirSync(link)
      }
    }
    if (added) {
      try {
        git(['worktree', 'remove', '--force', tree], { cwd: ROOT })
      } catch (error) {
        console.error(`red-first: could not remove ${tree}: ${error.message}`)
      }
    }
    fs.rmSync(temp, { recursive: true, force: true })
    try {
      git(['worktree', 'prune'], { cwd: ROOT })
    } catch {
      // nothing to prune is not worth a line
    }
  }
}

/** @param {string[]} argv */
function main(argv) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  if (args.error || !args.file) {
    console.error(`red-first: ${args.error}\n\n${USAGE}`)
    return 2
  }
  let base
  try {
    base = resolveBaseBranch(process.cwd())
  } catch (error) {
    if (!(error instanceof BaseBranchError)) throw error
    console.error(error.message)
    return 2
  }
  let result
  try {
    result = runAtBase({ ...args, file: args.file }, base)
  } catch (error) {
    if (!(error instanceof GitError) && !(error instanceof Error)) throw error
    console.error(`red-first: ${error.message}`)
    return 2
  }
  process.stderr.write(result.output)
  if (result.outcome === 'could-not-run') {
    console.error('red-first: vitest could not run that test at the base')
    return 2
  }
  console.log(
    recordLine({
      file: result.file,
      name: args.name,
      base,
      sha: result.sha,
      failed: result.outcome === 'failed',
      date: new Date().toISOString().slice(0, 10),
    }),
  )
  return exitCodeFor(result.outcome)
}

if (isMain(import.meta.filename)) process.exitCode = main(process.argv.slice(2))
