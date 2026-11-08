// `kiss-ssg issue`: a site drafts an issue for kiss-ssg, and later asks
// whether the kiss it has installed shipped the fix. It never posts: it
// writes the draft, prints the `gh issue create` command for the operator to
// run, and reads. Contract: planning/plans/2026-11-08-feedback-loop.md.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readReportsFile } from './check.js'
import { SESSIONS, readSessions } from './sessions.js'

const OWN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**
 * @typedef {Object} CommandResult
 * @property {string} out
 * @property {string} err
 * @property {number} code
 */

/**
 * The repository issues go to, from this package's own `bugs.url`, never
 * from the site's.
 *
 * @param {string} [root] the package folder
 * @returns {string} `owner/name`
 */
export function issueRepo(root = OWN_ROOT) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  )
  const url = String(pkg.bugs?.url ?? '')
  const match = /github\.com\/([^/]+\/[^/]+?)(?:\/issues)?\/?$/.exec(url)
  if (!match)
    throw new Error(`package.json bugs.url names no GitHub repository: ${url}`)
  return match[1]
}

// The form field labels, in order: the draft's `###` headings for each kind.
// `.github/ISSUE_TEMPLATE/bug.yml` and `feature.yml` are held to these.
export const BUG_HEADINGS = Object.freeze([
  'kiss-ssg version',
  'Node and OS',
  'Site',
  'What happened',
  'What was expected',
  'Reproduction',
  'Config excerpt',
  'The build',
])
export const FEATURE_HEADINGS = Object.freeze([
  'kiss-ssg version',
  'Site',
  'What you were trying to do',
  'What kiss does now',
  'What would help',
  'Workaround in use',
])

// The headings the command fills from what it can read; the rest are the
// agent's words, from --notes.
const FACTS = new Set(['kiss-ssg version', 'Node and OS', 'Site', 'The build'])

