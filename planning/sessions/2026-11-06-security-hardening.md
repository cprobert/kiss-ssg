---
branch: fix/security-hardening
base: main
status: closed
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
  - **Not explained:** the same 2.13.0 tarball gives 20 different page hashes at 20:24 than it
    did at 16:55, in the same scratch clone; a report taken at 19:19 still matched 16:55. It is
    not the engine, since one tarball disagrees with itself; the cause was not looked for.
    Reports are comparable only when taken together.
  - **Docs sweep.** The `AIKB/` notes match the code. `docs/` was regenerated for the changed
    `GUIDE.md`. `llms.txt` is unchanged: it is 15,967 of its 16,000 characters, and the rules are
    in `GUIDE.md` and the upgrade note. `/corpse-collector` was skipped: the branch renames and
    removes nothing.
  - **The review's outcome.** Measured by the reviewer, with scripts kept in the scratchpad:
    the inline fill held over 20,313 checks in nine template contexts; no header token and no
    query token reached any file, log line or report in a whole build with twelve failing URL
    models, while the server saw the real header and query on all 56 requests. One finding met
    the bar and was fixed: a header value Node's fetch refuses (a line break or a NUL in it) was
    quoted in Node's error and printed. Re-derived by the main session, then `checkHeaders` in
    `lib/fetch-policy.js`, four tests seen red. Findings below the bar are listed under the
    Verdict.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-06: Security hardening, and the fix that opened a hole

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.13.2. The consent head script loads its client only from the page's own
host (`afb1da4`); a token in `fetch.headers` is redacted in every page's copy of the config, and a
model URL is recorded without its query values (`7c527a3`); `{{embed}}` takes only an http(s)
frame URL; an `inline` placeholder cannot leave its string. Merged with `origin/main` (`2c07d7d`)
and bumped (`57b5dac`). A header value Node's fetch refuses is now refused by name before Node
can quote it (`991ca05`), from the review at the close.

## Reflect — what the session was

Planned, and it stayed planned through one large correction. The session began on `main` as a
whole-codebase `/security-review`: three read-only reviewers, then one checker per candidate.
One finding was a real vulnerability (the consent client loading from another host through a
crafted address on a 404 page) and three were hardening. The operator asked how serious they
were for a tool that runs on a developer's machine, then gave the shape of the work in one
message: plan it, delegate the implementation to Opus agents, and have the main session
orchestrate and quality-assure.

That shape served the work. The contract was written, then critiqued by a fresh agent before any
code, which found two flaws that would have stopped a workstream: the origin guard as first
written could not run in the unit harness, and the browser test would have raced another test
file over example 14's output. Three agents then built in parallel inside named files.

The correction came from outside the plan. The operator ran `/code-review` on the first fix
commit, and it found that one of the four fixes had made things worse.

## Evaluate — how the human supervised the AI

