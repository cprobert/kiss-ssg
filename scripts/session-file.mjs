#!/usr/bin/env node
// Finds a branch's session file: the file in planning/sessions/ whose
// frontmatter `branch:` is exactly the branch's name. Every branch skill needs
// it, and six copies of one shell loop drifted apart in turn: a regex that
// read `fix/v2.8` as matching `fix/v2x8`, a `$` that missed a CRLF file, a
// path that did not survive a subfolder (2026-10-31). One script, one rule.
//
//   node scripts/session-file.mjs                  # the current branch, this checkout
//   node scripts/session-file.mjs <branch>         # a named branch, this checkout
//   node scripts/session-file.mjs <branch> --from-branch
//                                                  # read the files from the branch's
//                                                  # own commits, wherever this runs:
//                                                  # the local branch, or origin's copy
//                                                  # when there is no local one
//
// Prints each matching path, one per line, and nothing when none matches.
// More than one means the name was used before: the caller asks which.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SESSIONS = 'planning/sessions'

// The branch is read from the frontmatter and nowhere else: a log's body may
// quote another session's frontmatter, and a file with no frontmatter has no
// branch. Line endings are normalised, so a CRLF file reads the same.
export function branchOf(text) {
  const frontmatter = /^---\n([\s\S]*?)\n---(\n|$)/.exec(
    text.replace(/\r\n?/g, '\n'),
  )
  if (!frontmatter) return null
  const match = /^branch:[ \t]*(.*?)[ \t]*$/m.exec(frontmatter[1])
  return match ? match[1] : null
}

// The files whose branch is exactly `branch`, compared as text.
export const matchingFiles = (files, read, branch) =>
  files.filter((file) => branchOf(read(file)) === branch)

const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

// Whether git can resolve a ref, without throwing.
const resolves = (ref) => {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

// The branch's own commits: the local branch, or origin's copy when there is
// no local one (a branch opened on another machine, or already deleted here).
export function branchCommits(branch, exists = resolves) {
  if (exists(`refs/heads/${branch}`)) return `refs/heads/${branch}`
  if (exists(`refs/remotes/origin/${branch}`))
    return `refs/remotes/origin/${branch}`
  return null
}

// This repository's session files live at its root, so both ways of reading
// them start there, wherever in the repository this runs, print paths from
// the root, and read subfolders (an archive) the same way.
function sessionFiles(commits) {
  if (commits) {
    // `:(top)` anchors the folder at the root; --full-name prints paths from
    // it, which `git show <commits>:<path>` needs.
    const files = git([
      'ls-tree',
      '-r',
      '--full-name',
      '--name-only',
      commits,
      '--',
      `:(top)${SESSIONS}`,
    ])
      .split('\n')
      .filter((f) => f.endsWith('.md'))
    return { files, read: (f) => git(['show', `${commits}:${f}`]) }
  }
  const top = git(['rev-parse', '--show-toplevel']).trim()
  const dir = path.join(top, SESSIONS)
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true })
        .map((f) => String(f).split(path.sep).join('/'))
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => path.posix.join(SESSIONS, f))
    : []
  return { files, read: (f) => fs.readFileSync(path.join(top, f), 'utf8') }
}

const fail = (message) => {
  console.error(`session-file: ${message}`)
  process.exitCode = 1
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2)
  const fromBranch = args.includes('--from-branch')
  const named = args.find((a) => !a.startsWith('--'))
  const branch = named ?? git(['branch', '--show-current']).trim()
  if (!branch)
    fail('not on a branch (a detached HEAD), so there is no session to find')
  else if (fromBranch && !branchCommits(branch))
    fail(`there is no branch ${branch} here or on origin`)
  else {
    const { files, read } = sessionFiles(
      fromBranch ? branchCommits(branch) : null,
    )
    for (const file of matchingFiles(files, read, branch)) console.log(file)
  }
}
