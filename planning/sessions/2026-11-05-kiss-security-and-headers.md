---
branch: feat/kiss-security-and-headers
base: main
status: open
opened: 2026-11-05
---

# Session — 2026-11-05: kiss-security, and kiss writes the host's headers file

## Intent (captured at /branch-open)

**Objective:** Finish the security half of the privacy-and-security work: complete and record its research, add a `kiss-security` domain skill written from it, and have the engine write a host's response-headers file — with a hash-based Content-Security-Policy worked out from the inline scripts the build actually wrote — the way it already writes each host's redirects file.

**Background.** `feat/branch-merged-and-privacy` (merged in #47) built the branch skills; the privacy half became `kiss-legal-and-privacy` and the consent manager (2.10–2.11). The security half stopped when the research's verification hit the spend limit: `planning/specs/2026-10-30-privacy-and-security-research.md` holds 9 verified security findings, a later run verified 16, and the host header syntax and Subresource Integrity claims were never verified. On `main` today no skill mentions HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` or `security.txt` (grep, 2026-11-05). A static site cannot keep a hash-based CSP right by hand — every inline script edit changes a hash — which is why the engine should compute it.

**Operator's decision:** items 1–4 as offered: (1) record the verified security claims; (2) `kiss-security`; (3) the engine writes the headers file; (4) verify the remaining claims.

**Success criteria:**

- [ ] The research run is resumed and the report updated: every verified security claim recorded with source and vote; what is still unverified named as such.
- [ ] `plugins/kiss-ssg/skills/kiss-security/SKILL.md` to the domain-skill contract (build and review modes, the review protocol and browser pass, a kiss section pointing at `GUIDE.md`), every rule traceable to a verified finding; called by `kiss-site-new` and `kiss-site-review`; one owner for any security text now elsewhere.
- [ ] The engine writes headers the way it writes redirects: one portable record (`headers.json`) and, per `format`, the host's encoding — `_headers` for Netlify and Cloudflare Pages, a fragment for `firebase.json` and `vercel.json` to merge, never overwriting a deploy manifest — with a Content-Security-Policy whose `script-src` carries the SHA-256 hash of every inline script the build wrote. A design note (`planning/plans/`) critiqued before code; tests seen red first; `GUIDE.md`, one `llms.txt` index line, `README.md`, `types/` and the `AIKB/` note in the same change.
- [ ] `llms.txt` names `kiss-security` within its cap; the READMEs and plugin description list it.
- [ ] `npm run gates` green; a Codex review of the `lib/` change (the default when `lib/` changes).
- [ ] The operator reads `kiss-security` and tries the headers on one example before the close.

**Non-goals / out of scope:** writing headers for GitHub Pages (it cannot set them; the skill covers the `<meta>` CSP fallback); a nonce-based CSP (static pages use hashes); `kiss-site-deploy`; changes to the consent manager.

**Impact surface:** public API — a new build method and config key, and a new file in the build. Minor bump.

**Expected shape:** between — the research and skill are planned; the engine design is known in outline (mirror `lib/redirects.js`) and will be settled in the design note.

**Delegation convention:** this session briefs, implements and reviews; a fresh agent critiques the design note; Codex reviews the `lib/` change. Agents never commit.

**Contract:** `planning/plans/2026-11-05-headers.md` (written before the engine work).

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