// Token shapes, by kind. Each is a value someone could use; a name for one
// (`process.env.API_TOKEN`) is not, so an honest config excerpt passes.
/** @type {[string, RegExp][]} */
const TOKEN_SHAPES = [
  ['a GitHub token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}/],
  ['a GitHub token', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['an npm token', /\bnpm_[A-Za-z0-9]{20,}/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['an API key (sk-)', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]
// A value after a word that names a secret: 20 or more characters, letters
// and digits both, no dot (an identifier path) and no space.
const ASSIGNED =
  /(?:^|[^A-Za-z])(?:token|secret|password|passwd|apikey|api_key|api-key|authorization)["']?\s*[:=]?\s*["'`]?(?:Bearer\s+|Basic\s+)?([A-Za-z0-9_\-+/]{20,}={0,2})(?![A-Za-z0-9_.\-+/])/gi

/**
 * Every token-shaped value in a text, by line and kind, never the value.
 *
 * @param {string} text
 * @returns {{ line: number, kind: string }[]}
 */
export function findTokens(text) {
  /** @type {{ line: number, kind: string }[]} */
  const hits = []
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      const shape = TOKEN_SHAPES.find(([, pattern]) => pattern.test(line))
      if (shape) return hits.push({ line: i + 1, kind: shape[0] })
      for (const [, value] of line.matchAll(ASSIGNED))
        if (/[A-Za-z]/.test(value) && /\d/.test(value))
          return hits.push({ line: i + 1, kind: 'a secret assigned to a name' })
    })
  return hits
}

/**
 * An issue reference: a URL into this repository's issues, `#78` or `78`.
 * `issues/7` is never `issues/78`: the number ends at a non-digit.
 *
 * @param {string} ref
 * @returns {number|null}
 */
export function issueNumber(ref) {
  const text = String(ref ?? '').trim()
  const url = /\/issues\/(\d+)(?!\d)/.exec(text)
  if (url) return Number(url[1])
  const bare = /^#?(\d+)$/.exec(text)
  return bare ? Number(bare[1]) : null
}

/**
 * The CHANGELOG's one form for a shipped issue, `Fixes [#n](…/issues/n)`.
 * A bare mention does not count. Shared with `test/unit/changelog.test.js`.
 *
 * @param {string} repo `owner/name`
 * @returns {RegExp} global; groups: the number in the text, the number in the URL
 */
export function fixesLink(repo) {
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    String.raw`Fixes \[#(\d+)\]\(https://github\.com/${escaped}/issues/(\d+)\)`,
    'g',
  )
}

/**
 * The version whose CHANGELOG entry carries `Fixes [#n](…)` for this issue,
 * or `null`.
 *
 * @param {string} changelog
 * @param {number} number
 * @param {string} repo
 * @returns {string|null}
 */
export function shippedIn(changelog, number, repo) {
  const entries = String(changelog).split(/^## /m).slice(1)
  for (const entry of entries) {
    const version = entry.split(/\s/, 1)[0]
    for (const [, text, url] of entry.matchAll(fixesLink(repo)))
      if (Number(text) === number && Number(url) === number) return version
  }
  return null
}

/**
 * The `filed: <URL or #n>` lines in a text: what a site's session log or
 * `AIKB/site.md` records for an issue it filed.
 *
 * @param {string} text
 * @returns {{ number: number, ref: string }[]}
 */
export function parseFiled(text) {
  /** @type {{ number: number, ref: string }[]} */
  const out = []
  for (const [, ref] of String(text).matchAll(/\bfiled:\s*(\S+)/gi)) {
    const number = issueNumber(ref.replace(/[.,;)]+$/, ''))
    if (number !== null) out.push({ number, ref: ref.replace(/[.,;)]+$/, '') })
  }
  return out
}

/**
 * What a draft says about the build, from the reports `kiss-ssg check`
 * printed or `KISS_REPORT` collected, or from the site's last record.
 *
 * @param {any[]} reports
 * @param {string} source how the reports were found
 * @returns {string}
 */
export function buildSummary(reports, source) {
  if (reports.length === 0) return `No report given (${source}).`
  const lines = [`From ${source}:`, '']
  for (const report of reports) {
    const failures = Array.isArray(report.failures) ? report.failures : []
    const pages = Array.isArray(report.pages) ? report.pages.length : 0
    lines.push(
      `- ${report.ok ? 'ok' : 'failed'}, ${report.mode ?? 'build'}: ${pages} page${pages === 1 ? '' : 's'}, ${failures.length} failure${failures.length === 1 ? '' : 's'}`,
    )
    for (const failure of failures.slice(0, 10))
      lines.push(`  - failed: ${failure.view ?? '(no view)'}`)
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const finding of report.audit?.findings ?? [])
      counts.set(finding.check, (counts.get(finding.check) ?? 0) + 1)
    if (counts.size > 0)
      lines.push(
        `  - audit: ${[...counts].map(([check, n]) => `${check} ${n}`).join(', ')}`,
      )
  }
  return lines.join('\n')
}

/**
 * The agent's notes, split by `###` heading; text before any heading belongs
 * to the kind's first free-text heading.
 *
 * @param {string} notes
 * @param {readonly string[]} headings
 * @returns {Map<string, string>}
 */
function notesByHeading(notes, headings) {
  /** @type {Map<string, string>} */
  const out = new Map()
  const first = headings.find((h) => !FACTS.has(h)) ?? headings[0]
  let current = first
  for (const line of String(notes ?? '').split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s*$/.exec(line)
    if (heading) {
      const known = headings.find(
        (h) => h.toLowerCase() === heading[1].toLowerCase(),
      )
      current = known ?? first
      if (known) continue
    }
    out.set(current, `${out.get(current) ?? ''}${line}\n`)
  }
  for (const [k, v] of out) out.set(k, v.trim())
  return out
}

/**
 * @typedef {Object} IssueFacts
 * @property {string} version the installed kiss-ssg's
 * @property {string} node
 * @property {string} os
 * @property {string} site the site's package name, or its folder's
 * @property {string|null} siteUrl
 * @property {string} build what `buildSummary` said
 */

/**
 * The draft's Markdown: each of the kind's headings, in the form's order,
 * filled from the facts and the notes.
 *
 * @param {{ kind: 'bug'|'feature', notes?: string, facts: IssueFacts, anonymous?: boolean }} input
 * @returns {string}
 */
