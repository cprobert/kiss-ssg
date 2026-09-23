---
name: bench
description: Run and interpret the kiss-ssg benchmark harness (`npm run bench`) — the six fixture scenarios, comparing against a recorded baseline, and timing a REAL site with --site/--dev. Use when asked to benchmark, time a build, measure a regression, compare against a baseline, or check watch/live-reload latency.
---

# Benchmark harness

`npm run bench` — 6 scenarios over a generated fixture, a fresh child process per
iteration, median of N runs.

```bash
npm run bench --pages=50,500 --runs=5 --scenario=scan,watch
```

Scenarios: `startup`, `scan`, `models`, `fanout`, `watch`, `styled`.

`styled` reproduces a real site's shape: a shared stylesheet compiled by the
`{{sass}}` helper on every page.

## Recording and comparing

- `--json=<f>` records a run.
- `--baseline=<f>` compares against a record.

**A committed record under `planning/benchmarks/` is history, not a baseline.**
Numbers from another machine or another day compare with nothing. Record the base
branch here first, then compare.

## Timing a real site

`--site=<path>` times a REAL kiss-ssg site instead of the fixture: it runs the
site's own build script, in its own cwd, with `KISS_REPORT` set. Nothing is
installed, linked or edited. It prints which kiss-ssg it resolved, since two runs
on different copies are not comparable.

- `--entry=<script>` when `package.json`'s build script isn't a bare `node x.js`.

## Watch readings

`--dev="<script> [args]"` adds a WATCH reading to every `--site`: it starts that
dev entry, then edits a page, a partial and a model in turn and times each save to
its live reload.

The partial row re-registers the partials and re-renders the pages that rendered it
(every page for a layout-wide partial, when partial/model is the
registration-vs-render split).

- `--livereload-port` / `--dev-port` say where that dev process listens
  (`35729` / `3001`).
- `--partial` / `--model` / `--page` name the files to touch, else the first
  candidate under `src/partials`, `src/models` and `src/pages`.

**`--partial` should be one a page renders.** One nothing has rendered yet
re-renders every page (the fallback, not a scoped save), and one whose pages have
all dropped it re-renders nothing, broadcasts no live reload, and the reading times
out.
