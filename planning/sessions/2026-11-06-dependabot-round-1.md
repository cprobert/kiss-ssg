---
branch: chore/dependabot-round-1
base: main
status: closed
opened: 2026-11-06
consolidated: 2026-11-06
---

# Session — 2026-11-06: Dependabot's first round, and Node 22.23.4

## Intent (captured at /branch-open)

**Objective:** Take the first weekly round of Dependabot PRs (#60–#70) in one branch, and raise kiss's Node floor to 22.23.4 (the current Node 22 LTS, a security release) so chokidar 6 can be taken. Shipped as 2.13.0 with an upgrade note.

**Success criteria:**

- [ ] `engines.node` is `>=22.23.4` and `.nvmrc` is `22.23.4`. Every place that states the floor (21 files matched `22.12|22.13|>=22|≥22` at the open; `planning/` and `CHANGELOG.md` history excepted) says the new one, or is history.
- [ ] chokidar 6: its breaking changes are read against `lib/watcher.js` before the bump, and the result is stated. A `--dev` round trip (edit a page, see it rebuild) is seen to work on one example.
- [ ] htmlparser2 12: its breaking changes are read against the three `Parser` users (`lib/consent-gate.js`, `lib/html-split.js`, `lib/packages.js`) before the bump.
- [ ] The minor/patch group (#66: sass, eslint, prettier, fs-extra, globals, playwright-core, postcss, vitest) is taken, and the four Actions majors (#62–#65) after their release notes are checked against `ci.yml` and `static.yml`.
- [ ] `dependabot.yml` ignores `@types/node` majors (types stay on the Node floor's line), and #70 is closed by that decision.
- [ ] The docs site and all 14 examples build byte-identical before and after, or each difference is explained (sass and htmlparser2 can change output).
- [ ] **Fleet check:** one real site under `C:\Code\kiss` builds on this engine with `kiss-ssg check`, diffed against its last record. Carried from the 2.12.3 reflection: the repo's own builds resolve kiss from the working tree.
- [ ] `npm run gates` pass. 2.13.0, with a `### Upgrading` note naming the Node floor.
- [ ] After merge: the Dependabot PRs are closed (by Dependabot, or by hand with the reason), and the security alerts are 0 open.

**Non-goals / out of scope:** Any code change beyond what a bump forces, and other Node 22 → 24 work.

**Impact surface:** public API. `engines.node` is part of the API, so this is a minor (CLAUDE.md § Git workflow).

**Expected shape:** planned. The two majors (chokidar, htmlparser2) are the unknowns.

**Delegation convention:** none: one session.

### Amendments

## Pulse log

- **2026-11-06** — Criteria 1–4, 6 and 7 met. The floor is `>=22.23.4` with `.nvmrc` 22.23.4, and a grep for 22.12/22.13 finds only Node facts. chokidar 6 and htmlparser2 12 were read against their users. Example 5's `--dev` round trip took 112/113 ms. The docs site and 14 examples are byte-identical except the floor text on 4 pages (example 9's knowledge base re-recorded). Fleet: pro-plumbing from packed tarballs of `main` and the branch, 7 pages and 0 changed. Gates green on `6197550`. Criterion 5 partial: the ignore rule is in, #70 still open. Criterion 8: 2.13.0 waits for the close. Criterion 9: open alerts are already 0 (`gh api`), and Dependabot replaced #66 with #72, the same group. No drift: the surface is the public API, as declared. **Eyeball: looked**: the operator ran example 5 under `--dev`, edited `brew-guide.hbs`, and the page reloaded by itself (chokidar 6 through to the browser); the edit was undone and `git status` is clean. Offer: the floor exactly `>=22.23.4` rather than chokidar's 22.22, given npm only warns on `engines`, **kept**. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-06: Dependabot's first round, and Node 22.23.4

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.13.0. `6197550` raises the Node floor to 22.23.4 and takes chokidar 6, htmlparser2 12, the minor/patch group and four Actions majors, with an `@types/node` ignore rule. `a284e3b` is the docs sweep (the htmlparser2 re-check, the design note), and `4e8edfb` the bump and changelog.

## Reflect — what the session was

**Planned**, and it held. The operator's "shall we address the latest from dependabot?" became a triage of 11 PRs with two decisions put to them. chokidar 6's Node 22.22 requirement met kiss's 22.12 floor, and `@types/node` 26 described a Node newer than the floor. The operator answered the first with something better than either option offered ("v22.23.4 is LTS. Move to that"), which turned a hold into a minor. From then on the route was the one the intent wrote: read each major's notes against its users, bump, byte-compare, fleet check, look.

## Evaluate — how the human supervised the AI

**Pushback & steering** discriminated. The floor answer overrode Claude's recommended "hold" with a reason, the LTS security release, and named a version Claude then measured (it exists, LTS "Jod", security, 2026-10-20) before writing it into 21 files. At the pulse the operator kept the literal `>=22.23.4` after the cost was put plainly: npm only warns on `engines`, so the floor is advice rather than a lock.

**Verification & ownership** was stronger than on 2.12.3, because the last reflection's top recommendation was acted on. The fleet check ran, and ran the right way: pro-plumbing cloned into the scratchpad and built from packed tarballs of `main` and of the branch, so it tested what npm installs rather than the working tree. Result: 7 pages, 0 changed. The operator ran the live reload themselves and saw the page reload, the one part of chokidar 6 no file comparison reaches. Claude's own checks were measured too. The byte-compare showed only the floor text on 4 pages. The documented htmlparser2 re-check in `AIKB/upstream.md` was run rather than assumed: one gap closed upstream, three remain, so the guard stays.

**Where it slipped (Claude):**

- The `npm run dev` started at 09:39 for the previous branch's screenshots survived `TaskStop`. It ended the npm wrapper, not its `node docs --dev` child, which held ports 3001 and 35729 for about an hour, unknown to anyone, until the port check before the `--dev` round trip found it. The permission check rightly refused Claude killing a process by PID, and the operator's two `!` attempts did not take; their output never reached the session, so why is unknown. The process was gone by the pulse, and how it ended was not recorded.
- Claude first wrote into `CLAUDE.md` that the repo "is developed on the oldest Node". This machine runs 24.14; only CI's `setup-node` reads `.nvmrc`. Corrected before commit.
- The first tarball pack overwrote itself (same file name), and the first report reader assumed a bare array. Both were caught by reading the output.

**Competency level: Active supervisor.** The operator steered the one decision with real consequences to a better answer than offered, kept a trade-off knowingly, and checked the behaviour only a person could see. As before, no diff was read by a person.

## Feedback — recommendations for next session

- **Claude — after `TaskStop` on an `npm run …` background task, check the port or the process, not the task.** On Windows, stopping npm leaves its node child running. Run the port check (`Get-NetTCPConnection -LocalPort …`) right after the stop, and say it in the same turn if anything is still listening. Better: start the server with `node docs --dev` directly rather than through npm, so the task is the server.
- **Claude — a sentence about where code runs is a claim like any other.** "Developed on the oldest Node" was false on this machine. Check `node --version` and the CI config before writing what `.nvmrc` does.
- **Operator — publish.** npm's latest is 2.12.0, so neither 2.12.3's handlebars fix nor this release has reached a site. The changelog's upgrade notes do nothing until `npm publish` runs.
- **Process — keep the fleet check shaped as it ran here.** A scratchpad clone plus packed tarballs of base and branch, compared with `diffReports`. It touches no real site, tests the npm install path, and took a few minutes. It deserves a `scripts/` command if it is asked for again.
- **Both — re-run an `AIKB/upstream.md` re-check whenever its upstream bumps a major.** The htmlparser2 entry's recipe told us in a minute which gaps had closed. The chokidar entry's says chokidar 6 claims a fix, and it waits for a Linux run.

## Verdict — did we achieve the objective?

The brief: take Dependabot's first round in one branch, and raise the Node floor to 22.23.4 so chokidar 6 can be taken, as 2.13.0. **Met.**

- [x] Floor `>=22.23.4` and `.nvmrc` 22.23.4, with every statement updated. A grep finds only facts about Node itself.
- [x] chokidar 6 checked against `lib/watcher.js`. The `--dev` round trip took 112/113 ms, and the operator saw the browser reload.
- [x] htmlparser2 12 checked against its three users. The byte-compare is identical (example 12 included), and the upstream re-check was run.
- [x] Minor/patch group and four Actions majors taken after their notes were read.
- [x] `@types/node` majors ignored in `dependabot.yml`. #70 still has to be closed after the merge.
- [x] Byte-identical except the floor text on 4 pages, with example 9's recorded hashes re-recorded.
- [x] Fleet check: pro-plumbing from packed tarballs, 7 pages and 0 changed, 40 audit findings, 0 broken links on both.
- [x] Gates green; 2.13.0 with `### Upgrading` (update Node first, including the host's pinned version).
- [ ] After merge: Dependabot PRs closed and alerts 0. Alerts were already 0 at the pulse, and the PRs close with the lockfile.

**Measurable impact:** 0 open Dependabot alerts (`gh api`, at the pulse), and every update Dependabot proposed in its first round is taken, or declined by decision (`@types/node` 26). The floor is a supported, patched Node 22. **Still open:** publishing 2.12.3/2.13.0, closing #70, and chokidar 6's deleted-root claim on Linux.