export function draftIssue({ kind, notes = '', facts, anonymous = false }) {
  const headings = kind === 'bug' ? BUG_HEADINGS : FEATURE_HEADINGS
  const written = notesByHeading(notes, headings)
  /** @type {Record<string, string>} */
  const filled = {
    'kiss-ssg version': facts.version,
    'Node and OS': `Node ${facts.node}, ${facts.os}`,
    Site: anonymous
      ? '(not named)'
      : facts.siteUrl
        ? `${facts.site} (${facts.siteUrl})`
        : facts.site,
    'The build': facts.build,
  }
  return (
    headings
      .map((h) => {
        const body =
          (FACTS.has(h) ? filled[h] : written.get(h)) || '_No response_'
        return `### ${h}\n\n${body}\n`
      })
      .join('\n') + '\n<sub>Drafted with `kiss-ssg issue`.</sub>\n'
  )
}

/** @param {string} s */
const quotePosix = (s) => `'${s.replaceAll("'", "'\\''")}'`
/** @param {string} s */
const quotePowerShell = (s) => `'${s.replaceAll("'", "''")}'`

/**
 * The command the operator runs, prefixed `! ` for a Claude Code session so
 * `gh`'s output (the new issue's URL) lands in it. Never run here.
 *
 * @param {{ repo: string, title: string, file: string, platform?: string }} input
 * @returns {string}
 */
export function createCommand({
  repo,
  title,
  file,
  platform = process.platform,
}) {
  const q = platform === 'win32' ? quotePowerShell : quotePosix
  return `! gh issue create --repo ${repo} --title ${q(title)} --body-file ${q(file)}`
}

export const ISSUE_HELP = `kiss-ssg issue: draft an issue for kiss-ssg, and see whether a filed one shipped.

  npx kiss-ssg issue bug|feature --title "<one line>" [options]
      writes the draft to a file outside the site and prints the gh command that
      files it. It never posts: you run the command.
      --notes <file>   your words: What happened, What was expected, Reproduction,
                       Config excerpt (bug), or What you were trying to do, What
                       kiss does now, What would help, Workaround in use (feature),
                       as ### headings; text before any heading goes in the first
      --report <file>  the build to describe: kiss-ssg check's output or a
                       KISS_REPORT file (default: AIKB/last-build.json, the last
                       recorded passing build)
      --anonymous      leave the site's name and URL out
      --out <file>     where the draft goes (default: the OS temp folder)
      --no-search      skip the search for issues with the same title
  npx kiss-ssg issue --status <issue URL or number>
      whether the installed kiss-ssg's CHANGELOG ships a fix for it
  npx kiss-ssg issue --filed
      every "filed: <issue URL>" in planning/sessions/ and AIKB/site.md, each
      with --status's answer

A draft holding a token-shaped value is refused (exit 1), naming the line,
never the value. Exit 2 is a usage error.`

/**
 * @param {string[]} argv the arguments after `issue`
 * @returns {{ mode: 'draft'|'status'|'filed'|'help', kind?: 'bug'|'feature', title?: string, notes?: string|null, report?: string|null, anonymous?: boolean, out?: string|null, search?: boolean, ref?: string, error?: string }}
 */
