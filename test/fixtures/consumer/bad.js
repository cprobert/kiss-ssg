// @ts-check
// Deliberate misuse: every line below must be an error. `types.test.js` asserts
// the exact lines, so a change that quietly loosens the published types — an
// `any` where a union was, a lost index signature — fails the suite.
import Kiss from 'kiss-ssg'

const kiss = new Kiss({
  cleanBuild: 1, // not boolean | 'atomic'
  folders: { biuld: './public' }, // misspelled folder key
})

kiss.buildIt() // no such method
