import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerPartials } from '../../lib/partials.js'
import { silentLogger } from '../../lib/logger.js'
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
