#!/usr/bin/env node
// Resolves the integration branch a feature branch was cut from.
//
// Every branch skill needs a base to diff against, and hard-coding `main` is
// wrong while a major line of development lives on its own long-lived branch
// (v2 today). So: prefer an explicit override, otherwise pick whichever
// integration branch shares the most recent history with HEAD.
//
// Run as a CLI it prints a git-resolvable ref (`main`, `origin/v2`), so a skill
// can do:
//   BASE=$(node scripts/base-branch.mjs)
// and, where it needs the branch's own name rather than a ref (to check it
// out, pull it, or name `origin/<name>`):
//   BASE_NAME=$(node scripts/base-branch.mjs --name)
import { execFileSync } from 'node:child_process'
import { isMain } from './is-main.mjs'

// A base is a long-lived integration branch: main/master, or a major line (v2).
// Deliberately not "any branch" — a sibling feature branch can share HEAD's tip
// and would win the distance comparison below without being a base at all.
export const isIntegrationBranch = (name) => /^(main|master|v\d+)$/.test(name)

// Fewest commits from HEAD back to the merge base wins — that is the branch
// HEAD diverged from most recently. Ties break toward the earlier candidate,
// so pass candidates in preference order. `distanceTo` returns null when the
// branch has no common history (or git failed), which excludes it.
export function pickBaseBranch(current, candidates, distanceTo) {
  // An integration branch is its own base — everything on it is the work to
  // check. Without this, `main` picks the nearest *other* line (v1, 39 commits
  // back) and the format gate diffs a whole major rewrite against it.
  if (isIntegrationBranch(current)) return current
  let best = null
  let bestDistance = Infinity
  for (const name of candidates) {
    if (name === current) continue
    const distance = distanceTo(name)
    if (distance === null || distance === undefined) continue
    if (distance < bestDistance) {
      best = name
      bestDistance = distance
    }
  }
  return best
}

const git = (args, cwd) => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// One resolution asks git the same questions more than once (each candidate's
// refs and distance, then the winner's again), and on Windows a git process
// costs tens of milliseconds. Answers are kept for the length of one call.
const remembered = (run) => {
  const answers = new Map()
  return (args, cwd) => {
    const key = `${cwd}\0${args.join('\0')}`
    if (!answers.has(key)) answers.set(key, run(args, cwd))
    return answers.get(key)
  }
}

// The base branch as a ref git can diff against. A base is often only on
// origin in a fresh clone, and when the local branch and its origin both
// exist, the ref is the one this branch started from: the one with the fewest
// commits between it and HEAD. `git fetch` never moves a local branch, so a
// local base is often behind its origin, and a branch cut from origin/<name>
// diffed against a stale local <name> would carry everyone else's newer
// commits in its diff; a branch cut from a local base with unpushed commits
// keeps that base. A tie keeps the local branch.
//
// Both are looked up by full ref name. A short name resolves a tag before a
// branch, and this repository has tags `v1` and `v2` named like its
// integration branches, so the ref is printed in full when a tag shares its
// short name, and every later git command then reads the branch.
// The refs a branch name has here, by full name, the local branch first: the
// lookup every script shares (session-file.mjs too). Which of them a caller
// reads is its own rule.
export function branchRefs(name, exists) {
  return [
    { full: `refs/heads/${name}`, short: name },
    { full: `refs/remotes/origin/${name}`, short: `origin/${name}` },
  ].filter((ref) => exists(ref.full))
}

function branchRef(name, cwd, run = git) {
  const found = branchRefs(name, (full) => refExists(full, cwd, run))
  if (found.length === 0) return null
  const behind = (ref) =>
    Number(run(['rev-list', '--count', `${ref.full}..HEAD`], cwd) ?? Infinity)
  return found.length === 2 && behind(found[1]) < behind(found[0])
    ? found[1]
    : found[0]
}

// Whether a ref exists, by its exact name. Not `rev-parse`, which resolves a
// revision: `refs/tags/v2~1` would read as the tag v2, and an override
// rooted at a tag (`v2~1`) as a stale one (round 16).
const refExists = (full, cwd, run) =>
  Boolean(run(['show-ref', '--verify', full], cwd))

const isTag = (name, cwd, run) => refExists(`refs/tags/${name}`, cwd, run)

// How the chosen branch is printed: short, unless a tag shares that spelling.
// Asked of the winner only, not of every candidate the algorithm weighs.
const printed = (ref, cwd, run) =>
  isTag(ref.short, cwd, run) ? ref.full : ref.short

// An override names a branch, or any other ref git can resolve (`HEAD`, a
// commit, `refs/tags/v2`): a branch goes through the same lookup as the
// algorithm's choice, and anything else is taken as written. Except a bare
// name that is only a tag: this repository's tags `v1` and `v2` share the
// integration branches' names, so a left-over `v2` once that branch is
// deleted is a stale override, not a request to diff against a release.
// The tag itself is spelled out in full.
function overrideRef(name, cwd, run = git) {
  const branch = branchRef(name, cwd, run)
  if (branch) return printed(branch, cwd, run)
  if (!name.startsWith('refs/') && isTag(name, cwd, run)) return null
  return run(['rev-parse', '--verify', '--quiet', name], cwd) ? name : null
}

