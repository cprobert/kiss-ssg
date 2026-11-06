# Security hardening (2.13.1) — the contract

Session: `planning/sessions/2026-11-06-security-hardening.md`. Branch: `fix/security-hardening`.

This is the one document the three workstreams build against. It is amended in place, with a
dated section, when the design moves.

## Where this came from

A whole-codebase security review on 2026-11-06: three read-only reviewers, then one independent
checker per candidate finding. Four things came out of it. Line numbers were read on `b2a926f`.

| #   | Finding                                                             | Checker's confidence | Where                                                                         |
| --- | ------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| 1   | The consent head script can load its client from another origin     | 8/10                 | `lib/consent-client.js:311-337`                                               |
| 2   | `config` (with `fetch.headers`) is written into served debug JSON   | 7/10                 | `lib/kiss-page.js:426-436`, `lib/page-registry.js:673-701`, `lib/kiss.js:762` |
| 3   | `{{embed … src=}}` writes any URL scheme into `<iframe src>`        | 5/10                 | `lib/embed.js:254-260`                                                        |
| 4   | A placeholder in a service's `inline` script is URL-encoded, not JS | 2/10                 | `lib/consent.js:1405-1411`, `lib/consent-gate.js:203-205`                     |

No fleet site is exposed to any of them today (a grep of the working trees under `C:\Code\kiss`,
2026-11-06): none sets `config.consent`, none uses `fetch.headers` or `.viewStats()`, none passes
`src=` to `{{embed}}`.

### Measured on 2026-11-06

Live hosts, with `curl`, asking for a path that does not exist:

| Path                 | Netlify (pro-plumbing.trade, a1k9training.co.uk) | Firebase (learna.ac.uk) |
| -------------------- | ------------------------------------------------ | ----------------------- |
| `/%5Cx.example/404`  | 404, HTML, no redirect                           | 404, HTML, no redirect  |
| `//x.example/404`    | 404, HTML, no redirect                           | 307 to `/x.example/404` |
| `/%09/x.example/404` | 404, HTML, no redirect (pro-plumbing only)       | 404, HTML, no redirect  |

So a host answers the hostile path in place. The response bodies were not read, so "the site's own
`404.html`" is inferred from the status and content type. What a browser then does with
`/\host/…` as a script `src` is inferred from the WHATWG URL specification, and workstream A
measures it.

## Threat model

- **Trusted:** the site author. Templates, config, the build script, controllers and helpers are
  the author's own code. Environment variables and command-line flags.
- **Semi-trusted:** model data — JSON fetched from a URL or exported from a CMS, edited by people
  other than the developer.
- **Untrusted:** a visitor's address bar, query, hash, cookies and storage; requests reaching the
  dev server from the network.
- **Out of scope:** denial of service, several sites per script, hostile source files, a hostile
  `node_modules`.

## Workstream A — the consent client's root

**Owns:** `lib/consent-client.js`, `test/unit/consent-client.test.js`,
`test/browser/consent.test.js`, `AIKB/consent-client.md`. May read anything.

**What the code promised.** The comment at `lib/consent-client.js:303-310` says the root is derived
from the address because a page is reached at more than one address, under any prefix, on any
origin, even `file://`. That promise stays. What was never promised, and is the defect, is that
the derived root may name another host.

**The defect.** `at` is `decodeURI(location.pathname)`. The root is everything in front of the
page's own file name, and it is written back as the script's `src`. A decoded string is being
re-read as a URL: `/%5Cevil.example/404` decodes to `/\evil.example/404`, the form `404` matches,
the root is `/\evil.example/`, and a browser reads `/\` as `//`.

**The fix.**

1. **The origin guard.** After the root is derived, resolve both the page's address and the
   script's, and keep the derived root only when they are on the same host:

   ```js
   try {
     var here = new win.URL(win.location.href)
     var to = new win.URL(root + client.name, here)
     if (to.protocol !== here.protocol || to.host !== here.host)
       root = client.root
   } catch {
     root = client.root
   }
   ```

   - It is `win.URL`, as line 1017 of the same file already writes it: the unit harness runs the
     script in a context with no global `URL`.
   - It reads `protocol` and `host` from the parsed `here`, never from `win.location`: the
     harness's `location` has `protocol`, `hostname`, `pathname` and `href`, and no `host`. No
     harness change is needed. Do not compare `hostname`, which lets another port through.
   - It is not `origin`: on `file://` every origin is the string `null`, and two different hosts
     would compare equal.
   - The `catch` covers a base that cannot be resolved against (`about:srcdoc`).
   - The guard is the browser's own URL algorithm, not a list of bad characters, so it covers the
     backslash, the double slash, a stripped tab or newline, and any spelling not thought of yet.

