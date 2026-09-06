# 7 · versioned outputs

An exemplar site: one build per season into its own folder under `public/7-versioned-outputs/`,
plus a top-level index listing every season built so far. It is the shape for anything that
publishes a new edition beside the old ones — a handbook per cohort, a docs set per release —
and it is careful about the two things that shape gets wrong: cleaning and validation.

## Run it

```bash
npm run eg7                          # from the repo root, builds the "test" season
node 7-versioned-outputs.js          # from examples/
node 7-versioned-outputs.js 2026-spring   # any lowercase slug is a season
```

No `--dev`: this one builds and exits.

## What to copy

The whole script. Three things in it are load-bearing: the argv slug is validated before it
reaches the constructor (it becomes a filesystem path, and an empty string would point
`cleanBuild` at the whole archive); the season build uses `cleanBuild: 'atomic'`, so a failed
rebuild of an already-published season leaves it exactly as it was; and the archive index is a
second instance with `cleanBuild: false`, because the default would empty the archive it is
about to list.
