# Phase 2 baselines, before any engine change

Taken 2026-11-15 on `feat/command-runs-build` at `5ab88b4`, whose `lib/`, `bin/`, `types/`,
`starter/`, `examples/`, `plugins/`, `llms.txt`, `GUIDE.md`, `README.md` and `package.json` are
identical to `main` at `39d4e3a` (`git diff --stat main HEAD -- …`: empty, exit 0). Both are
2.17.1. The Phase 2 exit runs the same two measurements on the branch's tarball.

## Clean room: the bakery brief on Sonnet

The brief is [`clean-room-bakery-brief.md`](clean-room-bakery-brief.md), rebuilt from the
architecture review's description because the 2026-11-13 run's brief was never committed. It says
nothing about failure handling, on purpose.

Run: `node scripts/arms.mjs setup` on an empty git repo (one `package.json`), `--plugin-ref HEAD`,
engine packed from the working tree, then `arms.mjs run --budget 3 --model claude-sonnet-5-5`.
`arms.mjs summarise`, exit 0:

- `claude-sonnet-5-5`, Claude Code 2.1.323, $0.28, 79 seconds, 12 turns, 11 Bash calls. No Skill
  call, no `SKILL.md` read, no permission denial, no commit.
- `kiss-ssg check` exit 0 on all three runs. The first was green but had two of the agent's own
  mistakes, which it found from the report's orphans: no model on the listing page, and an `id`
  on `.pages()` that clashed with the listing's id.
- Read: `llms.txt` in full, `starter/`, six `GUIDE.md` sections, `package.json`. Not read:
  `AIKB/`, `examples/`, any skill.
- **Failure boilerplate: written.** `router.js` copies the starter's `reportBuildFailure` (lines
  3–9), `const dev = process.argv.includes('--dev')` (line 11) and
  `await kiss.complete().catch(reportBuildFailure)` (line 55): 9 of its 55 lines. Phase 2's exit
  criterion is that the same brief produces none of them.
- Guesses it reported, for the design and the docs: that a listing page needs its own
  `model: 'bakes.json'`; the id of a fanned-out page (`bakes/bake` plus the slug), confirmed only
  by the links working; `host: 'netlify'` chosen so the redirect would be written.

## Fleet: main against the branch on the six named sites

`node scripts/fleet-check.mjs <folder> --base main --branch HEAD [--entry …] --out <scratch>`,
run by a Sonnet subagent, each log's last lines read by Claude afterwards.

| Site           | Folder                  | `--entry`                 | Pages | Build files | Time | Exit |
| -------------- | ----------------------- | ------------------------- | ----- | ----------- | ---- | ---- |
| a1k9training   | the site                | none                      | 20    | 571         | 29s  | 0    |
| oxford-medical | the site                | `router.js`               | 402   | 3,232       | 77s  | 0    |
| diploma-msc    | scratch copy, live data | `router.js production`    | 673   | 1,521       | 132s | 0    |
| learna-kiss    | scratch copy, live data | `router.js production`    | 151   | 456         | 47s  | 0    |
| medulla        | scratch copy, live data | `router.js production`    | 1,148 | 1,175       | 133s | 0    |
| metacarpus     | scratch copy, live data | `new-cohort.js 2026-sept` | 101   | 107         | 31s  | 0    |

Every site: 0 pages changed, added or removed; 0 files differ as bytes. Broken links (403 on
oxford-medical, 30 on diploma-msc, 0 elsewhere) and audit counts are equal on both sides.

What the exit run must repeat:

- **oxford-medical needs `core.longpaths`.** The first run exited 2: fleet-check's
  `git clone --local` hit "Filename too long". Re-run with
  `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.longpaths GIT_CONFIG_VALUE_0=true` in the environment:
  exit 0.
- **The CMS recipe**, from the fleet memory: `git archive HEAD | tar -x` into a scratch folder,
  the site's `.env` copied in (medulla's for metacarpus), `npm install --no-package-lock
--ignore-scripts`, `npm run get-data` (exit 0 on all four), then fleet-check on the copy.
- **fleet-check copies the `.env` into its `--out` folder too** (`out-<site>/site/.env`), so the
  clean-up is 8 files, not 4. All 8 were deleted; `find` for `.env` in the scratch root returns 0.
- **metacarpus's `generate: false` handbooks were not exercised**: the current intake has none,
  so the 2.17.1 "skipped" reading is not shown by this run either way.