2. **The wrong-but-harmless root.** A benign `/missing/404` derives `/missing/`, the client 404s
   and every consent control on that page is dead. Give the tag an `error` listener
   (`addEventListener`, as lines 726-727 do, so the harness can fire it) that, when the derived
   root was not `client.root`, appends the script once more from `client.root`. Once only. This
   is the functional sibling of the same cause, so it is fixed here. Two limits, to be written
   into the AIKB doc and not engineered around: a host that answers an unknown path with status
   200 and HTML fires `load`, not `error`, so the fallback does not run there; and a 404 page
   still loads the client from whatever same-origin folder its address names when that address
   happens to end in the page's own file name.

**The size ceiling.** `test/unit/consent-client.test.js` holds the inline script to
`INLINE_CEILING` (6,144 at line 253) and says moving it is a decision, not a fix. Report the
minified size before and after. If the change crosses the ceiling, stop and report: do not raise
it.

**Regression tests, each seen red on the unfixed code first:**

- Unit rows beside `test/unit/consent-client.test.js:281-300`, for a `404.html` page at
  `/%5Cevil.example/404`, `/%5C%5Cevil.example/404`, `//evil.example/404`,
  `/%09/evil.example/404` and `/%5Cevil.example/404.html`; and for a root `index.html` at
  `/%5Cevil.example/`. Each asserts the script's resolved URL is on the page's own host.
- A unit row for `/missing/404`: the fallback fires and the second tag is at `client.root`.
- The rows that already pass (`/guide`, `/guide/`, `/guide/index.html`, a prefix, `file://`) must
  still pass untouched.
