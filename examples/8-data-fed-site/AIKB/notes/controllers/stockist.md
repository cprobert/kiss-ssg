# stockist.js

## What it does

Holds the stockist feed's contract and enforces it. `REQUIRED_FIELDS` is `name`, `slug`, `town` and `address`; `missingFields(record)` returns the ones a record does not have as a non-empty string. The default export is the controller the `.pages()` fan-out runs per record: it **throws** when anything is missing, and otherwise returns `{ slug: slugFor(model), title: model.name, model }`.

`slugFor` is `utils.toSlug(record.slug)` — the feed's `slug` is a display key ("Severn Provisions, Portishead"), not a URL, so the output path is derived here rather than taken as given.

The same two helpers are imported by `8-data-fed-site.js` for the index page's inline controller, which splits the feed into `stocked` and `incomplete` and lists what each broken record is missing.

## Why it is this way

The contract lives in the controller, in one place, because the fan-out and the index both need it and a second copy would drift. Exporting `missingFields` and `slugFor` is what lets the index report against exactly the check that rejected the record, instead of quietly omitting it.

It throws rather than returning `generate: false` on purpose. A record that cannot make a correct page is a broken **feed**, not a page the site chose not to build: a throw fails that one item, leaves the rest of the fan-out registered and built, and makes `complete()` reject so the deploy script sees a non-zero exit. Silently skipping would ship a site with a hole in it and report success — the failure this whole example exists to demonstrate. The message says "Fix the feed, not the site" for the same reason.

`export default` is used because v2 accepts it; `module.exports =` still works, and the example prefers the modern form.

## Gotchas

- **The build exits 1 on purpose.** `models/stockists/harbour-market-stall.json` has no `address`, so one item always fails. `npm run eg8` is the only example that does not exit 0, and `test/integration/examples.test.js` asserts that it does not.
- **A throw here names the item, not a page.** No output path exists yet, so the failure reads `stockists/stockist.hbs [item 3: harbour-market-stall]` — view, position in the fan-out, and the record's own feed key. Position is 1-based and shifts when a record is added ahead of it; the feed key is the stable handle.
- **`slugFor` can collapse two records onto one page.** Two feed keys that slug to the same string claim the same output path, which is a build failure (`Page already processed`) rather than a silent overwrite. That is the right outcome, but the message points at the path, not at the feed — start from the two records whose `slug` fields differ only in punctuation.
- **A field that is present but blank counts as missing.** `missingFields` requires a non-empty trimmed string, so `"address": " "` fails the same way an absent key does. That is deliberate: a whitespace address renders as an empty line on the page.
