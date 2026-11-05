---
branch: fix/consent-missing-path-hosts
base: main
status: open
opened: 2026-11-05
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
