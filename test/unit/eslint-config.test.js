import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'

// The `pathname` ban exists because a file URL's `.pathname` is `/C:/...` on
// Windows, and only the Windows CI leg can see the failure it causes — a Linux
// run reports green gates over a broken test. So the rule is the guard, and
// this is the guard on the guard.
//
// It exists because the coverage was silently lost once: narrowing the
// selector to remove a false positive on `new URL('https://…').pathname` also
// dropped the explicit `new URL('file:///C:/x').pathname` form, and nothing
// failed, because a lint rule that stops matching is indistinguishable from a
// codebase with nothing to match. Asserting which forms are caught AND which
// are deliberately not is the only thing that can tell those apart.
const lintSource = async (code) => {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(code, {
    filePath: `${process.cwd()}/lib/__eslint-fixture__.js`,
  })
  return result.messages
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.line)
}

describe('the file-URL pathname ban', () => {
  it('catches a URL built on import.meta.url', async () => {
    expect(
      await lintSource(
        "const p = new URL('./x.css', import.meta.url).pathname",
      ),
    ).toEqual([1])
  })

  it('catches an explicit file: URL', async () => {
    expect(
      await lintSource("const p = new URL('file:///C:/assets/x.css').pathname"),
    ).toEqual([1])
  })

  it('leaves a real http URL alone, which is correct usage', async () => {
    // `lib/links.js` reads `.pathname` off an http URL on purpose. A blanket
    // ban would reject it, and a lint rule that cries wolf gets disabled.
    expect(
      await lintSource("const p = new URL('https://example.com/a/b').pathname"),
    ).toEqual([])
  })
})
