import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerPartials } from '../../lib/partials.js'
import { silentLogger } from '../../lib/logger.js'
import fs from 'fs-extra'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('registerPartials', () => {
  it('registers hbs, html and md partials by path-derived name, and layouts', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/layout/footer.html': '<footer/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main/>',
    })
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      {
        folders: {
          partials: `${site.src}/partials`,
          layouts: `${site.src}/layouts`,
        },
      },
      { markdown: new Remarkable(), logger: silentLogger },
    )
    expect(names.sort()).toEqual(['layout/footer', 'main', 'nav', 'note'])
    expect(hbs.partials['note']).toContain('<h1>Note</h1>')
  })

  it('unregisters a name the previous pass produced and this one did not', async () => {
    site = await makeSite({
      'src/partials/keep.hbs': 'K',
      'src/partials/gone.hbs': 'G',
    })
    const hbs = Handlebars.create()
    const deps = { markdown: new Remarkable(), logger: silentLogger }
    const config = {
      folders: { partials: `${site.src}/partials`, layouts: null },
    }
    const first = registerPartials(hbs, config, deps)
    expect(first.sort()).toEqual(['gone', 'keep'])

    await fs.remove(`${site.src}/partials/gone.hbs`)
    const second = registerPartials(hbs, config, deps, first)
    expect(second).toEqual(['keep'])
    expect(Object.keys(hbs.partials)).toEqual(['keep'])
  })

  it('leaves every partial registered when nothing changed on disk', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main/>',
    })
    const hbs = Handlebars.create()
    const deps = { markdown: new Remarkable(), logger: silentLogger }
    const config = {
      folders: {
        partials: `${site.src}/partials`,
        layouts: `${site.src}/layouts`,
      },
    }
    const first = registerPartials(hbs, config, deps)
    const second = registerPartials(hbs, config, deps, first)
    expect(second.sort()).toEqual(['main', 'nav', 'note'])
    expect(Object.keys(hbs.partials).sort()).toEqual(['main', 'nav', 'note'])
  })

  it('keeps the same collision winner when re-run', async () => {
    // foo.md and foo.hbs derive the same name; the hbs pass runs last and wins.
    // A re-run must not let the unregister sweep drop the surviving winner.
    site = await makeSite({
      'src/partials/foo.md': '# Markdown',
      'src/partials/foo.hbs': 'HBS',
    })
    const hbs = Handlebars.create()
    const deps = { markdown: new Remarkable(), logger: silentLogger }
    const config = {
      folders: { partials: `${site.src}/partials`, layouts: null },
    }
    const first = registerPartials(hbs, config, deps)
    expect(first).toEqual(['foo', 'foo'])
    expect(hbs.partials['foo']).toBe('HBS')

    const second = registerPartials(hbs, config, deps, first)
    expect(second).toEqual(['foo', 'foo'])
    expect(hbs.partials['foo']).toBe('HBS')
  })

  it('skips null folders', () => {
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      { folders: { partials: null, layouts: null } },
      { markdown: new Remarkable(), logger: silentLogger },
    )
    expect(names).toEqual([])
  })
})
