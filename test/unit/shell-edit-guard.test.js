import { describe, it, expect } from 'vitest'
import { shellEditReason } from '../../scripts/hooks/shell-edit-guard.mjs'

// CLAUDE.md § Git workflow: text on its way into a file goes through the
// Write or Edit tool, never through the shell. The rule was re-worded five
// times and still recurred in three of six logs (2026-11-04, 2026-11-05), so
// /memory-consolidate replaced a sixth wording with this guard.
const bash = (command) => shellEditReason('Bash', command)
const ps = (command) => shellEditReason('PowerShell', command)

describe('blocks a shell command that writes text into a file', () => {
  it.each([
    ["sed -i 's/a/b/' lib/x.js"],
    ["sed -i.bak 's/x/x/' /dev/null"],
    ["cd /c/Code/kiss-ssg && sed --in-place 's/a/b/' f.md"],
    ["perl -pi -e 's/a/b/' f.md"],
    ["cat > notes.md <<'EOF'\n# Title\nbody\nEOF"],
    ['cat >> CHANGELOG.md <<EOF\nline\nEOF'],
    ['echo "status: closed" > planning/sessions/x.md'],
    ["printf '%s\\n' a b >> file.txt"],
    ["node -e \"require('fs').writeFileSync('a.json', '{}')\""],
    ["node -e \"fs.appendFileSync('x', 'y')\""],
    ['git show HEAD:a.js | tee b.js'],
  ])('%s', (command) => {
    expect(bash(command)).toMatch(/Write or Edit/)
  })

  it.each([
    ["Set-Content -Path a.md -Value 'x'"],
    ["'text' | Out-File -Encoding utf8 notes.md"],
    ["Add-Content log.txt 'line'"],
    ["@'\nbody\n'@ > file.md"],
  ])('PowerShell: %s', (command) => {
    expect(ps(command)).toMatch(/Write or Edit/)
  })
})

describe('allows what is not putting text in a file', () => {
  it.each([
    // A heredoc piped to git or gh, whose body may say anything, `>` included.
    [
      "git commit -q -F - <<'EOF'\nFix: a -> b, and > /dev/null in prose\n\necho x > y\nEOF",
    ],
    [
      "gh pr create --base main --title t --body-file - <<'EOF'\nbody > more\nEOF",
    ],
    // Capturing a command's output for reading back is not writing text.
    ['npm test > "$TEMP/t.txt" 2>&1; echo "exit $?"'],
    [
      'npm run gates > "$TEMP/gates.txt" 2>&1 && git add a && git commit -q -F - <<\'EOF\'\nmsg\nEOF',
    ],
    ['node script.mjs > out.json'],
    ['git fetch origin > /dev/null 2>&1'],
    ['cmd 2>/dev/null'],
    ["grep -E 'a > b' file.js"],
    ['echo "exit $?"'],
    ['cat file.md | head -5'],
    ["sed -n '1,5p' file.md"],
    ["node -e \"console.log(require('fs').readFileSync('a','utf8'))\""],
    ['git log --oneline | tee /dev/null'],
  ])('%s', (command) => {
    expect(bash(command)).toBeNull()
  })

  it.each([
    ['Get-Content a.md -TotalCount 5'],
    ['npm test 2>&1 | Select-Object -Last 3'],
    [
      'Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue',
    ],
  ])('PowerShell: %s', (command) => {
    expect(ps(command)).toBeNull()
  })

  it('ignores every other tool', () => {
    expect(shellEditReason('Write', "sed -i 's/a/b/' x")).toBeNull()
  })
})
