---
branch: readme-multica-shape
base: main
status: open
opened: 2026-10-17
---

# Session — 2026-10-17: The README in the multica shape

## Intent (captured at /branch-close — the work ran on `main` and the branch was made at the close)

This branch was not opened with `/branch-open`. The operator pointed at a README they liked (`multica-ai/multica`), asked for its header and badges, then for its order (benefits before setup), and then said "close this branch". The intent below is reconstructed from that conversation at the close, so the ritual has the artefact it reads; it is not an interview's answers.

**Objective:** Make `README.md` work the way multica's does: a centred header with a logo, tagline, badges and a link bar; a problem-and-answer "What is kiss-ssg?"; the benefits sold in imperative sections whose bullets link out, _before_ the setup instructions; a collapsed setup that reads as six lines and a prompt; and a documentation table keyed by intent.

**Success criteria:**

- [x] The header has the logo mark, a bold tagline, CI / npm / stars / Node badges that all resolve, and a link bar.
- [x] Four benefit sections precede `## Quick start`, each with an italic promise line and `**[Thing](link) →** benefit` bullets, every link to a file or GUIDE.md heading that exists.
- [x] The quick-start command blocks and the optional Anthropic-skill blocks are byte-identical to before, so `test/unit/home-quickstart.test.js` and the docs site's home page stay in step.
- [x] The one inbound link into a removed README section (`GUIDE.md` → `#what-you-just-installed`) is repointed to an anchor GitHub generates.
- [x] The Star History chart the operator pasted is removed again at their request.
- [x] `npm test` passes; the page was rendered through GitHub's markdown API in README mode and screenshot in both colour schemes.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- No `lib/` or `bin/` change.
- The docs site's home page is not restyled; it mirrors the quick start through its test and nothing else changed.
- No Discord or community badge: there is no such channel.

**Impact surface:** tooling & docs, patch bump. `README.md` and one link in `GUIDE.md`. No API change.

**Expected shape:** planned. Two passes: the header, then the reorder.

### Amendments

- **2026-10-17 — the branch exists because the operator said "close this branch".** The work was done on `main` uncommitted. A branch was created at the close and the intent written then, which `/branch-close` Step 1 would otherwise refuse. The operator's request is the authorisation.

## Pulse log

- **2026-10-17 (at the close, not a pulse)** — Evidence: `npm test` 86 files / 2282 passed; prettier clean; every cited path and GUIDE.md heading checked on disk; GitHub's renderer produced the `remember-what-it-is` anchor GUIDE.md now links. **Eyeball: looked** — the operator was shown the GitHub-rendered page in dark and light (`header-dark.png`, `header-light.png`, `full-dark.png` in the session scratchpad) and said "Looks great". Decision: ready to close.