**Verification & ownership** is the dimension that decided this session, and it was the
operator's. Round one's `fillScript` replaced URL-encoding with JavaScript escaping. That removed
a protection every quoted placeholder had relied on: a value written into an HTML or URL string
inside an `inline` script could now carry markup. Three things had passed it. The implementing
agent's tests passed. The main session's quality assurance passed: seven one-line mutations, 55
tests red, a fleet check, green gates. A Codex adversarial review approved it in 68 seconds,
having opened three files. The mutation check proved that the tests would notice the fix being
removed. It said nothing about whether the fix was the right one, and the main session reported
it as if it did. The operator's own `/code-review` found the regression, a false sentence in the
docs, and that `{{{stringify this}}}` still printed the token. None of the six findings was
argued with; all were real or, in one detail, checked and corrected (a failed model fetch does
not reach the report's `failures`).

**Harness leverage** was strong on both sides, and it is why the miss was caught. The operator
reached for three independent checks unprompted: `/codex:adversarial-review`, `/codex:status` and
a follow-up when the first review looked too quick, then `/code-review`. The main session used a
contract critique, parallel implementers, a separate investigator for the one finding that was
outside the plan, and a fresh reviewer for round two at the close.

**Pushback & steering** was light, and worth naming plainly. Every decision reached the operator
as an `AskUserQuestion`, eleven that this log can count (three at the open, one for the Codex
run, three after the code review, four at the close), and every answer was the recommended
option. The one steer that changed the work was the operator's second message, which re-rated
the findings against how kiss is actually used and set the release line ("2.13.x is all about
security"). After that the operator steered through reviewers, not through the options.

**Iteration discipline** was mixed. The work was sliced and checked between slices, but the two
pulse-log entries were written by the main session by hand, without `/branch-pulse`. So the
pulse's eyeball was never asked while the work was warm, and the close asked it: the operator
looked at real output from a scratch site in the question itself. The base was not checked
against `origin` at either pulse, and PR #75 took 2.13.1 while the branch was open, found only
at the close's first step. The merge was clean, which was luck.

**Where the operator meant to supervise, and where they did.** Codex was meant to be the
independent check, and it gave one hollow approval and one run that stopped for lack of credits.
The operator's `/code-review` filled that gap for round one. Round two (`7c527a3`) has been read
by no reviewer outside the author's model family: the close ran one fresh-context Claude review
over it, at the main session's recommendation, and that is one opinion held twice.

That review found the three claims holding under its own tests (a fuzz of the inline fill, and
a whole build with twelve failing URL models) and one thing that met the agreed bar: a
`fetch.headers` value with a line break in it is quoted by Node's own fetch error, and the
failed-model log line printed it. The main session re-ran the reviewer's script, saw the token
in the log, and fixed it in `lib/fetch-policy.js` (`checkHeaders`), four tests red first. That
last fix has been read by no reviewer of any kind.

No fix diff was put in front of the operator between the two rounds, which `CLAUDE.md` asks
for; a command to show the commit was offered at the end of a report, and nothing shows it was
run.

**Competency level: Active supervisor.** The operator framed the work, set the delegation
convention, and verified through independent tools at the right moments, including the one that
mattered. It stops short of the level above on one thing: the decisions themselves were accepted
as recommended every time, so the session's judgement calls were the main session's, checked
after the fact.

## Feedback — recommendations for next session

- **Claude — review a security fix for what it opens, before the commit.** A fix that changes
  how a value is encoded removes whatever the old encoding protected. Before briefing the
  implementer, write down what the old code guaranteed in each context the value can reach, and
  after the diff, give a fresh agent the fix and ask what it made possible that was not before.
  Round one's `fillScript` would have failed that question in one case.
- **Claude — say what a mutation check proves.** "55 tests fail with the fix switched off" is
  evidence the tests cover the change. It is not evidence the change is correct, and the first
  pulse entry let it read as both.
- **Operator — run `/code-review` yourself on the first fix commit of any branch that changes
  `lib/`, as you did here.** It was the only check all session that found the regression. With
  Codex out of credits, consider running it on this pull request before merging, since round two
  has no review from outside the author's model family.
- **Claude — run `/branch-pulse`, never write a pulse entry by hand.** The hand-written entries
  skipped its eyeball step and its drift check, and both landed on the close.
- **Process — a pulse should fetch and count commits behind `origin/<base>`.** The close's first
  step does; a pulse does not. Another session merged a release into the base mid-branch, and a
  version number in this branch's Intent was already taken.
- **Process — a fleet comparison is two builds taken back to back, compared as build folders.**
  The same 2.13.0 tarball gave 20 different page hashes at 20:24 than at 16:55 in the same
  clone, though a report taken at 19:19 still matched 16:55. The cause was not established; a
  guess is that the tarball installs in between changed the clone's other dependencies. Either
  way a report kept from earlier is not a baseline, and `/branch-open`'s fleet criterion should
  say so.
- **Claude — nothing else runs while the gates run.** A fleet check ran beside the first
  round-two gate run and a vitest worker crashed in `test/integration/bench-watch.test.js`
  (Windows exit code 3221226505). The `&&` chain held the commit back. The crash did not recur
  alone; the cause was not established.
- **Claude — a commit title names what was fixed, no wider.** `afb1da4` is titled "Check every
  value kiss writes into a page or a served file", and the code review found two values it did
  not check.
- **Operator — the Contentful token in `learna-kiss`** is the one finding of the review that is
  live outside this repository. The note is uncommitted at
  `C:\Code\kiss\learna-kiss\SECURITY-NOTES.md`; what kind of key it is can only be read in the
  Contentful console.

## Verdict — did we achieve the objective?

The brief: close the four findings of the review, so that nothing kiss emits into a page or a
served file is unchecked. **Met for the four findings, with the scope grown by three items the
code review found** (good drift, each decided by the operator and recorded as an Amendment). The
sentence "nothing kiss emits is unchecked" is wider than what was done, and the list below the
criteria says where.

- [x] The consent head script never appends a script that resolves to another host. Six unit
      rows, red with the guard switched off.
- [x] In Chromium, a 404 page at the hostile address makes no off-host request and the client
      starts. Measured before the fix: one request to the other host for each of five spellings.
      The test lives in `test/browser/consent.test.js`, not in a build of example 14 (contract
      amendment).
- [x] A benign `/missing/404` still gets a working client, through the fallback.
- [x] The existing consent-client tests pass unchanged.
- [x] No file under the build folder holds a `fetch.headers` token, dev or verbose non-dev with
      `.viewStats()`, and the verbose log does not print it. Round two extended this to the
      page's own config copy.
- [x] `{{embed … src=}}` fails the page for `javascript:`, `data:`, `vbscript:` and their
      variants; https, root-relative and `//host` render; `embed.src` and `embed.watch` are held
      to the same rule.
- [x] A placeholder value cannot leave its string, and `G-ABC123` is byte for byte what `main`
      writes. Met by round two; round one's version met the words and opened a different hole.
- [x] Every changed module's `AIKB/` doc says what the code does (re-read at the docs sweep). The
      `GUIDE.md` changes are sentences with two worked values, the `[redacted]` header and the
      redacted URL, and both were measured on a scratch site with the real CLI. No other snippet
      changed.
- [x] Fleet: `a1k9training` from the packed 2.13.0 and the packed 2.13.2, built back to back, 472
      files each, none differing.
- [x] `npm run gates` green on the merged, bumped tree.

**What is better:** a visitor to a site with `config.consent` can no longer be handed another
host's script through a crafted address, once the site is rebuilt on 2.13.2. A token in
`fetch.headers` or in a model URL's query string no longer reaches a page, a debug file, the
committed `AIKB/` folder or the log.

**What is open:**

- npm is on 2.13.0. Neither 2.13.1 nor this release reaches a site until `npm publish`.
- `ca87fcd..7c527a3` has no review from outside the author's model family, and the header
  check added at the close has no review at all.
- Below the review's bar, listed and not fixed: a model written `HTTP://…` in upper case or
  with a leading space is not taken for a URL, is never fetched, and is logged whole by
  `Invalid model` (`lib/model-resolver.js`); a server that echoes the credential in its body or
  its status text has it printed; an unparseable URL with a raw `/` in its `user:pass@` keeps
  it; a secret used as a query parameter's name is shown; `assets.pipeline[].run` is recorded
  as written in the site map, so a token typed into a command would be committed.
- Local `main` holds `b2a926f`, which `origin/main` does not. It rides into this pull request, so
  after a squash merge local `main` will not fast-forward and needs the operator's decision.
- Listed, not fixed: a failed model fetch reports `ok: true` with the page missing;
  `{{markdown}}` passes raw HTML through by default; every example sets `verbose: true`; a
  secret in a URL's path is not caught; `scrubbed()` is text replacement measured on Node
  v24.14.0 only; the guard on `file://` and on a host that answers an unknown path with 200 are
  inferred.
