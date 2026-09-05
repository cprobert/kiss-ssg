import { describe, it, expect } from 'vitest'
import {
  filesToCheck,
  formatFailureMessage,
} from '../../scripts/check-staged-format.mjs'

describe('filesToCheck', () => {
  const infos = {
    'lib/kiss.js': { ignored: false, inferredParser: 'babel' },
    'docs/index.html': { ignored: true, inferredParser: 'html' },
    'src/pages/index.hbs': { ignored: true, inferredParser: 'glimmer' },
    LICENSE: { ignored: false, inferredParser: null },
  }
  const infoOf = (f) => infos[f]

  it('keeps files prettier can parse and has not been told to skip', () => {
    expect(filesToCheck(Object.keys(infos), infoOf)).toEqual(['lib/kiss.js'])
  })

  it('drops a file with no info rather than throwing on it', () => {
    expect(filesToCheck(['deleted.js'], () => undefined)).toEqual([])
  })

  it('returns nothing for an empty stage', () => {
    expect(filesToCheck([], infoOf)).toEqual([])
  })
})

describe('formatFailureMessage', () => {
  it('names every failing file and quotes them into a runnable fix', () => {
    const msg = formatFailureMessage(['lib/kiss.js', 'test/a b.js'])
    expect(msg).toContain('  lib/kiss.js')
    expect(msg).toContain('npx prettier --write "lib/kiss.js" "test/a b.js"')
    expect(msg).toContain('re-stage')
  })
})
