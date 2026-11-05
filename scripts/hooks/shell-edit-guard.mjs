#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

// A Claude Code PreToolUse hook (`.claude/settings.json`): refuse a Bash or
// PowerShell command whose purpose is to put text into a file, and point at
// the Write and Edit tools instead. CLAUDE.md § Git workflow has said so since
// 2026-09-26 and was re-worded five times (`.claude/skills/memory-consolidate/
// retired.md`), and it still recurred in three of the six logs consolidated on
// 2026-11-05: `sed -i` under auto mode, twice, and an inert one at a close.
// The shell interprets backticks, `$(…)`, `!` and quotes before the text lands,
// silently, so the rule is held here rather than re-worded a sixth time.
//
// It decides from the command text alone, and only what is plainly a write of
// text: an in-place `sed`/`perl`, `echo`/`printf`/`cat`/a heredoc redirected
// into a file, `tee` into a file, and a `node -e` that calls a file-write
// function; in PowerShell, `Set-Content`, `Add-Content`, `Out-File` and a
// redirected here-string. A command's output captured into a file to read back
// (`npm test > "$TEMP/t.txt" 2>&1`) is not text being written, and a heredoc
// piped to `git commit -F -` or `gh … --body-file -` writes no file. Anything
// it cannot read is allowed: a guard that blocks by mistake costs more than
// the habit it is there to stop.

/**
 * Blank the body of every heredoc, so a commit message or PR body that says
 * `> /dev/null` or `echo x > y` is not read as a command.
 *
 * @param {string} command
 * @returns {string}
 */
function withoutHeredocBodies(command) {
  const lines = command.split(/\r?\n/)
  const kept = []
  for (let i = 0; i < lines.length; i++) {
    kept.push(lines[i])
    const marker = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(lines[i])
    if (!marker) continue
    const end = marker[2]
    while (i + 1 < lines.length && lines[i + 1].trim() !== end) i++
    i++ // the terminator itself
  }
  return kept.join('\n')
}

/**
 * Empty the inside of every quoted string, so `grep 'a > b'` is not a
 * redirect. The quotes stay, so a quoted redirect target is still a target.
 *
 * @param {string} text
 * @returns {string}
 */
function withoutQuotedText(text) {
  return text.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
}

// A redirect into a file: `>` or `>>`, optionally after a descriptor, to a
// target that is not `/dev/null`, `$null` or another descriptor (`2>&1`).
const FILE_REDIRECT = /(?:^|[^<>&\d])\d?>>?\s*(?!&|\/dev\/null\b|\$null\b)(\S+)/

const REASON =
  'kiss-ssg CLAUDE.md § Git workflow: text on its way into a file goes through the Write or Edit tool, never the shell (sed -i, a heredoc or echo into a file, tee, node -e writing a file, Set-Content). Write the file with the Write tool, or change it with Edit. Capturing a command\'s output to read back (cmd > "$TEMP/out.txt" 2>&1) is still fine.'

/**
 * Why a command must not run, or `null` when it may.
 *
 * @param {string} tool the hook input's `tool_name`
 * @param {string} command the hook input's `tool_input.command`
 * @returns {string|null}
 */
export function shellEditReason(tool, command) {
  if (typeof command !== 'string' || command.trim() === '') return null
  if (tool === 'Bash') return bashReason(command)
  if (tool === 'PowerShell') return powershellReason(command)
  return null
}

/** @param {string} command */
function bashReason(command) {
  const hadHeredoc = /<<-?\s*['"]?[A-Za-z_]/.test(command)
  const text = withoutQuotedText(withoutHeredocBodies(command))
  // `node -e` that writes a file: read before the quotes are emptied, because
  // the script is the quoted part.
  if (
    /\bnode\s+(?:-e|--eval|-p)\b/.test(command) &&
    /\b(?:writeFileSync|appendFileSync|writeFile|appendFile|outputFile|outputFileSync|createWriteStream)\s*\(/.test(
      command,
    )
  )
    return REASON
  for (const segment of text.split(/&&|\|\||;|\n|\|(?!\|)/)) {
    const words = segment.trim().split(/\s+/)
    const verb = words[0] ?? ''
    if (verb === 'sed' && words.some((w) => /^-[a-zA-Z]*i|^--in-place/.test(w)))
      return REASON
    if (verb === 'perl' && words.some((w) => /^-[a-zA-Z]*i/.test(w)))
      return REASON
    if (verb === 'tee') {
      const targets = words.slice(1).filter((w) => !w.startsWith('-'))
      if (targets.some((t) => t !== '/dev/null')) return REASON
    }
    const redirect = FILE_REDIRECT.exec(segment)
    if (!redirect) continue
    if (['echo', 'printf', 'cat'].includes(verb)) return REASON
    if (hadHeredoc && /<</.test(segment)) return REASON
  }
  return null
}

/** @param {string} command */
function powershellReason(command) {
  if (/\b(?:Set-Content|Add-Content|Out-File)\b/i.test(command)) return REASON
  // A here-string redirected into a file.
  if (
    /'@\s*>>?\s*(?!\$null)\S/.test(command) ||
    /"@\s*>>?\s*(?!\$null)\S/.test(command)
  )
    return REASON
  return null
}

/** Read the hook input from stdin, and deny the call when it must not run. */
async function main() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  let reason
  try {
    const event = JSON.parse(input)
    reason = shellEditReason(event.tool_name, event.tool_input?.command)
  } catch {
    // Unreadable input: allow, never block by accident.
    return
  }
  if (!reason) return
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main()
