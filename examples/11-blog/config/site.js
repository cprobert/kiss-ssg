// The facts this site states more than once.
//
// Before this file existed, the journal's name was written out three times in
// router.js — once as the feed's channel title, once as llms.txt's heading, and
// again in the prose of the listing page — and its one-line description twice.
// A rename meant finding every copy, and the failure mode is silent: the feed
// and the sitemap simply start disagreeing about what the site is called.
//
// This is the `config/` seam from llms.txt § The build script, and it is worth
// noticing WHEN it was earned. Not by length — this router is no longer than
// example 7's, which has no config folder. By duplication: the moment one fact
// appeared in both the markup a person reads and the metadata a machine reads.
// That trigger is independent of the helper one, which is why a site can sit at
// tier 2 for its facts while its helpers are still inline at tier 0.
//
// router.js spreads this into `new Kiss()` as an arbitrary config key, so it
// reaches both sides of the site at once: `{{config.journal.name}}` in a
// template, `kiss.config.journal` in any helper this site later grows.
export const journal = {
  name: 'Aster & Oak — the journal',
  // The same sentence the feed puts in <description> and llms.txt puts in its
  // blockquote. One string, so the two can never drift apart.
  description:
    'Brewing notes, sourcing news and bench lots from a small-batch roastery in Bristol.',
  summary:
    'A small-batch coffee roastery in Bristol. Brewing notes, sourcing news and bench lots.',
  // Every URL the registry derives — each <loc>, each feed <link> and <guid>,
  // every {{canonical}} — is joined onto this.
  siteUrl: 'https://asterandoak.example',
}
