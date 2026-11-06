---
branch: fix/security-hardening
base: main
status: open
opened: 2026-11-06
---

# Session — 2026-11-06: Security hardening from the whole-codebase review

## Intent (captured at /branch-open)

**Objective:** Close the four findings of the 2026-11-06 security review — the consent client
loading its script from another origin, `config` in the served debug files, `{{embed … src=}}`
taking any URL scheme, and URL-encoded placeholders in inline scripts — so that nothing kiss emits
into a page or a served file is unchecked.

**Success criteria:**

- [ ] The consent head script never appends a script that resolves to another host: unit rows for
      `/%5Cevil.example/404`, `/%5C%5Cevil.example/404`, `//evil.example/404`,
      `/%09/evil.example/404`, `/%5Cevil.example/404.html` and a root `index.html` at
      `/%5Cevil.example/`, each seen red on the unfixed code.
- [ ] In Chromium, example 14 served with its `404.html` at `/%5Cevil.example/404` makes no request
      off the served origin, and the consent client starts. Seen red first.
- [ ] A benign `/missing/404` still gets a working consent client.
- [ ] The addresses that worked before still work: the existing consent-client tests pass
      unchanged.
- [ ] With a token in `config.fetch.headers`, no file under the build folder holds it — in a dev
      build, and in a non-dev build with `verbose: true` and `.viewStats()` — and the verbose log
      does not print it. Seen red first.
- [ ] `{{embed … src=}}` fails the page for `javascript:`, `data:`, `vbscript:` and their
      whitespace and case variants; an https literal, a root-relative path and a `//host` URL still
      render. A config `embed.src` or `embed.watch` is held to the same rule. Seen red first.
- [ ] A placeholder value cannot leave the string it sits in, in a service's `inline` script;
      `G-ABC123` comes out byte for byte as before. Seen red first.
- [ ] Every `AIKB/` doc of a changed module says what the code now does, and every changed
      `GUIDE.md` snippet has been run.
- [ ] Fleet criterion: `a1k9training`, cloned into the scratchpad and built from packed tarballs of
      `main` and of this branch, gives two `kiss-ssg check` reports that `diffReports` finds equal,
      or every difference is explained.
- [ ] `npm run gates` is green.

**Non-goals / out of scope:** A Content-Security-Policy feature. Checking an embed's origin
against the service's declared `origins`. A `Host` check on the dev server (DNS rebinding was
rated a hardening gap). Removing the model from the debug files. The Contentful token found in
`learna-kiss`, which is noted in that repository. No clean-room criterion: nothing an agent
follows changes shape, three inputs are only refused that were accepted before.

**Impact surface:** public API — a site can observe all four: the head script's behaviour, what
the debug files hold, an embed that now fails the build, and how an inline placeholder is written.
A patch (2.13.1) with an `### Upgrading` note is the proposal for the close.

**Expected shape:** planned — the four fixes and their tests were designed from the review before
the branch opened.

**Delegation convention:** The main session plans, briefs, reviews every diff and runs the gates.
Three Opus sub-agents implement in parallel in this checkout, each inside the files the contract
names, each running only its own test files. Agents never commit. The operator chose three in
parallel over one at a time (2026-11-06).

**Contract:** `planning/plans/2026-11-06-security-hardening.md`

### Amendments

