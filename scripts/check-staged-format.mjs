#!/usr/bin/env node
// Pre-commit format gate — runs the format gate over just this commit's files.
//
// Checks STAGED content (`git show :file`) rather than the working tree: on a
// Windows checkout the working tree is CRLF while staged blobs are
// LF-normalised, so staged content is the only false-positive-free view of what
// the gate will later see.
import { execFileSync } from 'node:child_process'
import prettier from 'prettier'

// Prettier has nothing to say about a file it cannot parse or has been told to
// skip — .hbs and build output, here. Split out so the decision is testable
// without touching git or the filesystem.
export function filesToCheck(staged, infoOf) {
  return staged.filter((file) => {
    const info = infoOf(file)
    return Boolean(info) && !info.ignored && Boolean(info.inferredParser)
  })
}

export function formatFailureMessage(failures) {
  return [
    '',
    'pre-commit: staged files are not prettier-formatted:',
    ...failures.map((f) => `  ${f}`),
    '',
    `Fix with:  npx prettier --write ${failures.map((f) => `"${f}"`).join(' ')}`,
    'then re-stage (git add) and commit again.',
  ].join('\n')
}

if (import.meta.filename === process.argv[1]) {
  const staged = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    {
      encoding: 'utf8',
    },
  )
    .split(/\r?\n/)
    .filter(Boolean)

  const infos = new Map()
  for (const file of staged) {
    infos.set(
      file,
      await prettier.getFileInfo(file, { ignorePath: '.prettierignore' }),
    )
  }

  const failures = []
  for (const file of filesToCheck(staged, (f) => infos.get(f))) {
    const content = execFileSync('git', ['show', `:${file}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    const config = (await prettier.resolveConfig(file)) ?? {}
    try {
      if (!(await prettier.check(content, { ...config, filepath: file })))
        failures.push(file)
    } catch (err) {
      console.error(`pre-commit: prettier failed on ${file}: ${err.message}`)
      failures.push(file)
    }
  }

  if (failures.length > 0) {
    console.error(formatFailureMessage(failures))
    process.exit(1)
  }
}
