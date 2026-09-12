# 8 · data-fed site

An exemplar site: a stockists list built from a folder of JSON records, one page per record,
with the controller validating each record before it is allowed to become a page. One record in
the feed is broken on purpose, so the build reports it by name, builds every other page and
exits 1 — which is what a real feed does to you, and what your deploy script has to survive.

## Run it

```bash
npm run eg8                       # from the repo root
node 8-data-fed-site.js           # from examples/
node 8-data-fed-site.js --atomic  # same failure, published nothing
node 8-data-fed-site.js --dev     # live preview on http://127.0.0.1:3008
```

## The intended failure

`models/stockists/harbour-market-stall.json` has no `address` — the row was created the day the
pitch was agreed and the field was never filled in. The run ends with exactly one failure, named
by view, position in the fan-out and the record's own feed key:

```
1 page(s) failed to build: stockists/stockist.hbs [item 3: harbour-market-stall]
  stockists/stockist.hbs [item 3: harbour-market-stall]: Incomplete stockist record — missing address. Fix the feed, not the site.
```

Exit code 1, and `public/8-data-fed-site/` holds six pages: the index and the five stockists
whose records were complete. Run it with `--atomic` and the same failure publishes nothing at
all — `cleanBuild: 'atomic'` swaps the build in only when `complete()` resolves, so a bad feed
can never half-replace a live site.

## What to copy

The whole script, and `8-data-fed-site/controllers/stockist.js` with it:

- **The fan-out** — `.pages()` over a models folder, `path` naming the output folder, the
  controller deriving the slug.
- **The validation** — the feed's contract written once, in the controller, which throws for a
  record that cannot make a correct page. A throw fails one item, not the fan-out.
- **The shared validator** — the index imports the same check, so the listing can say which
  record is broken instead of quietly omitting it.
- **The exit code** — `await kiss.complete().catch(reportBuildFailure)`. Without the await, a
  broken feed exits 0 and the deploy ships a site with a hole in it.
- **The atomic build** — for anything publishing over a live site.

This example deliberately ships no `AIKB/` folder: `npx kiss-ssg aikb` records a site's knowledge
base only from a build that **worked**, and this one fails on purpose. Example 9 is the exemplar —
see `9-migrated-from-v1/AIKB/`.