- **One real-browser test, in `test/browser/consent.test.js`.** That suite already has what the
  test needs: `serve()` builds a temporary site and serves it with `serveFolder` (which answers
  an unknown path with the site's `404.html`), `open()` records every off-host request in
  `offHost`, and there is a 404 fixture near line 863. Add a case that opens
  `/%5Cevil.example/404` on a site whose `404.hbs` carries the consent head, and asserts
  `offHost` is empty and that a Reject click is stored (the client started). Follow the suite's
  own convention when Chromium is missing (`if (!browser && process.env.CI) throw launchError`).
  Run it against the unfixed client first and quote the off-host request it made. Do not build
  `examples/14-consent`: `test/integration/examples.test.js` deletes and rebuilds that folder.

**Docs.** `AIKB/consent-client.md`: the guard, the fallback and its two limits, and why
`protocol` + `host`. Re-measure every byte size that doc states and write the measured numbers.
Its line 95 gives ceilings of 5,376 and 9,728 where the test holds 6,144 and 10,752: correct the
doc to what the test holds.

## Workstream B — config out of the debug files, and out of the log

**Owns:** `lib/kiss-page.js`, `lib/page-registry.js`, `lib/kiss.js` (the `logger.debug('config: ', …)`
line at 762 and the comment near line 344 only), `test/unit/kiss-page.test.js`,
`test/unit/page-registry.test.js`, `test/integration/view-stats.test.js`, `AIKB/kiss-page.md`,
`AIKB/page-registry.md`, `AIKB/kiss.md`, and in `GUIDE.md` only the passages about the dev `.json`
sibling, `debug.json`, `viewStats()` and `verbose`. It also owns one sentence in each place that
says every own key of a page's options reaches the dev sibling, which stops being true for
`config`: the comments at `lib/page-registry.js:81`, `:276` and `:285`,
`test/integration/replay-equivalence.test.js:89-90`, and `AIKB/aikb.md:51`, `AIKB/build-report.md:54`,
`AIKB/redirects.md:52` and `AIKB/rebuild.md:70`. Check each before changing it.

**The defect.** `options.config` is the whole resolved config (`lib/page-registry.js:507`), and
`GUIDE.md` names `config.fetch.headers` as where an API token goes. Two writers serialise the
options whole into the build folder: the dev sibling `<page>.json` (`lib/kiss-page.js:426-436`) and
`debug.json` under `verbose: true` plus `.viewStats()` (`lib/page-registry.js:673-701`), which is
not gated on dev and so can be deployed. `lib/kiss.js:762` also prints the config under `verbose`,
in CI logs as well.

**The fix.**

1. Both writers serialise the options **without `config`**. Leave it out whole; do not redact one
   key. The config is the site's own file and is not what these dumps are for, and an allow-list
   ("the page's own options") cannot be beaten by the next secret-bearing key the way a redaction
   list can. One shared function does it, so the two writers cannot drift.
2. `options.config` stays on the page for templates and controllers, but since the code review
   (workstream E, below) the copy each page gets carries `fetch.headers` with every value
   replaced by `'[redacted]'`. Fetching reads the instance's own config, never the page's copy.
3. The verbose log line prints the config with each value under `fetch.headers` replaced by
   `'[redacted]'`, keeping the header names. This one is a redaction of a single key, and that is
   a decision: the two files are served or deployed, so they get the allow-list; the log goes to
   the developer's own terminal or CI log, `fetch.headers` is the one place kiss documents for a
   secret, and anything else a site puts in its config is the site's to keep out of it. `GUIDE.md`
   says so in one sentence where `verbose` is documented.
4. The model stays in both files. It is what they are for, and the audit's `debug-dump` finding
   already speaks for `debug.json`.

**Sweep before changing anything.** Grep for every reader of these files and of `options.config`
in a dump: `test/`, `scripts/`, `plugins/kiss-ssg/skills/` (`kiss-build-check`, `kiss-site-review`
and its `browser-pass.md` mention them), `AIKB/`, `GUIDE.md`, `examples/`. A skill or doc that
tells a reader to look for `config` in a sibling is now wrong: report it (skills are owned by the
main session, below).

**Regression tests, each seen red first:**

- A dev build whose config has `fetch: { headers: { Authorization: 'Bearer SECRET-TOKEN-1' } }`:
  no file under the build folder contains `SECRET-TOKEN-1`. Walk the whole folder; do not check
  one file. It goes in `test/integration/view-stats.test.js`. A dev build starts the server and
  live reload, so pass `port: 0, livereloadPort: 0` and `await kiss.close()`, as
  `test/integration/aikb.test.js:284-286` does.
- The same with `verbose: true` and `.viewStats()` on a non-dev build: `debug.json` does not
  contain it, and neither does anything the logger was handed. `logger.debug` is gated on
  `verbose` inside `createLogger`, so an injected logger is handed the config either way: inject
  one that records every argument of every call, and search what it recorded.
- The sibling still carries the model and the page's other options.

**Docs.** The two AIKB docs and `AIKB/kiss.md`; the `GUIDE.md` passages. Say what the files hold
now. Run any snippet you change.

## Workstream C — the embed URL, and placeholders in inline scripts

**Owns:** `lib/embed.js`, `lib/consent.js`, `lib/consent-gate.js`, `test/unit/embed.test.js`,
`test/unit/consent.test.js`, `test/unit/consent-gate.test.js`, `AIKB/embed.md`, `AIKB/consent.md`,
`AIKB/consent-gate.md`, and in `GUIDE.md` only the `{{embed}}` and `{{consentScript}}` passages.
The check belongs in `embedMarkup` in `lib/embed.js`, so `lib/handlebars-helpers.js` should not
need a change. If it does, the `embed` helper, `test/unit/handlebars-helpers.test.js` and
`AIKB/handlebars-helpers.md` are this workstream's too: say so in the report.

### C1 — the frame's URL

**The defect.** A call-site `src=` skips `fill` and is written into `<iframe src>` with only
attribute escaping (`lib/embed.js:259-260`). The frame has no `sandbox`, so a `javascript:` URL
from model data runs in the page's origin. A service's own `embed.src` and `embed.watch` from
config are only checked to be strings.

**The fix.** One function decides whether a URL is safe to frame or link, and every frame URL goes
through it: the call-site `src=`, the filled `embed.src` template, and the filled `embed.watch`.
It parses the value the way a browser will (`new URL(value, <a fixed https base>)`) and accepts
only a result whose protocol is `http:` or `https:`. That is an allow-list of the two schemes that
are safe, decided by the URL algorithm, so leading whitespace, a tab inside the scheme, mixed case
and `data:`/`vbscript:`/`blob:` are all refused without being listed. A root-relative path and a
`//host/…` URL still pass, because they resolve to http(s). A refusal throws, which the helper
already turns into a failed page naming the embed.

Where the check sits matters:

- It runs **after** `fill`, never before: a `{placeholder}` in a template's host position does
  not parse.
- The frame's check runs **before** line 262, which returns the bare iframe for a `necessary`
  service.
- The `watch` check runs **outside** the `try { … } catch { watch = null }` at lines 264-269. Put
  inside it, a refused URL becomes a silently missing link.
- In dev, the helper's `consentFail` warns and writes no markup
  (`lib/handlebars-helpers.js:602-609`). So "fails the page" is a non-dev test, and the dev
  behaviour is a warning and nothing emitted: test both.
- `policyUrl` (`lib/consent.js:669-680`) keeps its own, stricter rule (an absolute http(s) URL):
  it is an `href` to another site's policy and a relative path is wrong there. Do not merge them.

Not in scope: comparing the frame's origin with the service's declared `origins`. That is content
injection, not script execution, and it changes what a site may embed. Also not in scope:
`{{consentScript … src=}}`. A script URL from model data is code whatever its scheme, so a scheme
check there would promise something it cannot keep.

**Regression tests, each seen red first:** `src=` of `javascript:alert(1)//`, ` javascript:alert(1)`
(leading space), `java\tscript:alert(1)`, `JAVASCRIPT:alert(1)`, `data:text/html,<script>…`,
`vbscript:x` each fail the page; the documented literal
`https://www.google.com/maps/embed?pb=x`, a root-relative `/map/` and `//www.example.com/x` still
render. A config `embed.src` or `embed.watch` that fills to a `javascript:` URL fails too. Cover
each branch the checker traced: no `config.consent`; a gated service; a `necessary` service (bare
iframe); a video preset.

### C2 — placeholders in `inline`

**The defect.** `fill` URL-encodes every placeholder value, which is right for a URL template and
wrong for a script body. The `gtag` preset's `inline` ends `window.gtag('config','{id}');`, and
`encodeURIComponent` leaves `'`, `(` and `)` alone, so an id of `G-X'-alert(1)-'` closes the
string. The id can come from the helper's hash (`{{consentScript "gtag" id=model.gaId}}`).

**The fix (as revised after the code review; workstream D below has the detail).** `fill` stays
as it is for URLs. A second function fills a script body in two steps: the value is URL-encoded
exactly as `fill` encodes it, and then every character of that result outside `[A-Za-z0-9_.-]` is
written as a `\uXXXX` escape. Inside a string literal the script therefore sees the same value it
saw before this branch, `encodeURIComponent(value)`, and the characters URL-encoding leaves alone
(`'`, `(`, `)`, `!`, `~`, `*`) can no longer end the string. `lib/consent-gate.js:204` uses it for
`service.inline`. An ordinary id (`G-ABC123`, `AW-123`, `1234567890`) comes out byte for byte as it
does on `main`.

The first version of this fix wrote the raw value, escaped, with no URL-encoding. That closed the
breakout and opened another hole: a site's `inline` that puts a placeholder inside a URL or an
HTML string (`new Image().src='https://t.example/p?site={site}'`,
`el.innerHTML='<a href="/x?id={site}">'`) had been getting an encoded, inert value and now got the
raw one (the code review measured an injection through `innerHTML`).

The dot is in the safe set on purpose. A site's own `inline` may use a placeholder outside quotes
for a number (`{rate}` as `0.5`), which works on `main` because `encodeURIComponent` leaves the dot
alone; escaping it would turn that into a syntax error that only a browser reports.

What does stop working, and has to: an unquoted placeholder whose value holds `'`, `(`, `)`, `!`,
`~` or `*`. `encodeURIComponent` passed those through, so `{q}` as `init()` ran as code on `main`.
That is the injection this fix closes, so it becomes a syntax error in the browser, and the
upgrade note says a placeholder is data, never code.

**Regression tests, each seen red first:** the payload above, a value holding `"`, a backtick,
`\`, a newline, `</script>` and U+2028, each parsed back out of the emitted script (evaluate the
emitted literal; do not compare text) as `encodeURIComponent` of the original. `G-ABC123` and `0.5`
are byte-identical to `main`'s output. `findDocumentWrite` runs on the filled text
(`lib/consent-gate.js:205`): a value that itself holds `document.write(` is now inert and no
longer trips it, which is correct; pin it with a row.

**Docs.** The three AIKB docs; in `GUIDE.md`, one sentence where `src=` is documented (what is
refused) and one where `inline` is (a placeholder belongs inside a string literal, and how its
value is written).

## Owned by the main session

Nothing below is touched by a workstream. Report anything that needs changing in them.

- `CHANGELOG.md`, `package.json` (the version), `types/` (`npm run types`), `llms.txt`, `README.md`.
- Every skill under `plugins/` and `.claude/skills/`, and `test/unit/skill-coverage.test.js`.
- `examples/` and `starter/`. `examples/14-consent/router.js:84` ships `verbose: true`, which a
  site copied from it inherits: decide at review whether an example should.
- `npx prettier --write` on `GUIDE.md`, once, after every workstream has finished.
- The full gates, the fleet check, and every commit.

## Rules for every workstream

- **You do not commit.** No `git add`, `commit`, `stash`, `checkout`, `restore` or `reset`. The
  operator's diff review is the checkpoint. To see a test fail on the unfixed code, write the test
  first and run it before you write the fix.
- **Other agents are editing this checkout at the same time.** Stay inside the files you own. Two
  workstreams edit different passages of `GUIDE.md`: read it again immediately before each edit,
  and touch only your passages. Never run prettier on `GUIDE.md` (it holds hand-aligned tables
  another workstream may be editing), and never add a `##` or `###` heading to it (a new heading
  fails the docs build). You may run `npx prettier --write` on a file you own outright.
- **Run only your own test files:** `npx vitest run <file> <file>`. Do not run `npm test`,
  `npm run gates`, `node docs`, any example, or `npm run types`. They build into shared folders
  and collide with the other workstreams.
- **Your tests load the other workstreams' files while they are half-edited.**
  `lib/kiss-page.js` imports `lib/consent-gate.js` and `lib/consent.js`; the consent unit test
  imports `lib/consent.js`; the browser suite builds whole sites with an embed on the page. A
  failure whose stack is in a file you do not own is run again a minute later and reported, never
  fixed. Red evidence quotes the specific assertion that failed (the off-host request, the token
  that was found), not only that a run failed.
- **`test/unit/types.test.js` will be red** once a workstream exports a new function. That is
  expected: the main session regenerates `types/` at the end.
- **Text reaches a file through the Write or Edit tool only.** Never through `sed -i`, a heredoc,
  `echo >`, `tee` or `node -e`. A hook refuses those, and the refusal is the rule.
- **Read the module's `AIKB/` doc before changing the module, and update it with the change.**
- **JSDoc is the type source.** A new function gets a full JSDoc block directly above it. Do not
  insert a function between an existing JSDoc block and the definition it documents.
- **Only `lib/logger.js` imports `colors`.**
- **Fix the class.** Before you finish, grep for every sibling of what you fixed and say what you
  found, including the ones you judged safe.
- **A sentence about behaviour is a claim.** Say in your report which statements you measured and
  which you inferred. Run every code snippet you write into a doc.

## What each workstream reports

1. The files changed, and a two-line summary of each change.
2. For each regression test: the command, and the failing output on the unfixed code, then the
   passing output.
3. The sibling sweep: what was searched for, what was found.
4. Anything in a file it does not own that now needs changing.
5. Anything it could not do, did not verify, or decided against this contract, with the reason.

## Quality assurance (the main session)

**Stop condition, fixed before the work starts.** Scope: the files above. Threat model: the one
above. What counts: a fix that does not close its finding, a regression in documented behaviour, a
red gate, or a doc that now contradicts the code. Anything below that is listed in the session
file and not fixed on this branch. One review pass per workstream, one round of fixes if the pass
finds something that counts, then the largest fix diff goes in front of the operator before
anything else is run. A round that would add code outside the scope stops and is put to the
operator.

For each workstream:

1. Read the whole diff against this contract.
2. Re-derive red, independently of the agent's report: with the `lib/` change set aside, the new
   tests fail; with it back, they pass.
3. Run the documented snippets the diff touches.
4. Check `AIKB/` moved with the code and says what the code does.

Then, once for the branch: `npm run types`; `npm run gates`; the fleet check (below); the upgrade
note drafted for the close.

**The fleet check.** `a1k9training` (it calls `{{embed 'youtube' id=model.videoId …}}`, the one
fleet site that feeds model data to a changed helper), cloned into the scratchpad, built from a
packed tarball of `main` and then of this branch, `kiss-ssg check` on each, the two reports
compared with `lib/check.js`'s `diffReports`. Expected: no difference. Each difference is explained.

## For the changelog, at the close

The entry needs an `### Upgrading` note:

- **Rebuild and redeploy** a site that uses `config.consent`: the head script is inlined into every
  page, so the fix reaches a visitor only from a new build. A site that pins a
  Content-Security-Policy hash for the consent head script must re-hash it.
- **The dev `.json` sibling and `debug.json` no longer hold `config`.** Anything that read it from
  there reads the build script instead.
- **`{{embed … src=}}` now fails the page** for a URL that is not http(s). So do a service's
  `embed.src` and `embed.watch`.
- **A placeholder in a service's `inline` script is data, never code.** Inside quotes nothing
  changes: the script sees the same URL-encoded value as before. An unquoted placeholder whose
  value holds `'`, `(`, `)`, `!`, `~` or `*` used to be written as it stood and is now escaped, so
  it is a syntax error in the browser: put the placeholder in quotes, or move the code into the
  `inline` itself.
- **A page's `config.fetch.headers` values read `'[redacted]'`** in templates and controllers. The
  header names are still there, and fetching is unaffected.
- **(If workstream F lands.)** How a URL model with a query string is named in the site map, the
  log and a failure message.

## Amended 2026-11-06 — after the contract critique, before any code

A fresh reviewer read this document against the code. The sections above already carry the
changes; this is the list of what moved, and why.

- **A, the guard's exact shape.** The unit harness has no global `URL` and its `location` has no
  `host`, so the guard as first written could not run there and the plan told the implementer to
  stop. The code shape is now given, and it needs no harness change.
- **A, the browser test.** It moved from a build of example 14 into `test/browser/consent.test.js`,
  which already has the server, the off-host request log and a 404 fixture. Another test file
  deletes and rebuilds example 14's output, so the first version raced it.
- **A, the size ceiling** on the inline script, which the first version did not mention.
- **A, the fallback's two limits**, to be documented.
- **B, the test's shape:** ports, `close()`, a recording logger.
- **B, the log line's single-key redaction** is now a stated decision with its reason, where the
  first version argued against redaction lists and then used one.
- **B, the stale sentences** in comments and four AIKB docs, now owned.
- **C1, where the check sits:** after `fill`, before the early return, outside the `watch` `try`;
  the dev behaviour; `policyUrl` left alone; `{{consentScript … src=}}` out of scope.
- **C2, the dot joins the safe set.** Escaping it would have broken an unquoted numeric
  placeholder that works today, with an error only a browser reports.
- **All, isolation.** "Run only your own tests" does not isolate the workstreams, because the
  modules import each other. The rule for a failure in a file you do not own is new.
- **All, `GUIDE.md`:** no prettier, no new headings.

Not checked by the critique, and so still inferred: what Chromium does with `/\host/…` as a script
`src` (workstream A's browser test measures it), and whether the page minifier rewrites `\uXXXX`
escapes in an ungated inline script (the main session reads one built page).

## Amended 2026-11-06 — round two, after the code review of `afb1da4`

The operator ran `/code-review` on the branch. It found nothing in the origin guard or in
`isHttpUrl`, and six things elsewhere. The operator decided the three that were decisions. This
is the one round of fixes the stop condition allows; workstream F is outside the first scope and
is here because the operator put it here.

The rules for every workstream, and what each reports, are unchanged.

### Workstream D — the inline fill, revised (findings 1, 2 and 6)

**Owns:** `lib/consent.js` (`fill`, `fillScript` and what they share), `lib/consent-gate.js` (the
one call), `test/unit/consent.test.js`, `test/unit/consent-gate.test.js`, `AIKB/consent.md`,
`AIKB/consent-gate.md`, and in `GUIDE.md` only the sentence about a placeholder in `inline`.

1. `fillScript` URL-encodes the value as `fill` does and then escapes the result, as section C2
   now describes. The value a quoted placeholder yields is `encodeURIComponent(value)`, as on
   `main`.
2. `fill` and `fillScript` share one placeholder loop (the regex, the own-key check, the "no
   value" error), differing only in the encoder they pass, so the placeholder syntax cannot drift
   between URL templates and script bodies.
3. The tests that asserted the raw value read back now assert `encodeURIComponent` of it. Add the
   code review's two cases, each seen red against the branch as it stands: the `innerHTML` case
   (a placeholder inside an HTML string, evaluated, must hold no `<` or `"` from the value) and
   the URL case (`'https://t.example/p?site={site}'` with a value holding `&b=c` must not gain a
   parameter). Add a row that pins the unquoted `init()` case as escaped.
4. The docs say what the code does. `AIKB/consent.md` (near line 82) says an unquoted placeholder
   holding other characters "was already broken under URL-encoding": false for `! ~ * ' ( )`, so
   correct it. `fillScript`'s JSDoc says a value outside a literal cannot "assign": `x--` is made
   of safe characters and mutates, so say what is actually true. The `GUIDE.md` sentence says the
   value is URL-encoded and then escaped.

### Workstream E — the token out of the render context (findings 3 and 5)

**Owns:** `lib/page-registry.js`, `lib/kiss-page.js` (`withoutConfig`'s JSDoc only),
`test/unit/page-registry.test.js`, `test/integration/view-stats.test.js`,
`AIKB/page-registry.md`, `AIKB/kiss-page.md`, `AIKB/config.md`, and in `GUIDE.md` only the
`fetch.headers` passage (near line 305) and the `{{{stringify this}}}` passage (near line 2123).

1. Where each page gets its copy of the config (`lib/page-registry.js`, the
   `options.config = { ...kiss.config, … }` line, and the fan-out copy near line 421), the copy's
   `fetch.headers` has every value replaced by `'[redacted]'`, names kept. A page-level `config`
   override that itself supplies `fetch.headers` is redacted the same way. `kiss.config` is not
   touched: `fetchConfig: kiss.config.fetch` (near line 549) is what fetching reads, and a test
   proves a URL model is still fetched with the real header.
2. One function does the redaction, and `lib/kiss.js`'s verbose log line should use the same one
   if that needs no more than an import; if it needs more, leave the log line and say so.
3. `withoutConfig` stays, as the second line of defence for the two debug files. Its JSDoc says
   "the next secret-bearing config key cannot slip through": it drops one key by name, and a
   controller that copies `config` under another name defeats it. Say what it does.
4. Regression tests, each seen red first: with a token in `config.fetch.headers`, a page whose
   view is `{{{stringify this}}}` writes no token into its HTML; a controller returning
   `{ ...options, site: options.config }` writes none into the page, the dev sibling or
   `debug.json`; a template still reads `{{config.siteUrl}}`; the fetch still sends the header.
5. Not fixed, listed: a page's own `config` overrides no longer show in the two debug files.

### Workstream F — a token in a URL model's query string (finding 4): verify, then propose

This one starts as an investigation. **It changes no file in the repository** until the main
session has read its report.

1. **Verify with a real run.** In the scratchpad: a small site with one URL model served by a
   local server on `127.0.0.1` (port 0), the URL carrying `?access_token=SECRET-TOKEN-2`. Run
   `kiss-ssg aikb` on it with the working tree's engine and search everything it writes, and
   everything it prints, for the token. Then make the fetch fail (a 404, and a refused
   connection) and search the output, the `KISS_REPORT` line and `kiss-ssg check`'s JSON.
2. **Trace every reader** of the string `classifyModel` returns (`lib/aikb.js`), of a URL model's
   `id`, and of every message that names the URL (`lib/model-resolver.js`, `lib/fetch-policy.js`):
   what is keyed on it, what a changed spelling would move (a site's committed `AIKB/` record,
   note subjects and their hashes, `kiss-ssg check`'s diff), and what two models that differ
   only in their query string look like today.
3. **Propose one rule** for how a URL is written anywhere kiss records or prints it, with what it
   costs: what collides, what baseline moves, what a site sees on upgrade. Report, and stop.