// What a caller reports as one line, rather than as a crash: the repository
// has no ref to diff against yet.
export class BaseBranchError extends Error {}

// An override that silently loses is worse than no override: a stale one (a
// deleted `v2`) feeds an unresolvable ref to every gate. So say where it came
// from, and only honour it if it names something git can resolve.
export function resolveOverride(env, config, resolveRef) {
  const override = env || config
  if (!override) return null
  const source = env ? 'KISS_BASE_BRANCH' : 'git config kiss.baseBranch'
  const ref = resolveRef(override)
  return ref
    ? { ref, notice: `${ref} (override: ${source})` }
    : {
        ref: null,
        notice: `base-branch: ${source}=${override} resolves to no ref — falling back to the algorithm`,
      }
}

const rank = (name) => (name === 'main' ? 0 : name === 'master' ? 1 : 2)

// `warn` is where provenance goes: stdout stays the bare ref, because callers
// (gates.mjs, the branch skills) substitute it straight into a git command.
export function resolveBaseBranch(cwd = process.cwd(), warn = console.error) {
  const run = remembered(git)
  const override = resolveOverride(
    process.env.KISS_BASE_BRANCH,
    run(['config', 'kiss.baseBranch'], cwd),
    (name) => overrideRef(name, cwd, run),
  )
  if (override) {
    warn(override.notice)
    if (override.ref) return override.ref
  }

  const current = run(['branch', '--show-current'], cwd) ?? ''
  // Full ref names: a short name is spelled `heads/v2` when a tag is called
  // `v2`, and would no longer read as an integration branch. Only local
  // branches and origin's count, as everywhere else in the branch skills.
  const names = new Set()
  for (const line of (
    run(['branch', '-a', '--format=%(refname)'], cwd) ?? ''
  ).split('\n')) {
    const name = line.trim().replace(/^refs\/(heads|remotes\/origin)\//, '')
    if (name && !name.startsWith('refs/') && isIntegrationBranch(name))
      names.add(name)
  }

  // main first so a tie (identical history) resolves to the default branch.
  const candidates = [...names].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  )
  const distanceTo = (name) => {
    const ref = branchRef(name, cwd, run)
    if (!ref) return null
    const count = run(['rev-list', '--count', `${ref.full}..HEAD`], cwd)
    return count === null ? null : Number(count)
  }
  const base = pickBaseBranch(current, candidates, distanceTo)
  // No integration branch shares history with HEAD. `main` used to be printed
  // anyway, a ref that may not exist, and a caller that read git's empty
  // answer for it (docs-sweep) reported nothing to do (round 13).
  if (base === null)
    throw new BaseBranchError(
      'base-branch: no integration branch (main, master or vN) here or on origin; name the base with KISS_BASE_BRANCH or git config kiss.baseBranch',
    )
  // `pickBaseBranch` returns a candidate `distanceTo` found a ref for, or the
  // current branch, which has none before its first commit.
  const winner = branchRef(base, cwd, run)
  if (!winner)
    throw new BaseBranchError(
      `base-branch: ${base} has no commit here or on origin yet, so there is nothing to diff against`,
    )
  return printed(winner, cwd, run)
}

// The ref is `origin/<name>` when the base has no local branch. A diff wants
// the ref; `git checkout`, `git pull` and `origin/<name>` want the branch's
// own name, which `--name` prints. The name comes from what the ref is, not
// how it is spelled: a local branch is its own name, and a branch on origin is
// the name after `origin/`. Anything else has no name the branch skills can
// use: a tag or a commit is no branch, and every skill pairs the name with
// `origin/`, so a branch on another remote would be compared with origin's.
// A name is not a revision: a tag may share it. So the skills give it to
// commands that take a branch (`git switch`, `gh pr create --base`), and
// write `refs/heads/<name>` or `refs/remotes/origin/<name>` wherever git
// wants a revision.
export function branchName(ref, refExists) {
  const short = ref.replace(/^refs\/(heads|remotes)\//, '')
  if (
    ref.startsWith('refs/heads/') ||
    (!ref.startsWith('refs/') && refExists(`refs/heads/${short}`))
  )
    return short
  if (short.startsWith('origin/') && refExists(`refs/remotes/${short}`))
    return short.slice('origin/'.length)
  return null
}

// Prints the ref (or, with --name, the branch's name) and returns the exit
// code. Anything it cannot answer is one line on stderr, never a stack trace.
function main(args) {
  let ref
  try {
    ref = resolveBaseBranch()
  } catch (error) {
    if (!(error instanceof BaseBranchError)) throw error
    console.error(error.message)
    return 1
  }
  if (!args.includes('--name')) {
    console.log(ref)
    return 0
  }
  const name = branchName(ref, (full) =>
    Boolean(git(['rev-parse', '--verify', '--quiet', full], process.cwd())),
  )
  if (name) {
    console.log(name)
    return 0
  }
  console.error(
    `base-branch: ${ref} is not a branch here or on origin, so it has no name the branch skills can use`,
  )
  return 1
}

if (isMain(import.meta.filename)) process.exitCode = main(process.argv.slice(2))
