import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('asset copy queue', () => {
  it("runs queued copies sequentially so a later copy into an earlier copy's source tree cannot race it", async () => {
    site = await makeSite({
      'src/assets/sub/a.txt': 'old',
      'extra/a.txt': 'new',
    })
    // Enough files under the first copy's source to make the race likely if
    // the two copies overlap (real-world case: student-handbooks copying
    // ./src/assets-cohort into a subdirectory of its own assets folder while
    // the constructor's assets -> build copy is still walking that tree).
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        fs.outputFile(`${site.src}/assets/file-${i}.txt`, `${i}`),
      ),
    )

    const logger = { ...silentLogger, error: vi.fn() }
    const kiss = new Kiss({ folders: site.folders, logger })
    // Constructor already queued assets -> build; this second copy's target
    // is a subdirectory of that copy's own source tree.
    kiss.copyAssets(`${site.root}/extra`, `${site.src}/assets/sub`)

    const data = await kiss.complete()

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Error copying assets'),
    )
    expect(await site.exists('public/sub/a.txt')).toBe(true)

    const files = await fs.readdir(site.build)
    const numbered = files.filter((f) => f.startsWith('file-'))
    expect(numbered).toHaveLength(200)

    // Both copy results are collected, constructor's copy first.
    expect(data).toHaveLength(2)
    expect(data[0].data).toContain('assets')
    expect(data[0].data).toContain('public')
    expect(data[1].data).toContain('extra')
    expect(data[1].data).toContain('sub')
  })
})
