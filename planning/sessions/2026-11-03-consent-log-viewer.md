---
branch: feat/consent-log-viewer
base: main
status: open
opened: 2026-11-03
---

# Session — 2026-11-03: Consent log and history viewer

## Intent (captured at /branch-open)

**Objective:** Give a visitor a dated, browser-kept history of their consent choices and a page
to see it on, and get the kiss side ready for a kiss-consent server: record format 2, the banner
registry file, and the client split into an inline part and a cached file. Also fix the sub-folder
URL defect that `ui.history` builds on.

**Success criteria:**

- [ ] `kiss_consent_log`: every Accept all / Reject all / Save / Always allow appends one format-2
      record (`format`, `action`) before the POST and before a withdrawal's reload. Close and page
      loads never append. It works with no endpoint, is capped at 50, survives a withdrawal whose
      service pattern matches it (D8), and degrades as D10 says. Shown in Chromium.
- [ ] The `id` is always made and logged (D1); the client config carries category and service
      labels (D2).
- [ ] `{{consentRecord}}` renders, at build time, the heading, the "what we keep" statement, an
      empty state and a no-JS note (D4). Its own script runs on that page alone (D3). Rows are
      newest first, with locale date and time to the second plus `<time datetime>` (D6), and
      version changes are marked (D7). No delete control (D9). Wording in `ui.text` (D5). The
      Markdown copy drops the controls.
- [ ] `ui.history` puts the history link in the dialog footer; an id no page claims fails the
      build (D12). `kiss_consent_log` is in the cookie table (D11).
- [ ] The build writes `consent-banners.json`: each `bannerHash` with its plain text and its
      categories' key, label, description and mode.
- [ ] The client is split: a small inline part (Consent Mode default and update, the
      stored-choice read, a `kissConsent` stub) and a cached, deferred, hashed file. The inline
      size is measured and has a ceiling with stated headroom.
- [ ] The round-8 P2 is fixed: under `siteUrl: 'https://example.com/site/'` the policy link, the
      logo, the history link and the cached client URL all carry `/site/`. Reproduced red first.
- [ ] Public-API obligations in the same commits: `GUIDE.md`, one `llms.txt` line each,
      `README.md`, `types/`, the domain and task skills that would use it, and `skill-coverage`
      rows. `planning/specs/2026-11-03-kiss-consent.md` is amended to say what was built.
- [ ] Clean room: a fresh agent given only the packed tarball adds a consent history page to a
      starter site, `kiss-ssg check` passes, and it reports every place it had to guess.
- [ ] `npm run gates` passes on the branch.

**Non-goals / out of scope:** the kiss-consent server itself, its admin views and storage;
retention and lawful-basis advice (Q1/Q6 stay open); a floating reopen icon; any change to the
cookie's format.

**Impact surface:** public API — new helper, config keys (`ui.history`, `ui.text`), a new build
output, and the client's shape on every page; a minor (2.12.0) with a `### Upgrading` note.

**Expected shape:** planned — the spec settles D1–D13; the split is the least mapped part.

**Delegation convention:** none: one session.

**Contract:** `planning/specs/2026-11-03-kiss-consent.md` (copied from the published draft 0.5,
D13 agreed at the open), amended in place with dated sections.

**Review stop condition (set at the open):** a Codex loop fixes everything for up to three rounds;
after that only a P1 (consent bypassed, a choice not logged, or a broken page in a setup a site
would use) is fixed here, and the rest is recorded for later.

### Amendments

- **2026-11-03, at the open — scope.** The consent-manager log recorded the inline/cached client
  split as its own piece of work after that branch; the operator put it on this one, with the
  banner registry file and the round-8 P2, knowing it enlarges the PR. Claude flagged the size;
  the operator confirmed the brief as written.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
