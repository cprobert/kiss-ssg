// A site's session logs: `planning/sessions/<date>-<slug>.md`, one per piece
// of work, each naming its branch, base and worktree in its frontmatter.
// `kiss-ssg session` finds and lists them; the kiss-memory skills call it
// rather than carry their own copy of the rules (see AIKB/sessions.md).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { GitError, branchRefs, git, refExists } from './git.js'

/** The folder a site keeps its session logs in, relative to the site. */
export const SESSIONS = 'planning/sessions'

/**
 * A log's frontmatter as plain strings, or `null` when it has none. Only the
 * frontmatter counts: a log's body may quote another log's. What an editor or
 * a YAML habit adds reads the same as the plain line: CRLF endings, a
 * byte-order mark, spaces after a `---`, a quoted value, a ` # comment` (YAML
 * needs the space, so a `#` inside a value is part of it). The first line of
 * a key wins. A frontmatter that is never closed is none.
 *
 * @param {string} text
 * @returns {Record<string, string>|null}
 */
export function frontmatter(text) {
  const block = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(
    text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'),
  )
  if (!block) return null
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of block[1].split('\n')) {
    const field = /^([A-Za-z0-9_-]+):(.*)$/.exec(line)
    if (!field || field[1] in fields) continue
    const value = field[2].replace(/[ \t]#.*$/, '').trim()
    const quoted = /^(["'])(.*)\1$/.exec(value)
    fields[field[1]] = quoted ? quoted[2] : value
  }
  return fields
}

/**
 * @typedef {Object} SessionEntry
 * @property {string} file the path inside the sessions folder, `/`-separated
 * @property {string} show how to name it to the caller: a path from where
 *   they stand, or `<ref>:<path>` that `git show` reads, when read from a
 *   branch's commits
 * @property {Record<string, string>} fields its frontmatter (empty when none)
 */

/**
 * The entries whose `branch:` is exactly `branch`, compared as text, so a dot
 * or a slash in a name is only itself. An empty branch matches nothing.
 *
 * @param {SessionEntry[]} entries
 * @param {string} branch
 * @returns {SessionEntry[]}
 */
export function matching(entries, branch) {
  if (!branch) return []
  return entries.filter((entry) => entry.fields.branch === branch)
}

/**
 * Newest first, by the date each log's file name starts with: one sort over
 * every log, subfolders included. Modification times are no guide: a fresh
 * clone gives every file the same one.
 *
 * @param {SessionEntry[]} entries
 * @returns {SessionEntry[]}
 */
export function newestFirst(entries) {
  const name = (entry) => entry.file.split('/').pop() ?? ''
  return [...entries].sort(
    (a, b) => name(b).localeCompare(name(a)) || a.file.localeCompare(b.file),
  )
}

/**
 * One line per log, newest first, for `kiss-ssg session --list`: its path,
 * branch, status and when it was consolidated (`-` when it was not), tab
 * separated, under a header.
 *
 * @param {SessionEntry[]} entries
 * @returns {string}
 */
export function listLines(entries) {
  const rows = newestFirst(entries).map((entry) =>
    [
      entry.show,
      entry.fields.branch || '-',
      entry.fields.status || '-',
      entry.fields.consolidated || '-',
    ].join('\t'),
  )
  return ['path\tbranch\tstatus\tconsolidated', ...rows].join('\n')
}

/**
 * A branch's own commits: the local branch, or origin's copy when there is no
 * local one (a branch opened on another machine). The local branch first,
 * because it is the one the skills act on, and a log's frontmatter is written
 * once, at open, so a local copy behind origin's reads the same.
 *
 * @param {string} branch
 * @param {(full: string) => boolean} exists
 * @returns {string|null} a full ref
 */
export function branchCommits(branch, exists) {
  return branchRefs(branch, exists)[0]?.full ?? null
}

/** Every blob in one git process: `<oid> blob <size>\n<bytes>\n` per id. */
function readBlobs(oids, cwd) {
  if (oids.length === 0) return []
  /** @type {Buffer} */
  let out
  try {
    // Bytes, not text: the sizes git gives are byte counts.
    out = execFileSync('git', ['cat-file', '--batch'], {
      cwd,
      input: `${oids.join('\n')}\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    throw new GitError(String(error.stderr || error.message).trim())
  }
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

/**
 * Reads every log in `dir`, subfolders included, from this checkout, or, with
 * `ref`, from that ref's commits wherever this runs: a branch opened in a
 * worktree committed its log there, and this checkout may not have it yet.
 *
 * @param {{ dir: string, cwd?: string, ref?: string|null }} where `dir` is
 *   the sessions folder, absolute
 * @returns {SessionEntry[]}
 */
export function readSessions({ dir, cwd = process.cwd(), ref = null }) {
  if (ref) {
    // The folder's place in the repository, from git's own answer for cwd
    // plus dir's place under cwd: both halves are spelled one way each.
    // Comparing dir with --show-toplevel compared two spellings of one
    // folder (a symlink; Windows' C:/Users/RUNNER~1 to Node and
    // C:/Users/runneradmin to git), named a path outside the repository,
    // and found nothing (CI on windows-latest, PR #47).
    const prefix = git(['rev-parse', '--show-prefix'], { cwd }).trim()
    const below = path.relative(cwd, dir).split(path.sep).join('/')
    const inRepo = path.posix.normalize(`${prefix}${below}`).replace(/\/$/, '')
    // -z: unusual names unquoted; `:(top)` anchors the folder at the root.
    const listed = git(
      ['ls-tree', '-r', '-z', '--full-name', ref, '--', `:(top)${inRepo}`],
      { cwd },
    )
      .split('\0')
      .map((line) => /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line))
      .filter((m) => m && m[2].endsWith('.md'))
      .map(([, oid, file]) => ({ oid, file }))
    const texts = readBlobs(
      listed.map((e) => e.oid),
      cwd,
    )
    return listed.map((entry, i) => ({
      file: path.posix.relative(inRepo, entry.file),
      show: `${ref}:${entry.file}`,
      fields: frontmatter(texts[i]) ?? {},
    }))
  }
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      // A file that can be read: a folder may be named old.md, and a symlink
      // may point at nothing.
      try {
        return fs.statSync(path.join(dir, f)).isFile()
      } catch {
        return false
      }
    })
    .sort()
    .map((file) => ({
      file,
      show: path.relative(cwd, path.join(dir, file)).split(path.sep).join('/'),
      fields: frontmatter(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {},
    }))
}

/**
 * The commits to read a named branch's logs from, or a reason there are none.
 *
 * @param {string} branch
 * @param {string} cwd
 * @returns {string|null}
 */
export function commitsOf(branch, cwd) {
  return branchCommits(branch, (full) => refExists(full, cwd))
}

export const SESSION_HELP = `kiss-ssg session [<branch>] [options]

Finds a branch's session log: the file in planning/sessions/ (subfolders
included) whose frontmatter branch: is exactly the branch's name. Run it from
the site's folder. With no branch, the current one.

  (no option)      print each matching log's path, from where you stand, one
                   per line; nothing when there is none. More than one means
                   the name was used before: ask which is this work's.
  --from-branch    read the logs from the branch's own commits (the local
                   branch, or origin's copy when there is no local one), and
                   print each as <ref>:<path>, which git show reads
  --get <key>      print one frontmatter value (base, worktree, status…) of
                   the branch's log. Exits 1 when there is no log, or more
                   than one; prints nothing when the log has no such key.
  --list           every log, newest first by the date its name starts with:
                   path, branch, status, consolidated (- when not)
  --help           this text

Exits 1 on a detached HEAD with no branch named, a branch that is nowhere
(--from-branch), or a git that refuses, and says why in one line.`

/**
 * @typedef {Object} CommandResult
 * @property {string} out what goes to stdout ('' for nothing)
 * @property {string} err what goes to stderr ('' for nothing)
 * @property {number} code the exit code
 */

/**
 * `kiss-ssg session`: every decision of the command, from its arguments to
 * its exit code, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `session`
 * @param {{ cwd?: string }} [options]
 * @returns {CommandResult}
 */
export function runSession(argv, { cwd = process.cwd() } = {}) {
  const fail = (message) => ({
    out: '',
    err: `kiss-ssg session: ${message}`,
    code: 1,
  })
  let fromBranch = false
  let list = false
  /** @type {string|null} */
  let key = null
  /** @type {string|null} */
  let named = null
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--help' || arg === '-h')
      return { out: SESSION_HELP, err: '', code: 0 }
    if (arg === '--from-branch') fromBranch = true
    else if (arg === '--list') list = true
    else if (arg === '--get') {
      key = argv[++at] ?? null
      if (!key || key.startsWith('-'))
        return fail('--get needs a key: kiss-ssg session --get base')
    } else if (arg.startsWith('-')) return fail(`unknown option: ${arg}`)
    else if (named === null) named = arg
    else return fail(`one branch at a time: ${named} and ${arg}`)
  }
  if (list && key) return fail('--list and --get do not go together')
  try {
    const branch = named ?? git(['branch', '--show-current'], { cwd }).trim()
    if (!branch && (fromBranch || !list))
      return fail('not on a branch (a detached HEAD): name the branch')
    let ref = null
    if (fromBranch) {
      ref = commitsOf(branch, cwd)
      if (!ref) return fail(`there is no branch ${branch} here or on origin`)
    }
    const dir = path.join(cwd, SESSIONS)
    const entries = readSessions({ dir, cwd, ref })
    // No folder at all is said, not left as an empty answer: from anywhere
    // but the site's folder, "no log" would be a wrong answer, read as right.
    const where =
      !ref && !fs.existsSync(dir)
        ? `kiss-ssg session: no ${SESSIONS}/ in ${cwd}: the site has no session logs yet, or this is not the site's folder`
        : ''
    if (list) return { out: listLines(entries), err: where, code: 0 }
    const found = matching(entries, branch)
    if (key === null)
      return {
        out: found.map((entry) => entry.show).join('\n'),
        err: where,
        code: 0,
      }
    if (found.length === 0) return fail(`no session log names branch ${branch}`)
    if (found.length > 1)
      return fail(
        `more than one session log names branch ${branch}: ${found.map((entry) => entry.show).join(', ')}`,
      )
    return { out: found[0].fields[key] ?? '', err: '', code: 0 }
  } catch (error) {
    if (error instanceof GitError)
      return fail(`git could not answer: ${error.message}`)
    throw error
  }
}
