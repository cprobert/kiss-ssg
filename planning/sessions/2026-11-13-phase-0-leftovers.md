---
branch: chore/phase-0-leftovers
base: main
status: open
opened: 2026-11-13
scope: planning/**, test/**, AIKB/**, lib/**, bin/**, GUIDE.md, llms.txt, README.md, types/**, CHANGELOG.md, package.json, package-lock.json, .claude-plugin/marketplace.json, plugins/*/.claude-plugin/plugin.json, scripts/base-branch.mjs, CONTRIBUTING.md
---

# Session — 2026-11-13: Phase 0 leftovers, and a current roadmap

## Intent (captured at /branch-open)

**Objective:** Close everything Phase 0 left open — the exit report's three operator items and issues #81, #82 and #83 — and bring `planning/ROADMAP.md` and the roadmap to 3.0 up to date, so Phase 1 starts from a fleet baseline, a reviewed Phase 0 and a plan that matches what shipped.

**Success criteria:**

- [ ] **Fleet baseline.** `node scripts/fleet-check.mjs <site> --base v2.14.0 --branch v2.15.0` has run on every v2 fleet site under `C:\Code\kiss` that can build (a1k9training, pro-plumbing, swan-love, k9-solutions, learna-kiss, diploma-msc, oxford-medical, codex, metacarpus), with each exit code recorded. Every difference is explained, and every site that cannot run says why. The exit report's item 1 is filled in.
- [ ] **Sonnet clean rooms.** The review's two briefs (a new helper from a fresh clone; the bakery site from the packed tarball) have run through `scripts/arms.mjs` on Sonnet. Attempts to green and every place it guessed are recorded in exit-report item 2, and each guess is either fixed in what ships or filed as an issue.
- [ ] **Independent review of Phase 0.** Codex reviews the `lib/` and `bin/` changes in `v2.14.0..v2.15.0` against the threat model below and loops until a round finds nothing in it. Each counted finding is fixed with a red-first regression test, or decided by the operator. Exit-report item 3 is filled in.
- [ ] **#81.** On a throwaway copy of learna-kiss (never its own folder): `links.trailingSlash: false` + `redirects.format: 'firebase'` built; `<loc>` entries checked for trailing slashes; `{{canonical}}` and `{{link}}` checked to agree on the same page; the site's hand-rolled `canonical` helper removed and `kiss-ssg check` compared before and after. Findings reported on the issue and to the operator; the issue is closed, or stays open with what is left for the site.
- [ ] **#82.** Example 12 built (`npm run eg12`), the original and the conversion screenshotted side by side, and the structure and region names put in front of the operator. Their verdict is recorded on the issue.
- [ ] **#83.** `test/integration/examples.test.js` fails when a committed `examples/*/AIKB/` record differs from a fresh one, and names the command that re-records it, instead of rewriting the tracked file. Seen to fail against the base with `node scripts/red-first.mjs`. `AIKB/testing.md` is updated to match.
- [ ] **Roadmap current.** `planning/plans/2026-11-10-roadmap-to-3.0.md`: phase version labels shifted by one minor (Phase 0 shipped as 2.15.0; Phase 1 is 2.16 partial transforms + 2.17 markdown-it, and the later phases follow), Phase 0's line says what shipped, and "Decisions still needed" is true. `planning/ROADMAP.md`'s "road to 3.0" paragraph no longer says five decisions are open. The partial-transforms spec's status line points at Phase 1.
- [ ] `npm run gates` passes on the final commit.

**Non-goals / out of scope:** Starting Phase 1 (partial transforms, markdown-it, the freeze). Changing learna-kiss or any fleet site's own repository. Fixing review findings outside the threat model below: those become issues. Re-recording the budgets baseline. Running `/kiss-publish` or tagging anything.

**Impact surface:** engine internals, if the Phase 0 review finds anything in `lib/`; otherwise tooling & docs. That means a patch (2.15.1) if `lib/` changes, and no version bump otherwise.

**Expected shape:** between. The roadmap edit and #83 are planned. The fleet, clean-room, review and #81 results are measurements whose follow-up work can't be known yet.

**Assumptions:**

- learna-kiss is now on this machine, at `C:\Code\kiss\learna-kiss` — measured, `ls /c/Code/kiss` (2026-11-13). #81 says it was not.
- The fleet sites pin these kiss-ssg versions: a1k9training ^2.14.0, pro-plumbing ^2.13.3, swan-love ^2.6.2, k9-solutions ^2.13.3, learna-kiss ^2.12.0, diploma-msc ^2.12.0, oxford-medical ^2.9.0, metacarpus ^2.13.3, codex the GitHub `main` tarball — measured, each site's `package.json` read (2026-11-13). fleet-check installs packed tarballs, so the site's pin does not decide which engine gets built.
- `fleet-check.mjs` takes `--branch <ref>`, so it can compare v2.14.0 against v2.15.0 — measured, `node scripts/fleet-check.mjs --help` (2026-11-13).
- Phase 0's engine diff is 13 files under `lib/` and `bin/`, +416/−89 — measured, `git diff --stat v2.14.0 v2.15.0 -- lib bin` (2026-11-13).
- `examples.test.js` checks that the knowledge base is byte-identical at tests 9 and 11 (lines 272, 639) — measured, by grep (2026-11-13). Whether the test rewrites files before it compares is inferred from #83's text and has not been read yet.
- metacarpus builds 0 pages because its CMS data is not on disk, so its fleet check proves little; medulla is still on 1.x and is left out — inferred from memory (2026-10-03), to re-check.
- Codex has credit — not yet checked.

