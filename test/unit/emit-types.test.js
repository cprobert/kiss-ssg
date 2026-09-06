import { describe, it, expect } from 'vitest'
import { quoteStringExportNames } from '../../scripts/emit-types.mjs'

describe('quoteStringExportNames', () => {
  it("puts back the quotes tsc drops from `as 'module.exports'`", () => {
    expect(quoteStringExportNames('export { Kiss as module.exports };')).toBe(
      "export { Kiss as 'module.exports' };",
    )
  })

  it('handles the name beside an ordinary one in the same clause', () => {
    expect(
      quoteStringExportNames('export { Kiss as module.exports, utils };'),
    ).toBe("export { Kiss as 'module.exports', utils };")
  })

  it('leaves an already-quoted name alone, so the fixup is idempotent', () => {
    const fixed = "export { Kiss as 'module.exports' };"
    expect(quoteStringExportNames(fixed)).toBe(fixed)
  })

  it('leaves a plain rename alone', () => {
    const line = 'export { Kiss as Generator };'
    expect(quoteStringExportNames(line)).toBe(line)
  })

  // The dotted shape it looks for also appears in `import('./config.js').X`
  // type references, which are valid as they stand and must not be quoted.
  it('leaves an imported type reference alone', () => {
    const line = 'export type KissConfig = import("./config.js").KissConfig;'
    expect(quoteStringExportNames(line)).toBe(line)
  })
})
