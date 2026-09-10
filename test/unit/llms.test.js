import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import {
  buildLlmsEntries,
  groupLlmsEntries,
  renderLlmsTxt,
  resolveText,
  sectionNameFor,
  writeLlms,
} from '../../lib/llms.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const entry = (buildTo, options = {}) => ({
  view: 'v',
  buildTo,
  page: { options: { slug: 'index', path: '', ...options } },
  runCount: 0,
})

const context = { siteUrl: 'https://e.com/', buildDir: 'out' }

describe('buildLlmsEntries', () => {
  it('maps build paths to the same URLs the sitemap emits', () => {
    const entries = buildLlmsEntries(
      [
        entry('out/index.html'),
        entry('out/about.html', { slug: 'about', title: 'About us' }),
        entry('out/courses/index.html', { slug: 'index', path: 'courses' }),
      ],
      context,
    )
    expect(entries.map((e) => e.url)).toEqual([
      'https://e.com/',
      'https://e.com/about',
      'https://e.com/courses/',
    ])
  })

  it('groups by the first path segment and names it from `sections`', () => {
    const entries = buildLlmsEntries(
      [
        entry('out/index.html'),
        entry('out/courses/bronze.html', { slug: 'bronze', path: 'courses' }),
        entry('out/dog-walks/a.html', { slug: 'a', path: 'dog-walks/wales' }),
      ],
      { ...context, sections: { courses: 'Our Courses' } },
    )
    expect(entries.map((e) => e.section)).toEqual([
      'Pages',
      'Our Courses',
      'Dog Walks',
    ])
  })

  it('lets a page name its own section, and the root section be renamed', () => {
    const entries = buildLlmsEntries(
      [
        entry('out/index.html'),
        entry('out/courses/bronze.html', {
          slug: 'bronze',
          path: 'courses',
          llmsSection: 'Highlights',
        }),
      ],
      { ...context, sections: { root: 'Main pages' } },
    )
    expect(entries.map((e) => e.section)).toEqual(['Main pages', 'Highlights'])
  })

  it('falls back to the slug for a page with no title of its own', () => {
    // `KissPage.prepare()` fills every untitled page's title with `Index`, so
    // that value is what "no title" looks like by the time the stack is built.
    const entries = buildLlmsEntries(
      [
        entry('out/puppy-classes.html', {
          slug: 'puppy-classes',
          title: 'Index',
        }),
        entry('out/index.html'),
      ],
      context,
    )
    expect(entries.map((e) => e.title)).toEqual(['Puppy Classes', 'Index'])
  })

  it('leaves out ignoreLlms, ignoreSitemap and generate: false pages', () => {
    const entries = buildLlmsEntries(
      [
        entry('out/a.html', { slug: 'a' }),
        entry('out/b.html', { slug: 'b', ignoreLlms: true }),
        entry('out/c.html', { slug: 'c', ignoreSitemap: true }),
        entry('out/d.html', { slug: 'd', generate: false }),
      ],
      context,
    )
    expect(entries.map((e) => e.title)).toEqual(['A'])
  })

  it('carries the description, and reports none as an empty string', () => {
    const entries = buildLlmsEntries(
      [
        entry('out/a.html', { slug: 'a', description: 'One\n  line  now' }),
        entry('out/b.html', { slug: 'b' }),
      ],
      context,
    )
    expect(entries[0].description).toBe('One line now')
    expect(entries[1].description).toBe('')
  })
})

describe('sectionNameFor', () => {
  it('title-cases an unmapped segment and defaults the root name', () => {
    expect(sectionNameFor('behavioural-consultations')).toBe(
      'Behavioural Consultations',
    )
    expect(sectionNameFor('')).toBe('Pages')
    expect(sectionNameFor('', { root: 'Start here' })).toBe('Start here')
  })
})

describe('groupLlmsEntries', () => {
  it('keeps first-seen order but puts the root section first', () => {
    const groups = groupLlmsEntries(
      [
        { title: 'B', url: 'u', description: '', section: 'Courses' },
        { title: 'A', url: 'u', description: '', section: 'Pages' },
        { title: 'C', url: 'u', description: '', section: 'Courses' },
      ],
      'Pages',
    )
    expect(groups.map((g) => g.name)).toEqual(['Pages', 'Courses'])
    expect(groups[1].entries.map((e) => e.title)).toEqual(['B', 'C'])
  })
})

