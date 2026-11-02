// Reading an arm's stream-json transcript: what it loaded, what it did, what
// it cost and what it said at the end. Everything is counted from the
// transcript's own events, never from the agent's account of itself.
//
// With an answer key, it builds an evidence index: for each key item, the
// lines from the arm's tool calls, its diff and its final message that match
// the item's cues. A person marks each item from that index. Nothing here
// decides whether a finding was hit: that is a prose judgement, and the code
// that builds the index is not the one to make it.

/**
 * @typedef {{ line: number, id: string|null, name: string, input: Record<string, any> }} ToolCall
 * @typedef {{
 *   init: Record<string, any>|null, result: Record<string, any>|null,
 *   toolCalls: ToolCall[], texts: { line: number, text: string }[],
 *   events: number, parseErrors: number[],
 * }} Transcript
 */

/**
 * @param {string} text the transcript.jsonl contents
 * @returns {Transcript}
 */
export function parseTranscript(text) {
  /** @type {Transcript} */
  const out = {
    init: null,
    result: null,
    toolCalls: [],
    texts: [],
    events: 0,
    parseErrors: [],
  }
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = index + 1
    if (!raw.trim()) return
    let event
    try {
      event = JSON.parse(raw)
    } catch {
      out.parseErrors.push(line)
      return
    }
    out.events++
    if (event.type === 'system' && event.subtype === 'init') out.init = event
    if (event.type === 'result') out.result = event
    // A sub-agent's own tool calls carry parent_tool_use_id; they are the
    // arm's work too, and are counted with it.
    if (event.type === 'assistant')
      for (const part of event.message?.content ?? []) {
        if (part.type === 'tool_use')
          out.toolCalls.push({
            line,
            id: part.id ?? null,
            name: part.name,
            input: part.input ?? {},
          })
        if (part.type === 'text' && part.text)
          out.texts.push({ line, text: part.text })
      }
  })
  return out
}

// A skill's SKILL.md, by the folder it sits in: .../skills/<name>/SKILL.md.
const SKILL_MD = /(?:^|[\\/])skills[\\/]([^\\/]+)[\\/]SKILL\.md$/i
// Any other file inside a skill's folder (a reference, a protocol).
const SKILL_FILE = /(?:^|[\\/])skills[\\/]([^\\/]+)[\\/](.+)$/i

// A commit attempt, however it is spelled: `git commit`, `git -C . commit`,
// `git -c x=y commit`. Read from the command text, so a denied attempt counts.
const COMMIT = /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+commit\b/
const PUSH_OR_REMOTE =
  /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+(?:push|remote)\b/

/**
 * @param {string} p
 * @returns {{ skill: string, file: string|null }|null}
 */
export function skillOfPath(p) {
  const md = SKILL_MD.exec(p)
  if (md) return { skill: md[1], file: null }
  const other = SKILL_FILE.exec(p)
  if (other) return { skill: other[1], file: other[2].replace(/\\/g, '/') }
  return null
}

/**
 * @param {Transcript} t
 */
export function summariseTranscript(t) {
  /** @type {Record<string, number>} */
  const toolCounts = {}
  const skillCalls = []
  const skillReads = []
  const skillFileReads = []
  const commitAttempts = []
  const pushOrRemoteAttempts = []
  for (const call of t.toolCalls) {
    toolCounts[call.name] = (toolCounts[call.name] ?? 0) + 1
    if (call.name === 'Skill')
      skillCalls.push({
        line: call.line,
        skill: String(call.input.skill ?? call.input.command ?? ''),
      })
    if (call.name === 'Read') {
      const p = String(call.input.file_path ?? call.input.path ?? '')
      const hit = skillOfPath(p)
      if (hit && hit.file === null)
        skillReads.push({ line: call.line, skill: hit.skill, path: p })
      else if (hit)
        skillFileReads.push({
          line: call.line,
          skill: hit.skill,
          file: hit.file,
        })
    }
    if (call.name === 'Bash' || call.name === 'PowerShell') {
      const command = String(call.input.command ?? '')
      if (COMMIT.test(command))
        commitAttempts.push({ line: call.line, command })
      if (PUSH_OR_REMOTE.test(command))
        pushOrRemoteAttempts.push({ line: call.line, command })
    }
  }
  const init = t.init ?? {}
  const result = t.result ?? {}
  return {
    model: init.model ?? null,
    claudeCodeVersion: init.claude_code_version ?? null,
    permissionMode: init.permissionMode ?? null,
    plugins: (init.plugins ?? []).map((p) =>
      typeof p === 'string'
        ? p
        : `${p.name}${p.version ? `@${p.version}` : ''}`,
    ),
    mcpServers: (init.mcp_servers ?? []).map((s) =>
      typeof s === 'string' ? s : s.name,
    ),
    skillsVisible: init.skills ?? [],
    costUsd: result.total_cost_usd ?? null,
    durationMs: result.duration_ms ?? null,
    numTurns: result.num_turns ?? null,
    isError: result.is_error ?? null,
    terminalReason: result.terminal_reason ?? result.subtype ?? null,
    permissionDenials: (result.permission_denials ?? []).map((d) => ({
      tool: d.tool_name,
      input: d.tool_input,
    })),
    skillCalls,
    skillReads,
    skillFileReads,
    toolCounts,
    commitAttempts,
    pushOrRemoteAttempts,
    finalMessage: typeof result.result === 'string' ? result.result : null,
    events: t.events,
    parseErrors: t.parseErrors,
    complete: t.result !== null,
  }
}