- **2026-11-06 — after the operator's `/code-review` of `afb1da4`.** Six findings, none in the
  origin guard or the embed URL check. The operator decided three:
  - **The inline fill** URL-encodes and then escapes, so a quoted placeholder yields the value it
    did before the branch. The first version wrote the raw value and opened an injection through
    a placeholder inside an HTML or URL string.
  - **The token is stripped at the source:** each page's copy of the config carries
    `fetch.headers` with its values redacted, so `{{{stringify this}}}` and a controller that
    copies `config` cannot write it into a page. The first version covered the two debug files
    and the log only.
  - **Scope grows by one item:** a token in a URL model's query string, recorded by
    `kiss-ssg aikb` and printed in logs. It predates the branch and was outside the plan. The
    operator chose to verify it and, if it is real, fix it here.
  - A Codex adversarial review ran twice. The first approved in 68 seconds having opened three
    files; the second read about twenty and stopped when the workspace ran out of credits, with
    no verdict. The branch's independent review is the `/code-review` above.

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-06** — All three workstreams in; every criterion has evidence. Decision: ready for the
  operator's diff review, then the close.
  - **Consent root.** Measured in Chromium before the fix: each of the five hostile spellings made
    one request, `GET evil.example/kiss-consent.<hash>.js`. After it: none, and a Reject is stored.
    `/missing/404` loads through the fallback. The inline script is 5,698 bytes minified (was
    5,483; ceiling 6,144).
  - **Debug files and log.** A whole-folder walk finds the token in no file, dev or verbose
    non-dev, and in nothing the logger was handed.
  - **Embed and inline.** Two real production builds with the working tree's engine: a hostile
    placeholder value reads back whole from the minified page and runs nothing; a `javascript:`
    `src=` from page data fails the build and writes no page.
  - **Red, re-derived by the main session.** With each fix switched off by a one-line mutation
    (seven in all), 55 of the new tests fail across seven test files; the files were restored
    byte for byte.
  - **Fleet.** `a1k9training` cloned into the scratchpad, built from packed tarballs of `main` and
    of the branch: 20 pages, 0 changed, 0 broken links and 1 audit finding on both.
  - **Gates.** `npm run gates` green after `npm run types`.
  - **Listed, not fixed (below the stop condition, or the operator's call):**
    - `{{markdown model.x}}` passes raw HTML through by default (`markdown.html: true`). By design
      for author-written Markdown; it is the same class for Markdown from a CMS.
    - Every example sets `verbose: true`, and `GUIDE.md` now says to leave it off where the log is
      shared.
    - The verbose log's redaction is written inline in `lib/kiss.js` and is covered by the
      integration test only.
    - Inferred, not measured: the guard on `file://` in a browser, and that a host answering an
      unknown path with 200 and HTML does not fire the fallback.
  - **For the upgrade note, beyond the plan's list:** a placeholder inside a URL inside a string
    in a site's own `inline` (`'https://x/?q={q}'`) was URL-encoded and is now the raw text.
- **2026-11-06, round two** — after the operator's `/code-review` (Amendment above). Decision:
  ready for the operator's diff review, then the close. The last line of the entry above no
  longer holds: the inline fill URL-encodes again, so that upgrade-note item is gone.
  - **Inline fill.** For the `gtag` preset, `G-ABC123`, `AW-123`, `1234567890` and `0.5` are byte
    for byte what `main` writes (compared against `main`'s own `fill`). The review's `innerHTML`
    and URL cases evaluate to what `main` gave; both were red on `afb1da4`.
  - **Token at the source.** A page whose view is `{{{stringify this}}}`, and a controller that
    copies `config` under another name, write no token into any file; a URL model is still
    fetched with the real header.
  - **URL models.** Measured before: `kiss-ssg aikb` wrote a query-string token into three files
    of the committed `AIKB/` folder, and a failed fetch printed it. After, real runs of
    `kiss-ssg aikb`, `check --subjects` under `verbose`, a 404 `check` and a plain build, on a
    scratch site with one token in `fetch.headers` and another in the model URL: 0 hits for
    either across everything written and printed; the built page's `stringify` shows
    `"Authorization": "[redacted]"`.
  - **A sibling the implementer reported, fixed by the main session:** `registerPage`'s
    `No view specified` line logged the options whole. Seen red first.
  - **Red, re-derived by the main session:** round two's fixes switched off by ten one-line
    mutations in two passes: 18 tests fail, then 14; files restored byte for byte each time.
  - **Listed, not fixed:**
    - A failed model fetch is logged and the page skipped, and the report says `ok: true` with
      the page missing (measured by the investigation). Documented behaviour; the operator's
      call.
    - `scrubbed()` in `lib/fetch-policy.js` cleans the fetch's own error messages by text
      replacement, measured against Node v24.14.0's messages only. A network error's message
      gains `: <cause>` and the attached error no longer carries a `cause`.
    - A page's own `config` overrides no longer show in the two debug files.
    - A secret in a URL's path is not caught; the guide says a credential belongs in
      `fetch.headers`.
  - **For the upgrade note:** the list is in the plan's "For the changelog" section, plus: a
    site with a committed `AIKB/` and a URL model with a query string sees its `url:` rows and
    subject ids rewritten on the next `kiss-ssg aikb`; note paths do not move; a token already
    committed stays in git history and must be rotated.
- **2026-11-06, at the close** — the operator's four answers, and what the close measured.
  - **The base moved.** PR #75 merged to `origin/main` as 2.13.1 while this branch was open. A
    dry-run merge was clean; the operator chose to merge `origin/main` in (`2c07d7d`). So the
    version is **2.13.2**, not the 2.13.1 the Intent proposed. Local `main` also held `b2a926f`
    (a memory consolidation, never pushed), which this branch was cut from and carries into the PR.
  - **Eyeball: looked** — "it is right". The operator was shown real output from a scratch site
    built with this branch, a token in `fetch.headers` and another in the model URL's query
    string: the built page's `{{{stringify this}}}` reading `"Authorization": "[redacted]"`, the
    `AIKB/site-map.md` row and a failed fetch's two log lines reading
    `?access_token=[redacted]&type=[redacted]`, and 0 hits for either token. No pulse-time
    eyeball had happened, so this was the close's one ask.
  - **Review.** Codex is out of credits; the operator chose to skip it and to run one round of a
    fresh-context Claude security review over `ca87fcd..7c527a3`, `lib/` only, under the plan's
    threat model. Same model family as the author, so it is not an independent review.
  - **Fleet, on the merged and bumped tree.** `a1k9training` built from the packed 2.13.0 and
    from the packed 2.13.2, one after the other: 472 files each, none differing as bytes. The two
    `kiss-ssg check` reports taken together agree on all 20 page hashes.
  - **Not explained:** the same 2.13.0 tarball gives 20 different page hashes now than it did
    when `base.json` was taken earlier in the day, in the same scratch clone. It is not the
    engine, since one tarball disagrees with itself; the cause was not looked for. Reports are
    comparable only when taken together.
  - **Docs sweep.** The `AIKB/` notes match the code. `docs/` was regenerated for the changed
    `GUIDE.md`. `llms.txt` is unchanged: it is 15,967 of its 16,000 characters, and the rules are
    in `GUIDE.md` and the upgrade note. `/corpse-collector` was skipped: the branch renames and
    removes nothing.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
