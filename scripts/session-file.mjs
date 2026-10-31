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
// Prints each matching path, one per line, and nothing when none matches;
// with --from-branch, each as `<ref>:<path>`, for `git show` to read.
// More than one means the name was used before: the caller asks which.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SESSIONS = 'planning/sessions'

// The branch is read from the frontmatter and nowhere else: a log's body may
// quote another session's frontmatter, and a file with no frontmatter has no
// branch. What an editor or a YAML habit adds reads the same as the plain
// line: CRLF endings, a byte-order mark, spaces after a `---`, a quoted value,
// a ` # comment` (YAML needs the space, so a `#` inside a name is the name).
export function branchOf(text) {
  const frontmatter = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(
    text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'),
  )
  if (!frontmatter) return null
  const match = /^branch:(.*)$/m.exec(frontmatter[1])
  if (!match) return null
  const value = match[1].replace(/[ \t]#.*$/, '').trim()
  const quoted = /^(["'])(.*)\1$/.exec(value)
  return quoted ? quoted[2] : value
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

// Every blob in one git process, not one `git show` per session file: there
// are dozens of logs, and a git process costs tens of milliseconds on Windows.
// `cat-file --batch` answers each id with `<oid> blob <size>\n<bytes>\n`.
function readBlobs(oids) {
  if (oids.length === 0) return []
  const out = execFileSync('git', ['cat-file', '--batch'], {
    input: `${oids.join('\n')}\n`,
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  })
  const texts = []
  let at = 0
  for (let i = 0; i < oids.length; i++) {
    const end = out.indexOf(10, at)
    const size = Number(out.toString('utf8', at, end).split(' ')[2])
    texts.push(out.toString('utf8', end + 1, end + 1 + size))
    at = end + 1 + size + 1
  }
  return texts
}

// This repository's session files live at its root, so both ways of reading
// them start there, wherever in the repository this runs, print paths from
// the root, and read subfolders (an archive) the same way.
function sessionFiles(commits) {
  if (commits) {
    // `:(top)` anchors the folder at the root; --full-name prints paths from
    // it, which `git show <commits>:<path>` needs; -z leaves unusual names
    // unquoted.
    const entries = git([
      'ls-tree',
      '-r',
      '-z',
      '--full-name',
      commits,
      '--',
      `:(top)${SESSIONS}`,
    ])
      .split('\0')
      .map((line) => /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line))
      .filter((m) => m && m[2].endsWith('.md'))
      .map(([, oid, file]) => ({ oid, file }))
    const texts = readBlobs(entries.map((e) => e.oid))
    const byFile = new Map(entries.map((e, i) => [e.file, texts[i]]))
    return { files: [...byFile.keys()], read: (f) => byFile.get(f) }
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
  const commits = branch && fromBranch ? branchCommits(branch) : null
  if (!branch)
    fail('not on a branch (a detached HEAD), so there is no session to find')
  else if (fromBranch && !commits)
    fail(`there is no branch ${branch} here or on origin`)
  else {
    // From the branch, each match is printed as `<ref>:<path>`, which
    // `git show` reads as it stands: a later command needs no shell state to
    // know which ref the file came from (the local branch or origin's).
    const { files, read } = sessionFiles(commits)
    for (const file of matchingFiles(files, read, branch))
      console.log(commits ? `${commits}:${file}` : file)
  }
}
