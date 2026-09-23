import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('folder creation', () => {
  it('creates partials/layouts/models/controllers even when assets is null', async () => {
    site = await makeSite({})
    new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    expect(await site.exists('src/partials')).toBe(true)
    expect(await site.exists('src/layouts')).toBe(true)
    expect(await site.exists('src/models')).toBe(true)
    expect(await site.exists('src/controllers')).toBe(true)
  })
})

describe('project paths containing glob metacharacters', () => {
  it('builds pages and compiles sass from a folder named site[old]', async () => {
    site = await makeSite({
      'site[old]/src/pages/index.hbs': 'hello',
      'site[old]/src/assets/style.scss': 'body { color: red }',
    })
    const kiss = new Kiss({
      folders: {
        src: `${site.root}/site[old]/src`,
        build: `${site.root}/site[old]/public`,
      },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.exists('site[old]/public/index.html')).toBe(true)
    expect(await site.exists('site[old]/public/style.css')).toBe(true)
  })
})

const protectedFolders = [
  'pages',
  'layouts',
  'partials',
  'models',
  'controllers',
  'assets',
  'helpers',
  'aikb',
]

// A rejected constructor must leave the tree untouched, not merely throw after
// wiping the source. All potentially destructive fixtures live in makeSite's
// temporary directory; the real project root is tested only via resolveConfig.
async function expectPreserved(
  folders,
  cleanBuild = true,
  pattern = /folder/i,
) {
  const before = (await fs.readdir(site.root, { recursive: true })).sort()
  let instance
  let error
  try {
    instance = new Kiss({ folders, cleanBuild, logger: silentLogger })
  } catch (caught) {
    error = caught
  } finally {
    // Also settle the unfixed implementation during red-first verification.
    if (instance) {
      await instance.complete().catch(() => {})
      await instance.close()
    }
  }
  expect(error?.message).toMatch(pattern)
  expect((await fs.readdir(site.root, { recursive: true })).sort()).toEqual(
    before,
  )
  expect(await site.read('content/sentinel.txt')).toBe('irreplaceable source')
}

function isolatedFolders(overrides) {
  return {
    ...Object.fromEntries(protectedFolders.map((key) => [key, null])),
    src: `${site.root}/src`,
    build: `${site.root}/public`,
    ...overrides,
  }
}

describe.each([true, false, 'atomic'])(
  'source preservation (%s)',
  (cleanBuild) => {
    it.each(protectedFolders)(
      'protects folders.%s in both directions',
      async (key) => {
        site = await makeSite({
          'content/sentinel.txt': 'irreplaceable source',
        })
        const content = `${site.root}/content`
        for (const [source, build] of [
          [content, content],
          [`${content}/nested`, content],
          [content, `${content}/generated`],
        ]) {
          await expectPreserved(
            isolatedFolders({ [key]: source, build }),
            cleanBuild,
            new RegExp(`folders\\.${key}`),
          )
        }
      },
    )
  },
)

describe('filesystem aliases', () => {
  const linkDirectory = (target, link) =>
    fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')

  it('refuses a source alias to the working project root', async () => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    const alias = `${site.root}/project-alias`
    await linkDirectory(process.cwd(), alias)
    // No recursive snapshot through this alias: it points at the actual repo.
    const { resolveConfig } = await import('../../lib/config.js')
    try {
      expect(() =>
        resolveConfig({ folders: isolatedFolders({ src: alias }) }),
      ).toThrow(/folders\.src.*project root/i)
    } finally {
      // Remove the live-repository link before any recursive fixture cleanup.
      await fs.unlink(alias).catch((error) => {
        // If unlink fails, retain the fixture rather than recursively clean
        // a tree that still contains a link to the live checkout.
        site = null
        throw error
      })
    }
  })

  it.each(['build', 'pages'])('protects an existing %s alias', async (key) => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    const content = `${site.root}/content`
    const alias = `${site.root}/alias`
    await linkDirectory(content, alias)
    await expectPreserved(
      isolatedFolders({ pages: content, build: content, [key]: alias }),
    )
  })

  it('resolves an existing alias above not-yet-created descendants', async () => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    await linkDirectory(`${site.root}/content`, `${site.root}/alias`)
    await expectPreserved(
      isolatedFolders({
        pages: `${site.root}/content/future/pages`,
        build: `${site.root}/alias/future`,
      }),
    )
  })

  it('refuses an unresolved link rather than assuming its location is safe', async () => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    await linkDirectory(`${site.root}/missing-target`, `${site.root}/alias`)
    await expectPreserved(
      isolatedFolders({ pages: `${site.root}/alias/pages` }),
      true,
      /Cannot safely resolve folders\.pages/,
    )
  })

  it('protects a source link located inside an aliased build folder', async () => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    await fs.ensureDir(`${site.root}/public`)
    await linkDirectory(`${site.root}/public`, `${site.root}/output-alias`)
    await linkDirectory(`${site.root}/content`, `${site.root}/public/pages`)
    await expectPreserved(
      isolatedFolders({
        pages: `${site.root}/public/pages`,
        build: `${site.root}/output-alias`,
      }),
    )
  })

  it('protects a nested source link when the project parent is also aliased', async () => {
    site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
    await fs.ensureDir(`${site.root}/project/public`)
    await linkDirectory(`${site.root}/project`, `${site.root}/project-alias`)
    await linkDirectory(
      `${site.root}/content`,
      `${site.root}/project/public/pages`,
    )
    await linkDirectory(
      `${site.root}/project/public`,
      `${site.root}/project/output-alias`,
    )
    await expectPreserved(
      isolatedFolders({
        pages: `${site.root}/project-alias/public/pages/nested`,
        build: `${site.root}/project-alias/output-alias`,
      }),
    )
  })

  it.skipIf(process.platform !== 'win32')(
    'protects case-different paths on Windows',
    async () => {
      site = await makeSite({ 'content/sentinel.txt': 'irreplaceable source' })
      await expectPreserved(
        isolatedFolders({
          pages: `${site.root}/content/new-pages`,
          build: `${site.root}/CONTENT`,
        }),
      )
    },
  )

  it('allows a build through an alias to a separate output folder', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'Hello',
      'output-parent/keep.txt': 'keep',
    })
    await linkDirectory(`${site.root}/output-parent`, `${site.root}/alias`)
    const kiss = new Kiss({
      folders: { ...site.folders, build: `${site.root}/alias/public` },
      logger: silentLogger,
    })
    try {
      await kiss.scan().generate().complete()
      expect(await site.read('output-parent/public/index.html')).toBe('Hello')
      expect(await site.read('output-parent/keep.txt')).toBe('keep')
    } finally {
      await kiss.close()
    }
  })
})
