// The branch a site's work merges into, and the ref to diff against or start
// new work from. `kiss-ssg base` runs it; the kiss-memory skills call that
// rather than ask git themselves (see AIKB/base.md).
import path from 'node:path'
import { GitError, branchRefs, refExists, tryGit } from './git.js'
import { SESSIONS, commitsOf, matching, readSessions } from './sessions.js'

/**
 * The branch `git ls-remote --symref origin HEAD` names, or `null`.
 *
 * @param {string|null} text
 * @returns {string|null}
 */
export function parseLsRemote(text) {
  const line = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(text ?? '')
  return line ? line[1] : null
}

/**
 * Of a base's local branch and origin's, the one this work started from: the
 * fewest commits between it and HEAD. `git fetch` never moves a local branch,
 * so a local base is often behind origin's, and diffing against it would
 * carry everyone else's newer commits; a local base with unpushed commits is
 * kept. A tie keeps the local branch.
 *
 * @param {{ full: string }[]} found from `branchRefs`, local first
 * @param {(full: string) => number} behind commits from the ref to HEAD
 * @returns {string|null} a full ref
 */
export function chooseDiffRef(found, behind) {
  if (found.length === 0) return null
  if (found.length === 1) return found[0].full
  return behind(found[1].full) < behind(found[0].full)
    ? found[1].full
    : found[0].full
}

/**
 * Where new work starts: origin's base, unless only the local one exists, or
 * the local one has commits origin lacks (unpushed work to keep). Diverged,
 * the two disagree, and that is the person's call.
 *
 * @param {{ local: boolean, origin: boolean, localOnly: number, originOnly: number }} facts
 *   `localOnly`/`originOnly`: commits on one and not the other
 * @returns {{ ref: string|null, reason: string }}
 */
export function chooseStart({ local, origin, localOnly, originOnly }, name) {
  const localRef = `refs/heads/${name}`
  const originRef = `refs/remotes/origin/${name}`
  if (!local && !origin)
    return { ref: null, reason: `there is no branch ${name} here or on origin` }
  if (!local) return { ref: originRef, reason: 'there is no local branch' }
  if (!origin) return { ref: localRef, reason: 'origin has no such branch' }
  if (localOnly > 0 && originOnly > 0)
    return {
      ref: null,
      reason: `${localRef} and ${originRef} have diverged (${localOnly} and ${originOnly} commits of their own): ask which to start from`,
    }
  if (localOnly > 0)
    return { ref: localRef, reason: 'the local base has unpushed commits' }
  return { ref: originRef, reason: "origin's is the same or newer" }
}

export const BASE_HELP = `kiss-ssg base [<branch>] [options]

The branch a piece of work merges into. Run it from the site's folder. It is
the base: line of the branch's session log (the current branch, or the one
named), and otherwise the remote's default branch. Prints the name on stdout,
and where it came from on stderr.

  --from-branch    read the session log from the branch's own commits
  --ref            print the ref to diff against instead: of the local base
                   and origin's, the one this branch started from
  --start          print the ref to start new work from instead: origin's,
                   unless the local base has commits origin lacks; exits 1
                   when the two have diverged
  --help           this text

Every ref is printed in full (refs/heads/…, refs/remotes/origin/…), so a tag
of the same name is never read in its place. Exits 1, saying why in one line,
when there is no base to name.`

/**
 * `kiss-ssg base`: every decision of the command, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `base`
 * @param {{ cwd?: string }} [options]
 * @returns {import('./sessions.js').CommandResult}
 */
export function runBase(argv, { cwd = process.cwd() } = {}) {
  const fail = (message) => ({
    out: '',
    err: `kiss-ssg base: ${message}`,
    code: 1,
  })
  let fromBranch = false
  /** @type {'name'|'ref'|'start'} */
  let want = 'name'
  /** @type {string|null} */
  let named = null
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h')
      return { out: BASE_HELP, err: '', code: 0 }
    if (arg === '--from-branch') fromBranch = true
    else if (arg === '--ref' || arg === '--start') {
      if (want !== 'name') return fail('--ref and --start do not go together')
      want = arg === '--ref' ? 'ref' : 'start'
    } else if (arg.startsWith('-')) return fail(`unknown option: ${arg}`)
    else if (named === null) named = arg
    else return fail(`one branch at a time: ${named} and ${arg}`)
  }
  try {
    const branch = named ?? tryGit(['branch', '--show-current'], cwd) ?? ''
    let name = null
    let source = ''
    if (branch) {
      let ref = null
      if (fromBranch) {
        ref = commitsOf(branch, cwd)
        if (!ref) return fail(`there is no branch ${branch} here or on origin`)
      }
      const found = matching(
        readSessions({ dir: path.join(cwd, SESSIONS), cwd, ref }),
        branch,
      )
      if (found.length > 1)
        return fail(
          `more than one session log names branch ${branch}: ${found.map((e) => e.show).join(', ')}`,
        )
      if (found[0]?.fields.base) {
        name = found[0].fields.base
        source = `the base: line of ${found[0].show}`
      }
    } else if (fromBranch)
      return fail('not on a branch (a detached HEAD): name the branch')
    if (!name) {
      const recorded = tryGit(
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        cwd,
      )
      if (recorded) {
        name = recorded.replace(/^origin\//, '')
        source = "origin's default branch, as this clone recorded it"
      } else {
        name = parseLsRemote(
          tryGit(['ls-remote', '--symref', 'origin', 'HEAD'], cwd),
        )
        if (name) source = "origin's default branch, asked of origin"
      }
    }
    if (!name)
      return fail(
        'no base: no session log names one, and origin has no default branch (no remote, or offline). Ask which branch the work merges into.',
      )
    const said = `kiss-ssg base: ${name}, from ${source}`
    if (want === 'name') return { out: name, err: said, code: 0 }
    const exists = (full) => refExists(full, cwd)
    if (want === 'ref') {
      const ref = chooseDiffRef(branchRefs(name, exists), (full) =>
        Number(
          tryGit(['rev-list', '--count', `${full}..HEAD`], cwd) ?? Infinity,
        ),
      )
      if (!ref) return fail(`there is no branch ${name} here or on origin`)
      return { out: ref, err: said, code: 0 }
    }
    const local = exists(`refs/heads/${name}`)
    const origin = exists(`refs/remotes/origin/${name}`)
    const [localOnly, originOnly] =
      local && origin
        ? (
            tryGit(
              [
                'rev-list',
                '--left-right',
                '--count',
                `refs/heads/${name}...refs/remotes/origin/${name}`,
              ],
              cwd,
            ) ?? '0 0'
          )
            .split(/\s+/)
            .map(Number)
        : [0, 0]
    const start = chooseStart({ local, origin, localOnly, originOnly }, name)
    if (!start.ref) return fail(start.reason)
    return {
      out: start.ref,
      err: `${said}; starting from ${start.ref}: ${start.reason}`,
      code: 0,
    }
  } catch (error) {
    if (error instanceof GitError)
      return fail(`git could not answer: ${error.message}`)
    throw error
  }
}
