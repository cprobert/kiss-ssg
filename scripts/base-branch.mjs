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
import { execFileSync } from 'node:child_process'

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

// A base branch is often only present as a remote-tracking ref in a fresh clone,
// so callers get back something `git diff` can actually resolve.
const existingRef = (name, cwd) =>
  git(['rev-parse', '--verify', '--quiet', name], cwd)
    ? name
    : git(['rev-parse', '--verify', '--quiet', `origin/${name}`], cwd)
      ? `origin/${name}`
      : null

const toRef = (name, cwd) => existingRef(name, cwd) ?? `origin/${name}`

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
  const override = resolveOverride(
    process.env.KISS_BASE_BRANCH,
    git(['config', 'kiss.baseBranch'], cwd),
    (name) => existingRef(name, cwd),
  )
  if (override) {
    warn(override.notice)
    if (override.ref) return override.ref
  }

  const current = git(['branch', '--show-current'], cwd) ?? ''
  const names = new Set()
  for (const line of (
    git(['branch', '-a', '--format=%(refname:short)'], cwd) ?? ''
  ).split('\n')) {
    const name = line.trim().replace(/^origin\//, '')
    if (name && isIntegrationBranch(name)) names.add(name)
  }

  // main first so a tie (identical history) resolves to the default branch.
  const candidates = [...names].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  )
  const distanceTo = (name) => {
    const count = git(['rev-list', '--count', `${toRef(name, cwd)}..HEAD`], cwd)
    return count === null ? null : Number(count)
  }
  const base = pickBaseBranch(current, candidates, distanceTo)
  return base === null ? 'main' : toRef(base, cwd)
}

if (import.meta.filename === process.argv[1]) console.log(resolveBaseBranch())
