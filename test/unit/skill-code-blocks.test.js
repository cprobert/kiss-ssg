// A skill holds knowledge and judgement; the engine and the `kiss-ssg` CLI
// hold mechanism (CLAUDE.md, Rules). So a shell block in a skill is a list
// of commands to run, each one a command and its arguments, and never a
// program: no pipe into a filter, no loop or condition, no `&&` chain, no
// inline `node -e`, no command substitution deciding something.
//
// The rule is an allow-list of the shapes that are safe, not a deny-list of
// the ones seen so far, because a deny-list loses to the next unlisted shape
// (CLAUDE.md, "fix the class"). It exists because 21 rounds of code review
// on one branch (2026-10-30/31) found most of their defects in shell
// written into skill prose, where no test ran it: six copies of one `awk`
// loop drifted apart in turn, until each was replaced by `kiss-ssg session`.
//
// What a block may hold, per line once `\` continuations are joined and
// heredoc bodies (a PR body piped to `gh`) are set aside:
//   - a command from COMMANDS with its arguments; `node` only with a file
//   - `timeout <n>` in front of one of those
//   - `NAME=$(<one of those>) || exit 1`, a value captured for the lines
//     after it, which stops the block when the command fails
// Quoted text is an argument, so a `|` inside a grep pattern is not a pipe.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Remarkable } from 'remarkable'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SHELLS = new Set(['bash', 'sh', 'shell', 'console'])
const COMMANDS = new Set([
  'npx',
  'npm',
  'git',
  'gh',
  'node',
  'ls',
  'cat',
  'mkdir',
  'cd',
  'grep',
  'curl',
])

// The shell's three quoting states, read the way the shell reads them: what
// is quoted becomes `Q`, so what is left is the line's structure. A `$(` or
// backtick inside double quotes still runs, so it is kept.
export function skeleton(line) {
  let out = ''
  let state = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (state === "'") {
      if (c === "'") state = null
    } else if (state === '"') {
      if (c === '\\') i++
      else if (c === '"') state = null
      else if (c === '`') out += c
      else if (c === '$' && line[i + 1] === '(') {
        out += '$('
        i++
      }
    } else if (c === '\\') {
      out += 'Q'
      i++
    } else if (c === "'" || c === '"') {
      state = c
      out += 'Q'
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break
    else out += c
  }
  return out.trim()
}

function simple(command) {
  if (/\$\(|`/.test(command)) return 'command substitution'
  if (/\|\||&&|;|\|/.test(command)) return 'a pipe or a chain'
  const words = command.split(/\s+/)
  if (words[0] === 'timeout' && /^\d+[smh]?$/.test(words[1] ?? ''))
    return simple(words.slice(2).join(' '))
  if (!COMMANDS.has(words[0])) return `${words[0]} is not on the allow-list`
  if (words[0] === 'node' && (words[1] ?? '-').startsWith('-'))
    return 'node runs a file, never inline code'
  return null
}

// Why a line is not a plain command, or null when it is one.
export function verdict(line) {
  const shape = skeleton(line)
  if (!shape) return null
  const capture = /^[A-Za-z_]\w*=\$\((.*)\)\s*\|\|\s*exit 1$/.exec(shape)
  return capture ? simple(capture[1].trim()) : simple(shape)
}

// The lines of a block, `\` continuations joined, heredoc bodies left out.
export function commandLines(code) {
  const lines = []
  let heredoc = null
  let pending = ''
  for (const raw of code.split('\n')) {
    if (heredoc) {
      if (raw.trim() === heredoc) heredoc = null
      continue
    }
    const line = pending + raw
    if (/\\\s*$/.test(line)) {
      pending = line.replace(/\\\s*$/, ' ')
      continue
    }
    pending = ''
    const end = /<<-?\s*['"]?(\w+)['"]?/.exec(line)
    if (end) heredoc = end[1]
    lines.push(line.replace(/<<-?\s*['"]?\w+['"]?/, ''))
  }
  return lines
}

function skillFiles() {
  const dirs = [
    ...fs
      .readdirSync(path.join(root, 'plugins'))
      .map((p) => path.join('plugins', p, 'skills')),
    '.claude/skills',
  ]
  return dirs
    .filter((d) => fs.existsSync(path.join(root, d)))
    .flatMap((d) =>
      fs
        .readdirSync(path.join(root, d), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(d, f).split(path.sep).join('/')),
    )
    .sort()
}

const markdown = new Remarkable({ html: true })

function offences(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  return markdown
    .parse(text, {})
    .filter((t) => t.type === 'fence' && SHELLS.has(t.params.split(/\s/)[0]))
    .flatMap((t) =>
      commandLines(t.content).flatMap((line) => {
        const why = verdict(line)
        return why ? [`${file}:${t.lines[0] + 1}: ${why}: ${line.trim()}`] : []
      }),
    )
}

describe('verdict', () => {
  it('lets a command and its arguments through, quoted text included', () => {
    for (const line of [
      'npx kiss-ssg session --from-branch',
      'git log --oneline "$BASE..HEAD"',
      'grep -rhoE "<a [^>]*href=[\\"\']https?://[^>]*>" public',
      "grep -E '(lib/a|lib/b)\\.js' notes.txt",
      'node scripts/base-branch.mjs --name',
      'BASE=$(node scripts/base-branch.mjs) || exit 1',
      'timeout 20 node examples/6-sitemap/router.js',
      'git branch -D <branch>        # only after step 2',
      '',
      '# a comment',
    ])
      expect([line, verdict(line)]).toEqual([line, null])
  })

  it('refuses a pipe, a chain, a loop, a condition or inline code', () => {
    const lines = [
      'git diff --name-only | grep lib',
      'git merge-base --is-ancestor a b && echo yes',
      'git fetch || echo offline',
      'for p in a b; do',
      '[ -n "$B" ] || echo detached',
      'if [ -f x ]; then npm ci',
      'node -e "console.log(1)"',
      'node -p "require(\'./package.json\').version"',
      'git commit -m "bump to $(node -p 1)"',
      "awk -F/ '{ print $NF }'",
      "sed -E 's/a/b/' file",
      'find planning/sessions -name x',
      'B=$(git branch --show-current); [ -n "$B" ]',
      'X=$(git a | sort) || exit 1',
    ]
    expect(lines.filter((line) => verdict(line) === null)).toEqual([])
  })

  it('sets heredoc bodies aside and joins continued lines', () => {
    expect(
      commandLines(
        "gh pr create --body-file - <<'EOF'\n| a | b |\nfor x\nEOF\ngit add a \\\n  b",
      ),
    ).toEqual(['gh pr create --body-file - ', 'git add a    b'])
  })
})

describe('every shell block in every skill is a list of commands', () => {
  const files = skillFiles()

  it('finds the skills', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('holds no program', () => {
    expect(files.flatMap(offences)).toEqual([])
  })
})
