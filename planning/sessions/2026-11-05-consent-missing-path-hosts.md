---
branch: fix/consent-missing-path-hosts
base: main
status: closed
opened: 2026-11-05
consolidated: 2026-11-06
---

# Session — 2026-11-05: consent-missing misses path-qualified tracker hosts

## Intent (captured at /branch-open)

**Objective:** Make the audit's `consent-missing` finding fire for a Google Maps frame (and any other host entry that names a path) on a site without `config.consent`, because today `lib/audit.js` matches `TRACKER_ORIGINS` against each fetch's origin alone, so the `www.google.com` + `/maps` entry can never match.

**Found:** on a1k9training's deploy-preview-57 (kiss-ssg 2.12.0). `/contact/` loads two Google Maps iframes on page load, the build's `thirdParty` report lists the `www.google.com` iframe, and the audit reports no findings. Measured here: `matchesHost('https://www.google.com', TRACKER_ORIGINS)` is `false`, and the same call with `https://www.google.com/maps/embed?pb=x` is `true`.

**Success criteria:**

- [ ] A unit test builds a page with a raw `https://www.google.com/maps/embed?…` iframe and no `config.consent`, and expects `consent-missing`. It is seen red against the unfixed code first.
- [ ] The fix carries the URL (or its path) through to the match, so every path-qualified entry in `TRACKER_ORIGINS` (and any other host list matched the same way) works. A sibling sweep lists every caller of `matchesHost` and each one is either fixed or shown to receive full URLs.
- [ ] A page with a `www.google.com` frame that is not under `/maps` still raises nothing, and a `{{embed 'google-maps'}}` facade still raises nothing.
- [ ] a1k9training's build, checked against this working tree, reports `consent-missing` on `/contact/` and nowhere else.
- [ ] `AIKB/audit.md` (and `AIKB/consent.md` if it describes the matching) says what is matched. `CHANGELOG.md` has a patch entry whose note tells a site with a raw map frame what it will now see and that `{{embed 'google-maps'}}` is the fix.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:** changing a1k9training (its contact page moves to `{{embed 'google-maps'}}` in its own branch); the `{{embed}}` poster, wording and autoplay idea (`planning/ideas/2026-11-05-embed-poster-and-autoplay.md`); adding hosts to `TRACKER_ORIGINS`.

**Impact surface:** engine internals — `lib/audit.js` (and perhaps `lib/consent.js`) with the API unchanged, but a site can see a new finding, so it is a patch with an upgrade note.

**Expected shape:** planned — the defect is measured and the fix is small; the one open question is how many siblings the sweep finds.

### Amendments

## Pulse log

- **2026-11-05** — Criteria 1–4 and 6 met. Criterion 1: the new test was red first and is green now (`audit-consent.test.js` + `audit.test.js`, 169 passed). Criterion 2: the sweep found two `matchesHost` callers; the tracker one is fixed, and the ads one strips paths on purpose and is unchanged. Criterion 3: the reCAPTCHA and `{{embed 'google-maps'}}` cases are quiet. Criterion 4: a1k9training `master` (PR #57 now merged, no `audit.ignore`), `check --summary` with `node_modules/kiss-ssg` junctioned to this tree, gives "20 pages, 0 failed … audit consent-missing: 1 page (./docs/contact/index.html)"; the site's tree is clean before and after. Criterion 6: gates passed at `1021aa6`. Criterion 5 is partial: `AIKB/audit.md` is done, and the CHANGELOG entry comes with the bump at close. No drift: the optional `tracker` field appears in `types/audit.d.ts`, which is additive. **Eyeball: not looked by the operator.** Asked to look, the operator asked Claude to run it; Claude ran the site's check above. That is Claude's evidence, not a human look. **Offer:** the `tracker: true` flag on origin entries, rather than full URLs in the facts. Answer: keep. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-11-05: consent-missing misses path-qualified tracker hosts

**What we shipped:** `1021aa6` (`lib/audit.js` decides `tracker: true` per origin entry at extraction, from the whole URL, and `checkConsent` reads the flag; a red-first test in `test/unit/audit-consent.test.js`; `AIKB/audit.md`; `types/audit.d.ts`), `6c21384` (2.12.1, CHANGELOG entry with an upgrade note). A raw Google Maps frame on a site without `config.consent` now raises `consent-missing`, as `GUIDE.md` already claimed it did.

**Supervision:** Planned, small, and found in the field rather than in the repo. The defect came out of the operator's request to verify a1k9training's deploy preview of 2.12.0, followed by the question "Any changes needed to the engine based on your assessment?". That question turned an observation in a site report (the `thirdParty` report listed a `www.google.com` iframe and the audit was silent) into an engine fix. The operator authorised the branch ("Yes open up a new branch to patch this"), which is the rule held: no branch on Claude's initiative. Before closing, the operator also asked for diligence on the cache headers they did not fully follow ("I need your diligence … then explain it to me in simple language"). That is good **Learning engagement**: they asked for an explanation rather than accepting a summary. The weak spot is **Verification & ownership**. At the pulse the operator asked Claude to run the eyeball ("Will you do that for me please?"), so the only look at the real site's result is Claude's own: a1k9training `master` junctioned to this tree, `consent-missing` on `/contact/` only. It is honest evidence and is logged as Claude's, not a human look. The pulse's offer (a `tracker: true` flag rather than full URLs in the facts) was answered: keep. **Iteration discipline** was right for the size: red-first test, one pulse with a real-site check, gates, then a Codex review of the whole branch, which found nothing. Competency level: **Active supervisor**. The framing question and the explicit branch authorisation were the operator's. The one checkpoint meant for the operator's own eyes was handed back to Claude.

**Feedback for next time:**

- **Operator — when the eyeball is a terminal line, read that line yourself.** Here it was one command's output (`check --summary` from a1k9training). Pasting the command and reading the single `audit consent-missing: 1 page` line costs less than delegating it, and it turns Claude's evidence into a human check.
- **Claude — when a guide sentence lists what a check covers, test one item from the list against the engine.** `GUIDE.md:1531` named Google Maps under `consent-missing` from the day the preset shipped, and nothing tested that a raw Maps frame fires. A sentence about behaviour is a claim (CLAUDE.md § Rules). The class here is "a list in the guide with no test per item", and the consent list deserves a sweep the next time that area is open.
- **Process — a deploy-preview verification is a good place to find engine bugs; keep asking the follow-up.** The operator's "any changes needed to the engine?" is what turned a site report into a fix. Without it, the finding would have stayed a line in a1k9training's preview notes.

**Did we achieve the objective?** Met.

- [x] Red-first unit test: a raw `/maps/embed` iframe with no `config.consent` expects `consent-missing`, red before `1021aa6`, green after (pulse log).
- [x] The fix carries the whole URL to the match; the sweep found two `matchesHost` callers: the tracker one fixed, and the ads one host-only on purpose (documented in `AIKB/audit.md`).
- [x] A non-Maps `www.google.com` frame (reCAPTCHA) and a `{{embed 'google-maps'}}` facade stay quiet (same test).
- [x] a1k9training checked against this tree: `consent-missing` on `./docs/contact/index.html` only. Claude ran it at the operator's request.
- [x] `AIKB/audit.md` says what is matched; `CHANGELOG.md` 2.12.1 has an upgrade note naming `{{embed 'google-maps'}}` as the fix.
- [x] `npm run gates` passed at close (test, lint, typecheck, format, pack — 411 files). Codex review over `main...HEAD`: no findings.

Open: a1k9training's contact maps move to `{{embed 'google-maps'}}` on its own branch once 2.12.1 is published, and the npm publish is the operator's.