**Delegation convention:** Claude (Opus) briefs and reviews. Sonnet subagents run the fleet checks and the clean-room arms. The arms are the experiment and run headless by design. Claude writes the #83 fix, the review fixes and the roadmap edits. Agents never commit, and they never write into a fleet site's own folder.

**Independent review:** this branch's purpose includes one, of Phase 0 itself. It is Codex, looping until clean, with this stop condition written before the first round:

- **Scope:** the `lib/` and `bin/` changes in `v2.14.0..v2.15.0`, plus any fix this branch makes to them.
- **Threat model (what counts):** a wrong build output; a failure the build swallows or reports as `ok`; a security hole in the fetch, alias or staging changes, reachable through a site author's own config and data, or through data fetched from a URL model.
- **Below it:** style, naming, docs wording, and hypothetical misuse by a hostile site author become issues or are dropped, never fixes on this branch.
- **Loop:** fix, then re-run Codex. Stop when a round finds nothing in the threat model. Between rounds, the largest fix diff goes in front of the operator. If the findings change kind, the threat model goes back to the operator before the next round.

Any `lib/` fix also gets a Codex round at `/branch-close`.

### Amendments

- 2026-11-13 — **The Codex loop is capped at three rounds** (operator: "if it goes more than three loops you can ask me"). After round three, Claude asks before running a fourth. The operator also asked for no work beyond what firm foundations for Phase 1 need.
- 2026-11-13 — **The Phase 0 review is a review of the phase, not a second read of the same diff.** Codex already reviewed Phase 0's code diff once, at that branch's close (`planning/sessions/2026-11-10-phase-0.md`, line 91), and the closing summary says "Codex covered the code diff, not the phase". This branch's round therefore asks two things: the threat model over `v2.14.0..v2.15.0 -- lib bin`, read afresh; and whether each Phase 0 bullet in the roadmap was done. Found while writing the brief: review item 8's "cap response size" on fetched data appears nowhere in `lib/` (grep for size/maxBytes/content-length in `lib/fetch-policy.js` and `lib/model-resolver.js`: no match).
- 2026-11-13 — **Codex round 1's phase gaps, decided by the operator.** Response-size cap: implement it here (`fetch.maxBytes`, default 50,000,000, `80dc747`). The budgets reporter not being in `npm run gates`: leave it to Phase 1's freeze, whose bullet now says to wire it in. `packed.test.js` linking `node_modules` instead of installing: record the boundary (the fleet check is the real install), with no code change. Round 1's one counted finding, JS imports the hashing detector missed, is fixed as a class in `fcb70fe`.
- 2026-11-13 — **The Codex loop ran four rounds, the fourth by the operator's choice once the cap was reached.** Round 1: the phase review above, plus one counted finding (`fcb70fe`). Round 2: the size cap was clean; one P3, a specifier holding a backtick, which the one-pattern fix no longer read (`3f38caf`). Round 3: one P2, a stray quote in a regex literal whose false match swallowed the import after it, reachable because of round 2's fix (`8c0875c`, now a zero-width lookahead). Round 4: "No findings in the threat model"; adversarial lines up to 4 MB took 18–165 ms. Each finding got a test that was red on `main` first. Rounds 2 and 3 both found edges in Claude's own fix to the detector, not in Phase 0's code: a regex grammar keeps producing edges, and the loop ended because a round came back clean, not because the class was proven closed.
- 2026-11-13 — **Scope widened** to `scripts/base-branch.mjs` and `CONTRIBUTING.md`, for two of the Sonnet clean room's guesses. The base-branch error now says what value to give. CONTRIBUTING now says Prettier has no parser for `llms.txt`.

## Pulse log

- **2026-11-13** — All eight criteria met with evidence. Fleet: 9 sites in the exit report, no output difference. Clean rooms: both green; 2 guesses fixed in `99ed9f2`, the convention ones filed as #90. Codex: 4 rounds, round 4 "No findings in the threat model". #81 and #82 closed with findings posted. #83: shown failing twice on a stale record while the base self-healed, by hand, because `red-first.mjs` cannot fit a fix that lives in the test itself; closes on merge. Roadmap current. `npm run gates` exit 0 at `8c0875c`. Red-first lines: `assets.test.js`, `fetch-policy.test.js`, `config.test.js` and `base-branch.test.js` each "failed at main (727870f), 2026-11-13". **Drift:** impact surface moved to public API (`fetch.maxBytes`); proposed bump 2.15.1. Scope check was exit 1 on `CONTRIBUTING.md` and `scripts/base-branch.mjs`, already in an Amendment; the `scope:` line is now widened, exit 0. 0 commits behind `origin/main`. **Eyeball: looked** — the operator, on mobile, read the `maxBytes` GUIDE bullet, the error text and the setting from a file sent to the phone: "Reads right". **Offer:** the Phase 6 exit bar moved to the Sonnet 2.15.0 baseline; operator: keep. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
