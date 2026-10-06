---
branch: chore/llms-index
base: main
status: open
opened: 2026-10-06
---

# Session — 2026-10-06: llms.txt back to an index

## Intent (captured at /branch-open)

**Objective:** Cut `llms.txt` from 130k characters to an index under 16k, so the `@node_modules/kiss-ssg/llms.txt` import that `kiss-ssg init` writes into every site's `CLAUDE.md` stops filling most of Claude Code's 150k instruction-file budget. The detail moves to `GUIDE.md` and the skills, and a test stops the file growing back.

Prompted by a consuming site's warning: "3 instruction files add up to 251.2k chars, over the 150.0k-char total limit · largest: node_modules\kiss-ssg\llms.txt (129.4k)". The file grew from 5.7k (2026-09-02) to 44k (09-08), 97k (09-16) and 130k (10-06, measured with `git show … | wc -c`). It grew because every public API change adds a passage and nothing ever takes one out.

**Success criteria:**

- [ ] `llms.txt` is ≤ 16,000 characters, and a test in `npm test` fails when it exceeds that — seen red against today's file before the pruning lands.
- [ ] Nothing an agent needs is lost, only moved: every section cut from `llms.txt` either has a home in `GUIDE.md` or a shipped skill (`kiss-build-check` for report reading, `kiss-site-migrate` for v1), or is named here as deliberately dropped. `llms.txt` links to those homes.
- [ ] `llms.txt` follows the llmstxt.org shape: H1, a summary blockquote, then sections that are short indexes or lists of links, not reference prose.
- [ ] The tests that pinned passages in `llms.txt` (`skill-coverage.test.js` rows, `CONTRADICTIONS`, the "names every skill" check, and the others found by grepping `test/`) are repointed to where the passage now lives, not deleted. A row that guarded against a stale sentence still guards against it.
- [ ] The CLAUDE.md rule "Public API changes: update `llms.txt`" now says the index line goes in `llms.txt` and the detail goes in `GUIDE.md`, so the rule stops refilling the file.
- [ ] **Clean-room run:** a fresh sub-agent given only the packed tarball starts in an empty folder and builds a site that passes `kiss-ssg check`, reporting every place it had to guess. Run it against the slim `llms.txt` and compare its guesses with the 2026-09-27 run's findings.
- [ ] **Fleet unchanged:** the sites under `C:\Code\kiss` build identically on `main` and on the branch (expected trivially, since no build code changes; checked anyway).
- [ ] `npm run gates` passes.

**Non-goals / out of scope:** Changing what `kiss-ssg init` writes (the `@` import stays: a slim index loaded every session is the point). Pruning `GUIDE.md` or this repo's `CLAUDE.md`. Any change to `lib/` behaviour. The consuming site's own 116.6k `CLAUDE.md` belongs to that site, not this branch.

**Impact surface:** tooling & docs (shipped): `llms.txt` is in the tarball and read by every consuming agent, but no API or config changes and no site has to adapt. A patch bump is proposed; the operator decides at close.

**Expected shape:** planned. The sections and their homes are mapped (see the branch-open conversation). The judgement is in what each index line keeps.

**Delegation convention:** the main session does the pruning itself, because the judgement is in the cutting. Sub-agents only for the clean-room run and an adversarial read of the slim file. Agents never commit.

### Amendments

## Pulse log

- **2026-10-06** — criteria 1, 3, 4, 5, 8 met (`llms.txt` 12,734 chars, cap test seen red at 129,371; gates green at `352fc28`); 2 partial (the audit's gaps moved into `GUIDE.md`, four minor items left unmoved pending the operator, and the moved text not yet re-checked); 6 (clean-room) and 7 (fleet) not yet. No drift: docs, tests and skills only, inside "shipped docs". **Eyeball: deferred** — reading the new `llms.txt`, especially "Traps nothing reports", is carried to `/branch-close` Step 5a. Explanation offered: "Building a site well" and the tiers sit as `####` under § The build script, after the config table, to avoid a new docs-site page. Decision: continue — clean-room run next, which doubles as the independent check on criterion 2.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
