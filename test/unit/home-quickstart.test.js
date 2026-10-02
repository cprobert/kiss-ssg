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

const root = path.resolve(import.meta.dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const readmeCommands = () => {
  const readme = read('README.md').replace(/\r\n/g, '\n')
  const section = readme.slice(readme.indexOf('## Quick start'))
  const block = /```sh\n([\s\S]*?)\n```/.exec(section)
  if (!block) throw new Error('no ```sh block under ## Quick start')
  return block[1].split('\n')
}

const home = JSON.parse(read('src/models/home.json'))
const steps = home.setup.steps

describe('the home page carries the whole quick start', () => {
  it('gives the same commands as the README, in the same order', () => {
    expect(steps[0].code.split('\n')).toEqual(readmeCommands())
  })

  it('installs the skills, not just declares them', () => {
    // The step that was missing from the page the first-time user read.
    expect(steps[0].code).toMatch(/claude plugin install kiss-ssg@kiss-ssg/)
    expect(steps[0].code).toMatch(/claude plugin install kiss-memory@kiss-ssg/)
  })

  it('names the Node floor package.json declares', () => {
    const floor = /(\d+\.\d+)/.exec(
      JSON.parse(read('package.json')).engines.node,
    )[1]
    expect(home.setup.needs.map((n) => n.name).join(' ')).toContain(floor)
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