export function parseIssueArgs(argv) {
  /** @type {any} */
  const parsed = {
    mode: 'draft',
    notes: null,
    report: null,
    anonymous: false,
    out: null,
    search: true,
  }
  const value = (/** @type {number} */ at, /** @type {string} */ flag) => {
    const v = argv[at + 1]
    if (v === undefined || v.startsWith('--'))
      throw new Error(`${flag} needs a value`)
    return v
  }
  try {
    for (let at = 0; at < argv.length; at++) {
      const arg = argv[at]
      if (arg === '--help' || arg === '-h') return { mode: 'help' }
      else if (arg === '--status') {
        parsed.mode = 'status'
        parsed.ref = value(at++, '--status')
      } else if (arg === '--filed') parsed.mode = 'filed'
      else if (arg === '--title') parsed.title = value(at++, '--title')
      else if (arg === '--notes') parsed.notes = value(at++, '--notes')
      else if (arg === '--report') parsed.report = value(at++, '--report')
      else if (arg === '--out') parsed.out = value(at++, '--out')
      else if (arg === '--anonymous') parsed.anonymous = true
      else if (arg === '--no-search') parsed.search = false
      else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`)
      else if (!parsed.kind && (arg === 'bug' || arg === 'feature'))
        parsed.kind = arg
      else throw new Error(`unexpected argument: ${arg}`)
    }
  } catch (error) {
    return { mode: 'help', error: /** @type {Error} */ (error).message }
  }
  if (parsed.mode === 'draft') {
    if (!parsed.kind) return { mode: 'help', error: 'say bug or feature' }
    if (!String(parsed.title ?? '').trim())
      return { mode: 'help', error: '--title is needed, one line' }
  }
  return parsed
}

/**
 * Runs `gh` with an argument list and no shell, or reports that it could not.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string }}
 */
export function runGh(args, cwd) {
  const result = spawnSync('gh', args, { cwd, encoding: 'utf8' })
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout ?? '',
  }
}

/**
 * @param {string} file
 * @returns {string|null}
 */
const readIf = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * `gh issue list --json`'s answer, or nothing when it is not JSON.
 *
 * @param {string} stdout
 * @returns {{ number: number, title: string, state: string, url: string }[]}
 */
function listedIssues(stdout) {
  try {
    const parsed = JSON.parse(stdout || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * The kiss-ssg the site resolves: its own install, or this package.
 *
 * @param {string} cwd
 * @returns {{ root: string, version: string }}
 */
function installedKiss(cwd) {
  const root = path.join(cwd, 'node_modules', 'kiss-ssg')
  const pkg = readIf(path.join(root, 'package.json'))
  if (pkg) return { root, version: JSON.parse(pkg).version ?? 'unknown' }
  const own = readIf(path.join(OWN_ROOT, 'package.json'))
  return { root: OWN_ROOT, version: own ? JSON.parse(own).version : 'unknown' }
}

/**
 * --status's answer for one issue, one line.
 *
 * @param {number} number
 * @param {{ cwd: string, repo: string, gh: typeof runGh }} context
 * @returns {string}
 */
function statusLine(number, { cwd, repo, gh }) {
  const kiss = installedKiss(cwd)
  const changelog = readIf(path.join(kiss.root, 'CHANGELOG.md')) ?? ''
  const version = shippedIn(changelog, number, repo)
  const shipped = version
    ? `shipped in ${version}`
    : `not in the installed kiss-ssg (${kiss.version})`
  const viewed = gh(
    [
      'issue',
      'view',
      String(number),
      '--repo',
      repo,
      '--json',
      'state',
      '--jq',
      '.state',
    ],
    cwd,
  )
  const state =
    viewed.ok && viewed.stdout.trim()
      ? `, ${viewed.stdout.trim().toLowerCase()} on GitHub`
      : ''
  return `#${number}: ${shipped}${state}`
}

/**
 * `kiss-ssg issue`: every decision of the command, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `issue`
 * @param {{ cwd?: string, gh?: typeof runGh, platform?: string, tmpdir?: string, repo?: string, write?: (file: string, text: string) => void }} [options]
 * @returns {CommandResult}
 */
export function runIssue(
  argv,
  {
    cwd = process.cwd(),
    gh = runGh,
    platform = process.platform,
    tmpdir = os.tmpdir(),
    repo = issueRepo(),
    write = (file, text) => fs.writeFileSync(file, text),
  } = {},
) {
  const parsed = parseIssueArgs(argv)
  if (parsed.mode === 'help')
    return parsed.error
      ? {
          out: '',
          err: `kiss-ssg issue: ${parsed.error}\n\n${ISSUE_HELP}`,
          code: 2,
        }
      : { out: ISSUE_HELP, err: '', code: 0 }

  if (parsed.mode === 'status') {
    const number = issueNumber(parsed.ref ?? '')
    if (number === null)
      return {
        out: '',
        err: `kiss-ssg issue: not an issue: ${parsed.ref}`,
        code: 2,
      }
    return { out: statusLine(number, { cwd, repo, gh }), err: '', code: 0 }
  }

  if (parsed.mode === 'filed') {
    /** @type {Map<number, string>} */
    const filed = new Map()
    const sessions = path.join(cwd, SESSIONS)
    for (const entry of readSessions({ dir: sessions, cwd }))
      for (const { number } of parseFiled(
        readIf(path.join(sessions, entry.file)) ?? '',
      ))
        if (!filed.has(number)) filed.set(number, entry.show)
    for (const { number } of parseFiled(
      readIf(path.join(cwd, 'AIKB', 'site.md')) ?? '',
    ))
      if (!filed.has(number)) filed.set(number, 'AIKB/site.md')
    if (filed.size === 0)
      return {
        out: 'No filed issues: no "filed: <issue URL>" line in the session logs or AIKB/site.md.',
        err: '',
        code: 0,
      }
    const lines = [...filed].map(
      ([number, from]) =>
        `${statusLine(number, { cwd, repo, gh })} (filed in ${from})`,
    )
    return { out: lines.join('\n'), err: '', code: 0 }
  }

  // A draft.
  const kind = /** @type {'bug'|'feature'} */ (parsed.kind)
  const title = String(parsed.title).trim()
  let notes = ''
  if (parsed.notes) {
    const text = readIf(path.resolve(cwd, parsed.notes))
    if (text === null)
      return {
        out: '',
        err: `kiss-ssg issue: cannot read --notes ${parsed.notes}`,
        code: 2,
      }
    notes = text
  }
  let reports = []
  let source = 'AIKB/last-build.json, the last recorded passing build'
  if (parsed.report) {
    const text = readIf(path.resolve(cwd, parsed.report))
    if (text === null)
      return {
        out: '',
        err: `kiss-ssg issue: cannot read --report ${parsed.report}`,
        code: 2,
      }
    reports = readReportsFile(text)
    source = parsed.report
  } else {
    const text = readIf(path.join(cwd, 'AIKB', 'last-build.json'))
    if (text) reports = readReportsFile(text)
  }
  const sitePkg = readIf(path.join(cwd, 'package.json'))
  const facts = {
    version: installedKiss(cwd).version,
    node: process.version,
    os: `${platform} ${os.release()}`,
    site: (sitePkg && JSON.parse(sitePkg).name) || path.basename(cwd),
    siteUrl:
      reports
        .map((r) => r?.thirdParty?.siteUrl)
        .find((u) => typeof u === 'string') ?? null,
    build: buildSummary(reports, source),
  }
  const body = draftIssue({ kind, notes, facts, anonymous: parsed.anonymous })

  const tokens = findTokens(`${title}\n${body}`)
  if (tokens.length > 0)
    return {
      out: '',
      err: [
        'kiss-ssg issue: refused, the draft holds a token-shaped value. Nothing was written.',
        ...tokens.map(
          (t) =>
            `  ${t.line === 1 ? 'the title' : `draft line ${t.line - 1}`}: ${t.kind}`,
        ),
        'Take it out of the notes or the title (a config excerpt can name process.env.X instead), then run this again.',
      ].join('\n'),
      code: 1,
    }

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'issue'
  const file = parsed.out
    ? path.resolve(cwd, parsed.out)
    : path.join(tmpdir, `kiss-issue-${slug}-${process.pid}.md`)
  write(file, body)

  const lines = [
    `Drafted a ${kind} report: ${file}`,
    'Read it before filing: it is posted as written.',
  ]
  if (parsed.search) {
    const found = gh(
      [
        'issue',
        'list',
        '--repo',
        repo,
        '--state',
        'all',
        '--search',
        `${title} in:title`,
        '--json',
        'number,title,state,url',
        '--limit',
        '5',
      ],
      cwd,
    )
    if (!found.ok)
      lines.push(
        '',
        'Could not search for duplicates (gh is missing or not signed in): check by hand before filing.',
      )
    else {
      const issues = listedIssues(found.stdout)
      issues.sort(
        (a, b) => (a.state === 'OPEN' ? 0 : 1) - (b.state === 'OPEN' ? 0 : 1),
      )
      lines.push(
        '',
        issues.length === 0
          ? 'No issue with a similar title.'
          : [
              'Issues with a similar title (comment on one instead if it is the same):',
              ...issues.map(
                (i) =>
                  `  #${i.number} ${i.state.toLowerCase()}: ${i.title} ${i.url}`,
              ),
            ].join('\n'),
      )
    }
  }
  lines.push(
    '',
    'To file it, run this in the session (gh prints the new issue URL; record it as "filed: <URL>"):',
    '',
    createCommand({ repo, title, file, platform }),
  )
  return { out: lines.join('\n'), err: '', code: 0 }
}
