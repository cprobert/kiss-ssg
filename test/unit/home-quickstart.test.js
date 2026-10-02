// The docs site's home page and README.md's quick start must give the SAME
// setup, because someone may meet either one first.
//
// They did not. The home page said "add the two Claude Code plugins it
// prints" and showed three commands; the README carried all six, the
// prerequisites and the prompt to paste. A real first-time user (2026-10-02)
// could not get from the home page to a working site and had to go to the
// README — the page whose job is to be the front door was a teaser for the
// page that actually worked. The home page now carries the whole setup, and
// this test fails the moment the two disagree again.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CLAUDE_STEPS, CODEX_STEPS } from '../../lib/init.js'

const root = path.resolve(import.meta.dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// Each agent's block is found by the label line above its fence, not by
// position: the quick start also carries an optional third block.
const readmeCommands = (label) => {
  const readme = read('README.md').replace(/\r\n/g, '\n')
  const section = readme.slice(readme.indexOf('## Quick start'))
  const block = new RegExp(
    `^\\*\\*${label}\\*\\*\\n\\n\`\`\`sh\\n([\\s\\S]*?)\\n\`\`\``,
    'm',
  ).exec(section)
  if (!block) throw new Error(`no **${label}** sh block under ## Quick start`)
  return block[1].split('\n')
}

const home = JSON.parse(read('src/models/home.json'))
const steps = home.setup.steps
const box = (label) => steps[0].boxes.find((b) => b.label === label)

describe('the home page carries the whole quick start', () => {
  it('gives one complete box per agent, Claude Code first', () => {
    // Each box is the whole setup for its agent, so it copies in one go.
    expect(steps[0].code).toBeUndefined()
    expect(steps[0].boxes.map((b) => b.label)).toEqual(['Claude Code', 'Codex'])
    for (const b of steps[0].boxes) {
      const lines = b.code.split('\n')
      expect(lines.slice(0, 2)).toEqual([
        'mkdir my-site && cd my-site',
        'npx kiss-ssg@latest init',
      ])
      expect(b.note).toBeTruthy()
    }
  })

  it.each(['Claude Code', 'Codex'])(
    "gives the same %s commands as the README's, in the same order",
    (label) => {
      expect(box(label).code.split('\n')).toEqual(readmeCommands(label))
    },
  )

  it('installs the plugins init prints, for each agent', () => {
    // One source for the plugin lines: lib/init.js's constants, which
    // nextSteps() prints. The page and the README may not drift from them.
    expect(box('Claude Code').code.split('\n').slice(2, -1)).toEqual(
      CLAUDE_STEPS,
    )
    expect(box('Codex').code.split('\n').slice(2, -1)).toEqual(CODEX_STEPS)
  })

  it('gives an agent reading llms.txt every Codex install line', () => {
    const llms = read('llms.txt')
    for (const line of CODEX_STEPS) expect(llms).toContain(line)
  })

  it('installs the skills, not just declares them', () => {
    // The step that was missing from the page the first-time user read.
    expect(box('Claude Code').code.split('\n')).toEqual([
      'mkdir my-site && cd my-site',
      'npx kiss-ssg@latest init',
      'claude plugin marketplace add cprobert/kiss-ssg --scope project',
      'claude plugin install kiss-ssg@kiss-ssg --scope project',
      'claude plugin install kiss-memory@kiss-ssg --scope project',
      'claude',
    ])
    expect(box('Codex').code.split('\n')).toEqual([
      'mkdir my-site && cd my-site',
      'npx kiss-ssg@latest init',
      'codex plugin marketplace add cprobert/kiss-ssg',
      'codex plugin add kiss-ssg@kiss-ssg',
      'codex plugin add kiss-memory@kiss-ssg',
      'codex',
    ])
  })

  it('says where each agent installs its plugins', () => {
    // Claude Code installs them per project; Codex has no project scope and
    // installs them per user (measured 2026-10-02, Codex CLI 0.157.1).
    expect(box('Claude Code').note).toMatch(/this folder/)
    expect(box('Codex').note).toMatch(/your user/)
    expect(box('Codex').note).toMatch(/every folder/)
  })

  it('no longer calls Codex "another agent"', () => {
    // Codex has its own box now; only agents other than the two get the
    // llms.txt pointer. The skill-coverage CONTRADICTIONS scan does not reach
    // src/, so this is the only guard on the docs site's copy.
    for (const rel of ['src/models/home.json', 'src/pages/index.hbs'])
      expect(read(rel).replace(/\s+/g, ' ')).not.toMatch(
        /another agent than Claude Code/,
      )
  })

  it('names the Node floor package.json declares', () => {
    const floor = /(\d+\.\d+)/.exec(
      JSON.parse(read('package.json')).engines.node,
    )[1]
    const node = home.toolkit.tools.find((t) => t.name === 'Node.js')
    expect(node.what).toContain(floor)
  })

  it('lists the tools a newcomer needs, each with an icon that exists', () => {
    // The hero's "What you'll need" panel: required first, then Git (with
    // GitHub as the example), then a host to go live on.
    const tools = home.toolkit.tools
    expect(tools.map((t) => t.name)).toEqual([
      'Node.js',
      'Claude Code or Codex',
      'Git',
      'A host',
    ])
    const icon = (rel) =>
      fs.existsSync(path.join(root, 'src/partials', `${rel}.hbs`))
    for (const tool of tools) {
      expect(icon(tool.icon)).toBe(true)
      expect(['required', 'recommended', 'live']).toContain(tool.level)
      if (tool.url) expect(tool.url).toMatch(/^https:\/\//)
      for (const option of tool.options ?? []) {
        expect(option.url).toMatch(/^https:\/\//)
        expect(icon(option.icon)).toBe(true)
      }
    }
  })

  it('links each host to its own guide to publishing a built site', () => {
    // A host's home page tells a newcomer nothing about publishing; its
    // build-and-deploy guide does. Checked by hand on 2026-10-02.
    const host = home.toolkit.tools.find((t) => t.name === 'A host')
    expect(host.options.map((o) => o.name)).toEqual([
      'GitHub Pages',
      'Netlify',
      'Cloudflare Pages',
      'Vercel',
      'Firebase Hosting',
    ])
    for (const option of host.options)
      expect(new URL(option.url).pathname).not.toBe('/')
  })

  it('links both coding agents from one honest row', () => {
    // One agent's logo would not stand for both: the row carries a neutral
    // icon, and each agent's link carries its own.
    const agent = home.toolkit.tools.find(
      (t) => t.name === 'Claude Code or Codex',
    )
    expect(agent.icon).not.toBe('icons/claude')
    expect(agent.options.map((o) => o.name)).toEqual(['Claude Code', 'Codex'])
  })

  it('shows each site as a card with a screenshot that exists', () => {
    for (const site of home.sites) {
      expect(site.image).toMatch(/^img\/sites\/[a-z0-9-]+\.webp$/)
      expect(site.alt.length).toBeGreaterThan(site.name.length + 20)
      expect(site.description).toBeTruthy()
      expect(fs.existsSync(path.join(root, 'src/assets', site.image))).toBe(
        true,
      )
    }
  })

  it('gives every screenshot its dimensions, so the card holds its shape', () => {
    // The audit checks only that alt is present; this is the only guard on
    // width/height. The files are 768x480.
    const view = read('src/pages/index.hbs')
    const imgs = view.match(/<img\b[^>]*>/g) ?? []
    const shot = imgs.find((tag) => tag.includes('(asset image)'))
    expect(shot).toBeDefined()
    expect(shot).toMatch(/\bwidth="768"/)
    expect(shot).toMatch(/\bheight="480"/)
    expect(shot).toMatch(/\bloading="lazy"/)
    expect(shot).toMatch(/\balt="\{\{alt\}\}"/)
  })

  it('offers a prompt for a new site and one for a page you already have, naming real skills', () => {
    const prompts = steps.flatMap((s) => s.prompts ?? [])
    const skills = fs.readdirSync(path.join(root, 'plugins/kiss-ssg/skills'))
    for (const name of ['kiss-site-new', 'kiss-site-import']) {
      expect(skills).toContain(name)
      expect(prompts.some((p) => p.text.includes(name))).toBe(true)
    }
  })
})
