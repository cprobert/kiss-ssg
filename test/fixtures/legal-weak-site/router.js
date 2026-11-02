// A test fixture, never an example: a three-page small-business site with the
// legal and privacy gaps the kiss-legal-and-privacy skill and the audit's
// legal checks exist to catch. It lives under test/ so it never ships, and no
// one should copy its shape. Each planted gap is listed in
// test/fixtures/legal-answer-key.json with `bench: 'fixture'`.
//
// Planted, on purpose:
//  - contact.hbs: a form collecting email (type=email) and phone (type=tel),
//    with no line about what happens to them and no link to a privacy page
//    (there is no privacy page at all);
//  - contact.hbs: a pre-ticked "Send me offers and news" checkbox;
//  - contact.hbs: a Netlify honeypot field (`bot-field`), which is not a gap:
//    it is there so the audit's honeypot rule is exercised;
//  - about.hbs: a `<mark>[to confirm: …]</mark>` left in the copy;
//  - layout.hbs: a Google Fonts stylesheet plus a preconnect to
//    fonts.gstatic.com, and an analytics `<script src>` from a third party;
//  - about.hbs: a youtube-nocookie.com iframe;
//  - no postal address and no email address anywhere.
//
// Everything else is deliberately clean (title, description, canonical,
// og:image, favicon), so the audit's findings on a build are the planted
// ones. The fourth page a launch audit asks for, a 404, is ignored by name.
//
// Build: `node test/fixtures/legal-weak-site/router.js` from any folder. The
// output goes to LEGAL_WEAK_SITE_BUILD when it is set (a test's temp folder),
// otherwise to public/ beside this file, which the repository's `public/`
// rule in .gitignore keeps out of git.
import path from 'node:path'
import Kiss from 'kiss-ssg'

const here = import.meta.dirname

const kiss = new Kiss({
  site: {
    name: 'Brightwater Dog Walking',
    tagline: 'Group walks and puppy visits around the reservoir',
  },
  siteUrl: 'https://weak-site.example',
  folders: {
    src: path.join(here, 'src'),
    build: process.env.LEGAL_WEAK_SITE_BUILD ?? path.join(here, 'public'),
  },
  audit: { ignore: ['not-found-missing'] },
})
  .scan()
  .generate()

await kiss.complete().catch((err) => {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
})