describe('renderLlmsTxt', () => {
  it('renders the llmstxt.org shape, with one trailing newline', () => {
    const text = renderLlmsTxt({
      title: 'A1K9 Training',
      summary: 'Dog training in South Wales.\n\nBehaviour too.',
      notes: 'Prices are per session.',
      groups: [
        {
          name: 'Pages',
          entries: [
            {
              title: 'Home',
              url: 'https://e.com/',
              description: 'The front page',
            },
            { title: 'About', url: 'https://e.com/about', description: '' },
          ],
        },
      ],
    })
    expect(text).toBe(
      [
        '# A1K9 Training',
        '',
        '> Dog training in South Wales.',
        '>',
        '> Behaviour too.',
        '',
        '## Pages',
        '',
        '- [Home](https://e.com/): The front page',
        '- [About](https://e.com/about)',
        '',
        '## Notes',
        '',
        'Prices are per session.',
        '',
      ].join('\n'),
    )
  })

  it('omits the Notes section when there are none', () => {
    const text = renderLlmsTxt({ title: 'T', summary: 'S' })
    expect(text).toBe('# T\n\n> S\n')
  })

  it('escapes brackets in a title and parens in a URL', () => {
    const text = renderLlmsTxt({
      title: 'T',
      summary: 'S',
      groups: [
        {
          name: 'Pages',
          entries: [
            {
              title: 'Puppies [beta]',
              url: 'https://e.com/a(1)',
              description: '',
            },
          ],
        },
      ],
    })
    expect(text).toContain('- [Puppies \\[beta\\]](https://e.com/a%281%29)')
  })
})

describe('resolveText', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
    site = null
  })

  it('reads a file when the string names one, else uses the string', async () => {
    site = await makeSite({ 'summary.md': 'From **a file**.\n\n' })
    expect(await resolveText(`${site.root}/summary.md`)).toBe(
      'From **a file**.',
    )
    expect(await resolveText('Just text')).toBe('Just text')
    expect(await resolveText(undefined)).toBe('')
  })
})

describe('writeLlms', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
    site = null
  })

  const opts = { title: 'Site', summary: 'What it is.' }

  it('reports a missing siteUrl, title or summary without writing', async () => {
    site = await makeSite({})
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    const base = { logger: silentLogger }
    expect(
      (
        await writeLlms([], {
          ...base,
          config: { folders: { build: site.build } },
          options: opts,
        })
      ).status,
    ).toBe('no-site-url')
    expect((await writeLlms([], { ...base, config, options: {} })).status).toBe(
      'no-title',
    )
    expect(
      (await writeLlms([], { ...base, config, options: { title: 'S' } }))
        .status,
    ).toBe('no-summary')
    expect(await site.exists('public/llms.txt')).toBe(false)
  })

  it('writes, and skips when overwrite is false and a file exists', async () => {
    site = await makeSite({ 'public/llms.txt': 'old' })
    const config = { siteUrl: 'https://e.com', folders: { build: site.build } }
    const stack = [entry(`${site.build}/index.html`, { title: 'Home' })]

    const skipped = await writeLlms(stack, {
      config,
      logger: silentLogger,
      options: opts,
      overwrite: false,
    })
    expect(skipped.status).toBe('skipped')
    expect(await site.read('public/llms.txt')).toBe('old')

    const written = await writeLlms(stack, {
      config,
      logger: silentLogger,
      options: opts,
    })
    expect(written.status).toBe('written')
    expect(await site.read('public/llms.txt')).toBe(written.text)
    expect(written.text).toBe(
      '# Site\n\n> What it is.\n\n## Pages\n\n- [Home](https://e.com/)\n',
    )
  })

  it('rejects when llms.txt cannot be written, so the caller can report it', async () => {
    site = await makeSite({})
    await fs.ensureDir(`${site.build}/llms.txt`)
    await expect(
      writeLlms([], {
        config: { siteUrl: 'https://e.com', folders: { build: site.build } },
        logger: silentLogger,
        options: opts,
      }),
    ).rejects.toThrow()
  })
})
