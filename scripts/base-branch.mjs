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
const toRef = (name, cwd) =>
  git(['rev-parse', '--verify', '--quiet', name], cwd) ? name : `origin/${name}`

const rank = (name) => (name === 'main' ? 0 : name === 'master' ? 1 : 2)

export function resolveBaseBranch(cwd = process.cwd()) {
  const override =
    process.env.KISS_BASE_BRANCH || git(['config', 'kiss.baseBranch'], cwd)
  if (override) return override

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