/**
 * The text a tool call wrote or ran, line by line, for the evidence index:
 * what an Edit or Write put in a file, what Bash ran, which skill was called.
 *
 * @param {ToolCall} call
 * @returns {string[]}
 */
export function callText(call) {
  const i = call.input
  const parts = []
  if (i.file_path) parts.push(`${call.name} ${i.file_path}`)
  for (const key of [
    'new_string',
    'content',
    'command',
    'skill',
    'url',
    'prompt',
    'query',
  ])
    if (typeof i[key] === 'string') parts.push(i[key])
  if (Array.isArray(i.edits))
    for (const e of i.edits)
      if (typeof e?.new_string === 'string') parts.push(e.new_string)
  return parts.join('\n').split(/\r?\n/)
}

/**
 * @typedef {{ source: 'tool'|'diff'|'final', ref: string, text: string }} EvidenceLine
 */

/**
 * The lines an evidence index searches: every tool call's text, the diff
 * against the baseline (added lines only, with their file), and the final
 * message.
 *
 * @param {Transcript} t
 * @param {string} diff `git diff` output, plus new files as `+` lines
 * @param {string|null} finalMessage
 * @returns {EvidenceLine[]}
 */
export function evidenceLines(t, diff, finalMessage) {
  /** @type {EvidenceLine[]} */
  const lines = []
  for (const call of t.toolCalls)
    for (const text of callText(call))
      if (text.trim())
        lines.push({
          source: 'tool',
          ref: `transcript:${call.line} ${call.name}`,
          text,
        })
  let file = ''
  for (const text of diff.split(/\r?\n/)) {
    const header = /^\+\+\+ b\/(.+)$/.exec(text)
    if (header) {
      file = header[1]
      continue
    }
    if (text.startsWith('+') && !text.startsWith('+++') && text.slice(1).trim())
      lines.push({ source: 'diff', ref: file, text: text.slice(1) })
  }
  for (const text of (finalMessage ?? '').split(/\r?\n/))
    if (text.trim()) lines.push({ source: 'final', ref: 'final message', text })
  return lines
}

const MAX_CANDIDATES = 12
const MAX_LINE = 240

/**
 * For each answer-key item, the candidate lines a person reads to mark it.
 * An item is matched by its `cues` (case-insensitive regular expressions).
 * An a1k9 item not visible at the bench commit is marked not applicable and
 * gets no candidates. `mark` is always null: a person fills it.
 *
 * @param {Array<Record<string, any>>} key the answer key's entries
 * @param {EvidenceLine[]} lines
 * @param {{ bench?: 'a1k9'|'fixture'|null }} [options]
 */
export function buildEvidenceIndex(key, lines, { bench = null } = {}) {
  return key
    .filter((item) => !bench || item.bench === bench)
    .map((item) => {
      const notApplicable =
        item.bench === 'a1k9' && item.visibleAt385434a === false
      const cues = (item.cues ?? []).map((c) => new RegExp(c, 'i'))
      const seen = new Set()
      const candidates = []
      let total = 0
      if (!notApplicable)
        for (const l of lines) {
          if (!cues.some((re) => re.test(l.text))) continue
          const text = l.text.trim().slice(0, MAX_LINE)
          const id = `${l.source}|${l.ref}|${text}`
          if (seen.has(id)) continue
          seen.add(id)
          total++
          if (candidates.length < MAX_CANDIDATES)
            candidates.push({ ...l, text })
        }
      return {
        id: item.id,
        finding: item.finding,
        lane: item.lane,
        howScored: item.howScored,
        bench: item.bench,
        notApplicable,
        candidates,
        more: total - candidates.length,
        mark: null,
      }
    })
}
