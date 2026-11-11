#!/usr/bin/env node
// Reports every file the branch changed outside the paths its session log
// declares in `scope:` (comma-separated globs, one line), so "surgical
// changes" is checked by a command instead of trusted. Run it from the
// repository root:
//   node scripts/scope-check.mjs [--branch <name>]
// Exits 0 when nothing is outside the scope (or the log declares none, which
// it says), 1 when something is, 2 when it could not run. The changed files
// are gates.mjs's `changedFiles`, the session log is lib/sessions.js's
// reader: this script only matches the one against the other.
import path from 'node:path'
import { git } from '../lib/git.js'
import { SESSIONS, matching, readSessions } from '../lib/sessions.js'
import { resolveBaseBranch } from './base-branch.mjs'
import { changedFiles } from './gates.mjs'
import { isMain } from './is-main.mjs'

/**
 * The patterns of a `scope:` value, or null when there are none.
 *
 * @param {string|undefined} value
 * @returns {string[]|null}
 */
export function parseScope(value) {
  const patterns = (value ?? '')
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
  return patterns.length ? patterns : null
}

// A glob as a regular expression over `/`-separated repository paths: `**`
// crosses folders, `*` and `?` stay inside one, everything else is literal.
function globToRegExp(glob) {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      const folder = glob[i + 2] === '/'
      source += folder ? '(?:.*/)?' : '.*'
      i += folder ? 2 : 1
    } else if (c === '*') source += '[^/]*'
    else if (c === '?') source += '[^/]'
    else source += c.replace(/[\\^$.|+(){}[\]]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

/**
 * The changed files that match no pattern. The session file is always in
 * scope. With no patterns the scope is undeclared: nothing is reported.
 *
 * @param {string[]} files repository paths, `/`-separated
 * @param {string[]|null} patterns
 * @param {string} [sessionFile]
 * @returns {{ declared: boolean, files: string[] }}
 */
export function outOfScope(files, patterns, sessionFile) {
  if (!patterns) return { declared: false, files: [] }
  const matchers = patterns.map(globToRegExp)
  return {
    declared: true,
    files: files.filter(
      (file) =>
        file !== sessionFile && !matchers.some((matcher) => matcher.test(file)),
    ),
  }
}

/**
 * Every decision of the command, from the branch's session logs and changed
 * files to its exit code, so `main` only prints.
 *
 * @param {{ sessions: import('../lib/sessions.js').SessionEntry[], files: string[] }} input
 *   `sessions` are the logs naming the branch
 * @returns {{ out: string, err: string, code: number }}
 */
export function scopeCheck({ sessions, files }) {
  if (sessions.length === 0)
    return {
      out: '',
      err: 'scope-check: no session log names this branch',
      code: 2,
    }
  if (sessions.length > 1)
    return {
      out: '',
      err: `scope-check: more than one session log names this branch: ${sessions.map((s) => s.show).join(', ')}`,
      code: 2,
    }
  const [session] = sessions
  const result = outOfScope(
    files,
    parseScope(session.fields.scope),
    session.show,
  )
  if (!result.declared)
    return {
      out: '',
      err: `scope-check: ${session.show} has no scope: line, so nothing was checked`,
      code: 0,
    }
  return {
    out: result.files.join('\n'),
    err: '',
    code: result.files.length ? 1 : 0,
  }
}

function main(args) {
  const at = args.indexOf('--branch')
  const named = at === -1 ? null : args[at + 1]
  if (at !== -1 && !named) {
    console.error('scope-check: --branch needs a branch name')
    return 2
  }
  try {
    const cwd = process.cwd()
    const branch = named ?? git(['branch', '--show-current'], { cwd }).trim()
    if (!branch) {
      console.error(
        'scope-check: not on a branch (a detached HEAD): name it with --branch',
      )
      return 2
    }
    // ACMRD: a deletion outside the scope is a change this check most needs.
    const diff = changedFiles(resolveBaseBranch(cwd), cwd, process.env, 'ACMRD')
    if (diff.error) {
      console.error(`scope-check: ${diff.error}`)
      return 2
    }
    const sessions = matching(
      readSessions({ dir: path.join(cwd, SESSIONS), cwd }),
      branch,
    )
    const result = scopeCheck({ sessions, files: diff.files })
    if (result.out) console.log(result.out)
    if (result.err) console.error(result.err)
    return result.code
  } catch (error) {
    console.error(`scope-check: ${error.message}`)
    return 2
  }
}

if (isMain(import.meta.filename)) process.exitCode = main(process.argv.slice(2))
