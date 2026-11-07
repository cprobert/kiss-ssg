---
branch: feat/kiss-security-and-headers
base: main
status: closed
opened: 2026-11-05
consolidated: 2026-11-07
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

- **2026-11-05 — a light baseline (operator's decision).** "The security vulnerability footprint of a static site is reasonably low. We have to create a balance not to make the security so tight that it becomes unmanageable or too hard to update and use in day to day usage." The engine writes only the set-and-forget headers; no CSP, framing or COOP, so criterion 3's CSP hashes are dropped (`planning/plans/2026-11-05-headers.md`, amendment). Also decided: opt-in, and HSTS without `preload`.
- **2026-11-06 — HSTS without `includeSubDomains` too (Claude).** Finding 2 says to add it only once every subdomain serves HTTPS; by default it would lock visitors out of a subdomain on plain HTTP for two years.
- **2026-11-06 — the plugin README was already behind `main`** (eleven skills, no `kiss-legal-and-privacy` row); fixed while adding `kiss-security`.
- **2026-11-06 — release as 2.13.1, not 2.14.0 (operator's decision).** "2.13 is all about security. So I'd like to keep it in the 2.13x space." The new `securityHeaders` key would normally be a minor bump; it is opt-in and off by default, so nothing changes for a site that does not set it.
- **2026-11-06 — turning headers off takes them back, cache headers too (operator agreed: "Let's do it").** Codex's adversarial review: under `cleanBuild: false`, a security block from an earlier build stayed live after the option was turned off. `retireHeaders` fixes it for both blocks; the cache headers had the same gap on `main` when nothing was hashed.
- **2026-11-06 — warn, don't delete (operator's decision).** Codex's adversarial review of the whole branch: several `Kiss` instances can share one kept folder, so the clean-up could delete another instance's headers. `staleHeaders` now names what an earlier build left and the build warns; nothing is deleted. Also from that review: `Permissions-Policy` blocks location, camera and microphone, so `kiss-security` and `GUIDE.md` now say to check for them first.
- **2026-11-06 — the third Codex round.** The cache writer replaced a `_headers` it did not own this build, which could drop another instance's security block: it now merges into whatever is there. And on Firebase the `Permissions-Policy` override goes in `firebase.json`, not `_headers`.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-06 — pulse 1, slices done.** Criterion 1: the research completed (24 claims confirmed, 1 refuted, 13 findings) and is recorded (`1c08310`). Criterion 2: `kiss-security` written from it, called by `kiss-site-new` and `kiss-site-review` (`0c0f53d`). Criterion 3, narrowed by amendment: `securityHeaders` in `lib/security-headers.js`, beside the cache headers, 11 unit and 2 integration tests, two seen red (`eae7372`, `01e997b`), GUIDE, AIKB, types and `llms.txt` (`8b70bf9`). Criterion 4: `llms.txt` 15,997. Criterion 5: `npm run gates` green; the Codex review is running. Criterion 6: not yet — the operator's read of `kiss-security` and a try on one example. One slip caught by the gates: Python edits had written `llms.txt` with CRLF endings, which broke a test's heading match. Decision: **continue** to the Codex review, then the operator's read. — Claude.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-06: kiss-security, and opt-in security headers

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.13.1. The research recorded (`1c08310`); the `kiss-security` domain skill (`0c0f53d`), called by `kiss-site-new` and `kiss-site-review`; `securityHeaders: true` in `lib/security-headers.js`, four set-and-forget headers beside the cache headers (`eae7372`, `01e997b`, `d331012`); a warning, never a deletion, for header output an earlier build left in a kept folder (`12d85ec`); the cache writer merging into any `_headers` (`2d8b02f`); docs and version (`28522b3`, `4a5d2e2`).

## Reflect — what the session was

Between planned and emergent, as the intent said. The research and the skill went to plan. The engine moved twice. First, the operator narrowed it before code: "the security vulnerability footprint of a static site is reasonably low … not to make the security so tight that it becomes unmanageable", which dropped the hash-based CSP that criterion 3 was built around. Then three Codex rounds reshaped the clean-up behaviour, from "keep the stale block" to "delete it" to "warn, don't delete". The shape served the work: the narrowing came before the code, so nothing was thrown away, and the clean-up design converged in three small commits rather than a rewrite.

The session also ran across a context compaction and a long gap (the work stalled on a spend limit, then `main` moved to 2.13.0 underneath it), and picked up from the session file rather than from memory.

## Evaluate — how the human supervised the AI

**Problem framing** was the strongest dimension, and it was the operator's. The proportion constraint above is a design decision Claude would not have made: the original intent asked for a CSP generated from inline script hashes, a real feature with real upkeep. The operator's one paragraph turned a security feature into a maintainable one. The version call ("2.13 is all about security. So id like to keep it in the 2.13x space") was the same kind of judgment, and it is recorded with its reason.

**Harness leverage** was strong and operator-driven. The operator asked for an adversarial Codex review on top of the standard one, and then, at the point of wanting to ship ("I just want to get this final kiss branch up and out"), asked for a good Codex review first rather than skipping it. That paid off three times: the stale block under `cleanBuild: false`, the shared-folder deletion that Claude's own fix introduced, and the cache writer wiping another instance's security block. None of these were caught by the gates or by Claude's self-review; two of them were in Claude's fixes to earlier findings.

**Pushback & steering** showed at the design fork: offered "warn, don't delete" against "delete security only" and "revert", the operator chose the option that trades automation for safety, in line with the proportion constraint. Claude's first fix (`3719f3f`, delete the stale block) was the over-automated answer; the adversarial review and the operator's choice corrected it.

**Verification & ownership:** the operator confirmed at the close that they looked at `kiss-security` and the headers ("Looked — fine"). Claude's own verification was test-first throughout (each fix's tests seen red), and every round ended with the gates. One miss on Claude's side: a `/code-review` the operator typed ran in the internal-medicine checkout, not kiss-ssg, for the second time in this session.

