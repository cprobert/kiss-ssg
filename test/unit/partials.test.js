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

// Layouts are the one kind of partial registered compiled rather than as
// source. `handlebars-layouts`' `extend` helper reads `handlebars.partials[name]`
// and compiles it when it finds a string, without writing the result back — so
// a layout was recompiled on every single page render.
describe('layouts are registered compiled', () => {
  const deps = { markdown: new Remarkable(), logger: silentLogger }
  const folders = (site) => ({
    folders: {
      partials: `${site.src}/partials`,
      layouts: `${site.src}/layouts`,
    },
  })

  it('registers a layout as a function and every other partial as a string', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main>{{#block "body"}}{{/block}}</main>',
    })
    const hbs = Handlebars.create()
    registerPartials(hbs, folders(site), deps)
    // The compatibility line: consuming sites read `hbs.partials` in their own
    // helpers, and at least one calls `handlebars.compile(partial)`
    // unconditionally — which throws on a function. Only layouts change type.
    expect(typeof hbs.partials['main']).toBe('function')
    expect(typeof hbs.partials['nav']).toBe('string')
    expect(typeof hbs.partials['note']).toBe('string')
  })

  it('compiles a layout once however many pages render it', async () => {
    site = await makeSite({
      'src/layouts/main.hbs': '<main>{{name}}</main>',
    })
    const hbs = Handlebars.create()
    let compiles = 0
    const real = hbs.compile.bind(hbs)
    hbs.compile = (...a) => {
      compiles++
      return real(...a)
    }
    registerPartials(hbs, folders(site), deps)
    compiles = 0
    // Rendering through the registered layout many times must not recompile it.
    const layout = hbs.partials['main']
    for (let i = 0; i < 50; i++)
      expect(layout({ name: `p${i}` })).toContain(`p${i}`)
    expect(compiles).toBe(0)
  })

  // `hbs.compile` parses lazily, so registering eagerly moves no failure
  // earlier: a broken layout still registers quietly and still throws at
  // render, against the page that used it, exactly as before.
  it("does not move a broken layout's failure from render to registration", async () => {
    site = await makeSite({ 'src/layouts/broken.hbs': '{{#if}}unclosed' })
    const hbs = Handlebars.create()
    expect(() => registerPartials(hbs, folders(site), deps)).not.toThrow()
    expect(() => hbs.partials['broken']({})).toThrow()
  })
})
