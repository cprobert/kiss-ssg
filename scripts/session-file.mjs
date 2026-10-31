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
//                                                  # own commits, wherever this runs
//
// Prints each matching path, one per line, and nothing when none matches.
// More than one means the name was used before: the caller asks which.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SESSIONS = 'planning/sessions'

// The first `branch:` line is the frontmatter's; a log's body may quote
// another branch's. Line endings are normalised, so a CRLF file reads the same.
export function branchOf(text) {
  const match = /^branch:[ \t]*(.*?)[ \t]*$/m.exec(text.replace(/\r\n?/g, '\n'))
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

// This repository's session files live at its root, so both ways of reading
// them start there, wherever in the repository this runs, and print paths
// from the root.
function sessionFiles(branch, fromBranch) {
  if (fromBranch) {
    // `:(top)` anchors the folder at the root; --full-name prints paths from
    // it, which `git show <branch>:<path>` needs.
    const files = git([
      'ls-tree',
      '-r',
      '--full-name',
      '--name-only',
      branch,
      '--',
      `:(top)${SESSIONS}`,
    ])
      .split('\n')
      .filter((f) => f.endsWith('.md'))
    return { files, read: (f) => git(['show', `${branch}:${f}`]) }
  }
  const top = git(['rev-parse', '--show-toplevel']).trim()
  const dir = path.join(top, SESSIONS)
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.posix.join(SESSIONS, f))
    : []
  return { files, read: (f) => fs.readFileSync(path.join(top, f), 'utf8') }
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2)
  const fromBranch = args.includes('--from-branch')
  const branch =
    args.find((a) => !a.startsWith('--')) ??
    git(['branch', '--show-current']).trim()
  const { files, read } = sessionFiles(branch, fromBranch)
  for (const file of matchingFiles(files, read, branch)) console.log(file)
}