**Iteration discipline** was good but uneven: one pulse, mid-branch, then the close. The three Codex rounds acted as the later checkpoints.

**Competency level: Agentic engineering lead.** The operator designed and used a reproducible loop (`/branch-open`, a pulse, independent review by a second model, standard and adversarial, repeated until clean), set the constraint that shaped the design, made the trade-off calls, and held the release until the review approved.

## Feedback — recommendations for next session

- **Claude — prefer the non-destructive fix first.** `3719f3f` deleted files to fix a stale-output gap; the adversarial review showed kiss cannot tell its own old output from another instance's. In a folder kiss does not own outright, warn and let the owner act. Ask "whose else could this be?" before deleting anything in a build folder.
- **Claude — when fixing a review finding, look for the same pattern next door.** The cache writer's "replace when not asset-owned" was the same bug as the security clean-up, and it took a third Codex round to find it.
- **Claude — use the Edit tool for any JS or Markdown text with escapes.** Python heredocs turned `\n` into real newlines twice in this session, and once wrote CRLF into `llms.txt` earlier on the branch. The gates caught all three, but each cost a round.
- **Operator — run `/code-review` from the repository you want reviewed.** It reviews the session's working folder; opened from internal-medicine, it reviewed internal-medicine's `main` twice. Open the session in `C:\code\kiss-ssg`, or ask Claude to run the review there.
- **Process — `/secrets-scan` should diff against `origin/<base>`, not the local base.** The local `main` was 7 commits behind, so the first secrets-scan diff listed other branches' `lib/` files. `/branch-close` Step 1's freshness count already uses `origin/`; the scans do not.

## Verdict — did we achieve the objective?

The brief: finish the security half of the privacy-and-security work — record the research, write `kiss-security`, and have the engine write a host's headers file. **Met, with the objective narrowed on purpose** (good drift, recorded as amendments): a light, opt-in baseline instead of a generated CSP.

- [x] The research resumed and recorded, every verified claim with source and vote, the unverified named (`1c08310`; "Not yet researched" in the skill).
- [x] `kiss-security` to the domain-skill contract, every rule traced to a finding, called by `kiss-site-new` and `kiss-site-review` (`0c0f53d`; the Permissions-Policy check added from Codex, `12d85ec`, `2d8b02f`).
- [x] The engine writes the headers: a portable list (`security-headers.json`) and each host's encoding, never a deploy manifest; the CSP hashes dropped by amendment. Design note first (`7927d71`), tests red first, GUIDE, `llms.txt`, README, types and AIKB in the same changes.
- [x] `llms.txt` names `kiss-security` within its cap (15,997); the READMEs and plugin descriptions list it.
- [x] `npm run gates` green; Codex reviews of the `lib/` change — standard and adversarial over the whole branch, the last approving with no findings, and the two closing commits reviewed separately.
- [x] The operator read `kiss-security` and the headers before the close ("Looked — fine").

**Impact:** a kiss site gets HSTS, nosniff, a referrer policy and a permissions policy with one config line, without a policy it has to maintain; the stronger options are documented with their costs. **Open:** the topics the research never verified (form spam and CAPTCHA, embeds, supply chain, `security.txt`, `noopener`), and `kiss-site-deploy`.
