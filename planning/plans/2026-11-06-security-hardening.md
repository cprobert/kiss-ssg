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

**Owns:** `lib/consent-client.js`, `test/unit/consent-client.test.js`, `AIKB/consent-client.md`,
and one new browser test (below). May read anything.

**What the code promised.** The comment at `lib/consent-client.js:303-310` says the root is derived
from the address because a page is reached at more than one address, under any prefix, on any
origin, even `file://`. That promise stays. What was never promised, and is the defect, is that
the derived root may name another host.

**The defect.** `at` is `decodeURI(location.pathname)`. The root is everything in front of the
page's own file name, and it is written back as the script's `src`. A decoded string is being
re-read as a URL: `/%5Cevil.example/404` decodes to `/\evil.example/404`, the form `404` matches,
the root is `/\evil.example/`, and a browser reads `/\` as `//`.

**The fix.**

1. **The origin guard.** After the root is derived, resolve `root + client.name` against the page's
   address with `new URL(…, location.href)`. Use the derived root only when the result's
   `protocol` and `host` equal the page's. Otherwise use `client.root`. Compare `protocol` and
   `host`, not `origin`: on `file://` every origin is the string `null`, and two different hosts
   would compare equal. The guard is the browser's own URL algorithm, not a list of bad
   characters, so it covers the backslash, the double slash, a stripped tab or newline, and any
   spelling not thought of yet.
2. **The wrong-but-harmless root.** A benign `/missing/404` derives `/missing/`, the client 404s
   and every consent control on that page is dead. Give the tag an `error` handler that, when the
   derived root was not `client.root`, appends the script once more from `client.root`. Once
   only. This is the functional sibling of the same cause, so it is fixed here.

**Regression tests, each seen red on the unfixed code first:**

- Unit rows beside `test/unit/consent-client.test.js:281-300`, for a `404.html` page at
  `/%5Cevil.example/404`, `/%5C%5Cevil.example/404`, `//evil.example/404`,
  `/%09/evil.example/404` and `/%5Cevil.example/404.html`; and for a root `index.html` at
  `/%5Cevil.example/`. Each asserts the script's resolved URL is on the page's own host.
- A unit row for `/missing/404`: the fallback fires and the second tag is at `client.root`.
- The rows that already pass (`/guide`, `/guide/`, `/guide/index.html`, a prefix, `file://`) must
  still pass untouched. If the existing harness fakes `location` in a way that cannot resolve a
  URL, say so in the report before changing the harness.
- **One real-browser test.** Build example 14 (`examples/14-consent`), serve it with
  `scripts/screenshot.mjs`'s `serveFolder` (it answers an unknown path with the site's
  `404.html`), open `/%5Cevil.example/404` in Chromium through `playwright-core`, and record every
  request. Assert no request left the served origin and that the consent banner's client started.
  Put it where the suite's other Playwright-backed tests live; if there are none, in
  `test/integration/`, skipped with a clear message when Chromium is not installed. Run it against
  the unfixed client first and paste what it requested.

**Docs.** `AIKB/consent-client.md`: the guard, the fallback, and why `protocol` + `host`. If that
doc states a byte size for the inline script, re-measure it and write the measured number.

## Workstream B — config out of the debug files, and out of the log

**Owns:** `lib/kiss-page.js`, `lib/page-registry.js`, `lib/kiss.js` (the `logger.debug('config: ', …)`
line at 762 only), `test/unit/kiss-page.test.js`, `test/unit/page-registry.test.js`,
`test/integration/view-stats.test.js`, `AIKB/kiss-page.md`, `AIKB/page-registry.md`, `AIKB/kiss.md`,
and in `GUIDE.md` only the passages about the dev `.json` sibling, `debug.json` and `viewStats()`.

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
2. `options.config` itself is untouched: templates and controllers still read it.
3. The verbose log line prints the config with each value under `fetch.headers` replaced by
   `'[redacted]'`, keeping the header names.
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
  one file.
- The same with `verbose: true` and `.viewStats()` on a non-dev build: `debug.json` does not
  contain it, and neither does anything the logger was handed.
- The sibling still carries the model and the page's other options.

**Docs.** The two AIKB docs and `AIKB/kiss.md`; the `GUIDE.md` passages. Say what the files hold
now. Run any snippet you change.

## Workstream C — the embed URL, and placeholders in inline scripts

**Owns:** `lib/embed.js`, `lib/consent.js`, `lib/consent-gate.js`, `lib/handlebars-helpers.js` (the
`embed` helper only), `test/unit/embed.test.js`, `test/unit/consent.test.js`,
`test/unit/consent-gate.test.js`, `AIKB/embed.md`, `AIKB/consent.md`, `AIKB/consent-gate.md`, and in
`GUIDE.md` only the `{{embed}}` and `{{consentScript}}` passages.

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

Not in scope: comparing the frame's origin with the service's declared `origins`. That is content
injection, not script execution, and it changes what a site may embed.

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

**The fix.** `fill` stays as it is for URLs. A second function fills a script body: every
character of a value outside `[A-Za-z0-9_-]` is written as a `\uXXXX` escape, one per UTF-16 code
unit. Inside any string literal that reads back as the original text; outside one it cannot form
an operator, a call or a tag. `lib/consent-gate.js:204` uses it for `service.inline`. An ordinary
id (`G-ABC123`, `AW-123`, `1234567890`) must come out byte for byte as it does today.

**Regression tests, each seen red first:** the payload above, a value holding `"`, a backtick,
`\`, a newline, `</script>` and U+2028, each parsed back out of the emitted script as the original
string (evaluate the emitted literal; do not compare text). `G-ABC123` is byte-identical to the
current output.

**Docs.** The three AIKB docs; in `GUIDE.md`, one sentence where `src=` is documented (what is
refused) and one where `inline` is (a placeholder belongs inside a string literal, and how its
value is written).

## Owned by the main session

Nothing below is touched by a workstream. Report anything that needs changing in them.

- `CHANGELOG.md`, `package.json` (the version), `types/` (`npm run types`), `llms.txt`, `README.md`.
- Every skill under `plugins/` and `.claude/skills/`, and `test/unit/skill-coverage.test.js`.
- `examples/` and `starter/`.
- The full gates, the fleet check, and every commit.

## Rules for every workstream

- **You do not commit.** No `git add`, `commit`, `stash`, `checkout`, `restore` or `reset`. The
  operator's diff review is the checkpoint. To see a test fail on the unfixed code, write the test
  first and run it before you write the fix.
- **Other agents are editing this checkout at the same time.** Stay inside the files you own. Two
  workstreams edit different passages of `GUIDE.md`: read it again immediately before each edit,
  and touch only your passages.
- **Run only your own test files:** `npx vitest run <file> <file>`. Do not run `npm test`,
  `npm run gates`, `node docs`, an example's dev server, or `npm run types`. They build into
  shared folders and collide with the other workstreams. The one exception is workstream A's
  build of example 14, which no other workstream touches.
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
  page, so the fix reaches a visitor only from a new build.
- **The dev `.json` sibling and `debug.json` no longer hold `config`.** Anything that read it from
  there reads the build script instead.
- **`{{embed … src=}}` now fails the page** for a URL that is not http(s). So do a service's
  `embed.src` and `embed.watch`.
- **A placeholder value in a service's `inline` script** is written as a JavaScript string's
  content, not URL-encoded. A value of letters, digits, `_` and `-` is unchanged.
