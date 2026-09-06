---
branch: claude/library-speed-optimization-dx73qq
base: main
status: closed
opened: 2026-09-06
---

# Session Log — 2026-09-06: Speed Review Follow-ups

**What we shipped:** an independent review of PR #7 (the speed branch), then
four follow-ups from it, each measured same-machine against a record taken
with the change stashed: a content-keyed template cache, a minifier preload
for non-dev builds, an empty-file rule in the watcher, and a cached import
promise (`ec0ad4c`). Plus the `npm version` lifecycle hook that `CLAUDE.md`
and `/branch-close` both described but nobody had wired (`546cc65`), and a
credential note removed from the previous reflection (`062123a`). Version
`2.0.0-alpha.5`.

**Supervision:** emergent, and directed by short, exact steers — "critically
review", "only interested in something I could improve", "do all four, with
the before/after numbers". **Active supervisor.** The standout dimension is
**verification & ownership, delegated deliberately and then checked**: the
operator asked for a critical review rather than accepting PR #7's own
account, and that review found the pulse log had reported a 50-page build
phase as "+0.7%" that measured **+44%** same-machine, and a headline range of
"-46% to -80%" that reads -26% to -71% like-for-like. The miss on Claude's side
was the same one in the other direction: the preload was pitched as reclaiming
"most of the 95ms" at 50 pages and reclaimed none — the import is CPU-bound
and a 50-page site has ~5ms of awaits to hide it behind. It was caught by the
same discipline (9-run re-measure before writing the doc), and the AIKB
paragraph was corrected before it was pushed. Iteration discipline held: one
"before" sweep was discarded because edits had landed mid-run, and re-taken
clean. Where supervision was thin: no `/branch-pulse`, and the operator did
not independently re-run any number this time either — the check that caught
PR #7's overclaim was Claude's, not theirs.

**Feedback for next time:** For the operator — the review you asked for is
the habit worth keeping; the next step is asking for one number to be re-run
before you accept it, on every perf branch. For Claude — do not predict a
magnitude for an overlap optimisation without first checking what there is to
overlap with; and "the docs say the hook is wired" is a claim to verify at the
bump, not after it drifts. For the pair — same-machine, minutes-apart A/B is
the only comparison either of us should quote; the committed `baseline-main`
and `local-*` records are history, not baselines.

**Did we achieve the objective?** Met. The template cache no longer depends
on filesystem timestamp granularity (test pins a content change with the
mtime pinned back). A truncate-then-write save on a slow mount no longer
produces a spurious failed rebuild (0 torn reads across 4 gaps, was 4).
Production builds at 500 pages are 5–11% faster in the build phase; at 50
pages unchanged, and the doc says so. Re-render latency unchanged at ~35ms.
Output byte-identical to `main`. Open: the chunked-write torn read is
unchanged (self-heals via chokidar's second event); real-site benchmarks
still need the four consuming sites migrated to v2.
