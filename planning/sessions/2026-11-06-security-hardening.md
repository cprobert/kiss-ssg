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
