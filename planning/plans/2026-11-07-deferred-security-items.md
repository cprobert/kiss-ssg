# Plan — 2026-11-07: The fourteen items deferred from 2.13.2

The contract for `fix/deferred-security-items`. Pull request #76 (2.13.2) listed fourteen findings under "What's deferred", none fixed. This branch closes them. The session file is `planning/sessions/2026-11-07-deferred-security-items.md`; the decisions at its open bind this plan. Amend this document in place, with a dated section, when the design moves.

## Threat model (unchanged from the security release)

The site author is trusted. Model data (a CMS, a JSON feed) is semi-trusted: it is the site's content, and it may be wrong or carry markup, but it is not hostile code the engine must sandbox. A visitor's address bar and the network are untrusted. One site per script, honest files, a stable working directory. Denial of service, multi-site and hostile files are out of scope.

A **secret** is a value in `config.fetch.headers`, a query value in a model URL, or a credential in a URL. The promise this branch holds: no secret reaches a file kiss writes, a log line, or an error message, and a build that lost a page says so.

## Workstreams

Five, each owning the files it names. A workstream touches no file another owns; a shared file (`lib/utils.js`, `AIKB/utils.md`, `GUIDE.md`, `llms.txt`, `CHANGELOG.md`) is named under one owner and the others ask through the main session.

### A — The fetch path (`lib/fetch-policy.js`)

Owns `lib/fetch-policy.js`, `lib/config.js` (the fetch block's resolution only), `test/unit/fetch-policy.test.js`, `test/unit/config.test.js` (fetch rows only), `AIKB/fetch-policy.md`, `AIKB/config.md` (fetch paragraph), `AIKB/upstream.md` (the Node fetch entry).

Items 1 to 8 and 12.

1. **The timeout covers the body.** `fetchOnce` races the headers only; `response.json()` runs outside the race. One timer per attempt covers both: the race wraps the body read, and the abort reaches undici's body stream. The regression test is a real local server that sends `200` and a `Content-Type: application/json` header and then nothing. The fix is seen red: without it the test waits past the timeout.
2. **`retries` and `timeout` are validated by shape, once.** Today `Math.max(0, NaN)` makes the loop run zero times and `fetchModel` throws `undefined`. `resolveConfig` refuses a `fetch.retries` that is not a non-negative integer and a `fetch.timeout` that is not a non-negative finite number, with a message naming the key and never the value; `fetchModel` keeps a guard of its own for a caller that bypasses config, throwing its own error. Fix the class: every key in the fetch block gets a shape, not only the one the review found.
3. **An unfetchable URL is refused before the loop.** `URL.canParse` and the credentials check move ahead of the attempt loop, so a URL that cannot be fetched is reported once, by kiss, and no `fetchImpl` is called. With that, the error for those cases is always kiss's, which closes the "reported as whatever error was thrown" half.
4. **Each safe part has its own shape.** `PART` is one regex for a code, an address, a port and a host name. Replace it with one shape per field: a code is `/^[A-Z][A-Z0-9_]*$/` (every code Node raises: `ECONNREFUSED`, `UND_ERR_SOCKET`, `ERR_INVALID_URL`); an address passes `net.isIP`; a port is an integer in 1 to 65535; a host name is `/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i`. The header comment then says what is true: a replaced `fetch` can put a token in a field only if the token has that field's shape. Measure each shape against the real errors the existing real-server tests produce.
5. **A failed cache write warns and returns the data.** `logger.warn` with the hashed cache file and the error's described part, never the URL; the model is returned. The test stubs the write to fail and asserts the data, the warning and no throw.
6. **A non-numeric status.** Verify first: `statusLine` already passes the status through `part`, and the review may have read an older tree. If still true anywhere (`response.status < 500` with a non-number retries a stub's answer), guard it; if not, record it as closed by `991ca05` with the line that closes it.
7. **One message builder, marked only where read.** `own()` marks the timeout error, the 4xx failure and the cache-write error, and only `failureOf` reads the mark, so two markings are dead. One builder, `fails(url, what)`, writes every `Model fetch failed: <redacted> → <what>` line, and `ours` marks only what passes through `failureOf`. No behaviour change: the existing rows hold it.
8. **The real-fetch rows are made deterministic.** Each of the four constant-cause rows runs against a local server that produces the cause on purpose (a socket destroyed after headers, a redirect loop). Run the file twenty times in a loop before and after; report the count. A row that cannot be made deterministic is kept with a comment saying what timing it depends on, and `AIKB/upstream.md` says how to re-check it on a new Node.
9. **Fewer failures end as a bare name.** Measure the cause each of these produces on Node 22.23.4 (the floor, `.nvmrc`) and on the local Node: a port kiss cannot open, `httpx://`, an invalid port, a self-signed certificate, a host with no address, a refused connection, a redirect loop, a server that closes mid-body. Add every cause whose message is a constant string to `CONSTANT_CAUSES`, with the version measured in the comment. What remains unnamed reads `an error kiss cannot describe (<name>)`, so the name is kept and the sentence says it is a gap.

### B — A failed model fails the build (`lib/page-registry.js`, `lib/model-resolver.js`)

Owns `lib/page-registry.js`, `lib/model-resolver.js`, `test/unit/page-registry.test.js`, `test/unit/model-resolver.test.js`, `test/integration/lifecycle.test.js` (new rows only), `AIKB/page-registry.md`, `AIKB/model-resolver.md`, `AIKB/kiss.md` (the sentence about model failures), `examples/8-data-fed-site/` (read, to confirm its failure is unchanged).

Item 9.

9. **A model that cannot be resolved fails the page.** Today the chain's `.catch` logs and resolves `{ data: null, error }`, so the report says `ok: true` with the page missing. It becomes a build failure like a controller's: `kiss._failures.push({ view, buildTo: null, error })` and the page is not prepared. Three integration rows: a missing `.json` model, an empty model folder, a URL fetch that fails against a local server. Each shows `ok: false` and names the page; each is seen red first. `Skipping:` becomes `Model not found:`. Example 8 fails one page on purpose today for a controller reason: confirm it still exits 1 for that reason and no other. Watch mode: a model file restored after a failed build must clear the failure on the next rebuild (`lib/rebuild.js` replays registrations; a row in the rebuild tests if none covers it). The `CHANGELOG.md` `### Upgrading` note says a site that relied on the skip now sees a red build, and what to do.

### C — Redaction (`lib/utils.js`, `lib/aikb.js`)

Owns `lib/utils.js` (`redactUrl` only), `lib/aikb.js` (the pipeline record), `test/unit/utils.test.js`, `test/unit/aikb.test.js`, `AIKB/utils.md`, `AIKB/aikb.md`, and the `GUIDE.md` sentences on what kiss records of a URL and a pipeline step.

Items 10 and 11.

10. **The whole query is redacted; the path is documented.** `redactUrl` keeps the scheme, host, port and path, and replaces the entire query with `?[redacted]` when there is one, and drops the fragment. A query parameter's name is no longer shown. Rows for an http(s) URL whose password holds `@` (the parser takes the last `@` as the end of the credentials, so username and password are dropped whole) and whose password holds `/` (the parser refuses it and the string goes by its last `@`). A secret in the path cannot be told from a path segment: `GUIDE.md` § Remote models says so in one sentence, and `llms.txt`'s trap line says a secret goes in a header or a query value. Every reader of `redactUrl`'s output (the `aikb` site map's model identity, `check`'s diff, the model-resolver log) is swept: grep for the function and for `[redacted]` in tests.
11. **The site map records a pipeline step's program, not its command.** `SiteMapPipelineStep.run` is replaced by `program`, the first word of `run`, and the step's hash stays the hash of the whole command (it already is, in `subjectHash`). Every reader of `run` on the site map is swept: `lib/check.js`, the skills under `plugins/kiss-ssg/skills/`, `test/unit/aikb.test.js`, `AIKB/aikb.md`. The `### Upgrading` note says the site map's shape changed and `kiss-ssg aikb` rewrites it on the next run.

### D — Docs and examples

Owns `GUIDE.md` (§ Markdown options), `llms.txt` (one trap line, under the 16,000 cap), `plugins/kiss-ssg/skills/kiss-security/SKILL.md`, `test/unit/skill-coverage.test.js` (one row), `examples/*/router.js` (`verbose`), `AIKB/consent-client.md`, `test/browser/consent.test.js` (one `file://` row).

Items 13 and 14.

13. **`markdown.html: false` is the documented CMS opt-out, and the examples stop teaching `verbose: true`.** `GUIDE.md` § Markdown options gains a paragraph: HTML in Markdown is rendered as written by default, which is right for an author's own files and wrong for Markdown a CMS serves; a site fed from one sets `markdown: { html: false }`. One `llms.txt` trap line. The `kiss-security` skill names it, with a `skill-coverage` row. Then the examples: `verbose: true` is in every router, so an agent copies it; it writes `debug.json` and the dev `.json` siblings. It stays in one example whose comment explains what it writes (example 2, which already says so) and goes from the rest. Build every example after, through `npm run eg1` to `eg12` (8 exits 1 by design).
14. **The `file://` guard is measured.** A Playwright row opens a built page with `config.consent` from a `file://` URL in Chromium and asserts that no request leaves the file origin and the client loads from the page's own folder (or fails closed, whichever the code does; the test states which). `AIKB/consent-client.md` changes "inferred" to the measured sentence with the Chromium version. The 200-host half stays as it is documented: a host that answers every unknown address with a page and `200` defeats a `<script>` fallback unless it sends `nosniff`, and `securityHeaders: true` sends it. It is the one item this branch records rather than fixes, by decision at the open.

### E — The fleet check as a command (`scripts/fleet-check.mjs`)

Owns `scripts/fleet-check.mjs`, `test/unit/fleet-check.test.js`, the `CLAUDE.md` § Commands line for it, and the `/branch-open` and `/branch-pulse` skills' fleet-criterion sentences.

The shape it ran in twice: a clone of a real site in the scratchpad (never the site's own folder), `npm pack` of the base commit and of the branch, each tarball installed in turn, `kiss-ssg check` on each, the two reports compared with `lib/check.js`'s `diffReports` (pipeline durations zeroed first), and the two build folders compared byte for byte, with the engine's version string taken out, from two builds taken back to back (a report kept from earlier is not a baseline: the same tarball gave different page hashes hours apart on 2026-11-06).

```
node scripts/fleet-check.mjs <site folder> --base <ref> [--branch <ref>] [--out <folder>]
```

Clones the site to `--out` (default: a folder in the OS temp), packs both refs from this repository into it, and for each: installs the tarball, runs the site's build script through `kiss-ssg check` into its own build folder, keeps the report. Prints the report comparison and the folder comparison, and exits 1 when either differs, so a pulse can read the exit code. The decisions (which files differ, what is noise) live in the script's exported functions, tested in `test/unit/fleet-check.test.js` against fixtures; the git and npm calls are thin. The `--site` flag of `npm run bench` already finds a site's build script: reuse that resolution rather than a second copy.

## Order

A, B and C are independent and run in parallel. D's example sweep runs after B (a failed model now fails a build, so an example with a bad model would exit 1). E runs in parallel with all of them and is used by the fleet criterion at the end, against the final tree.

After each of A, B, C lands: `/branch-pulse`, with the mutation check for that workstream's fixes in the entry.

## Review and stop rule

One fresh-context review of the whole branch diff at the close, scoped to `lib/` and `scripts/`, against the threat model above. A finding counts when it is one of: a secret reaching a file, a log or a message; a build that passes when a page is missing; a regression against `main`; a fleet difference the pulse could not explain. A finding that counts is fixed, with its test seen red, and the largest fix diff is shown to the operator before any second round. A finding below the bar is listed in the pull request. At most two rounds; the second only if the first fixed something that counted. Codex is not available (no credits).

## Version

2.14.0, with `### Upgrading`: a failed model fails the build; the site map's pipeline step records `program` not `run`; a model URL's query is now recorded as `?[redacted]` whole.

## Amended 2026-11-07 — after the fresh-context critique

A fresh-context agent read this contract against the code before anything was built (eighteen findings; each re-checked in the main session against the lines it cited). What changes:

**Order.** C lands first, alone: item 10 changes the `?name=[redacted]` expectations in `test/unit/fetch-policy.test.js`, `test/unit/model-resolver.test.js`, `test/unit/page-registry.test.js` and `test/integration/aikb.test.js`, which A and B own or nobody owns. C sweeps every one of those rows (grep `[redacted]`), the JSDoc in `lib/aikb.js` and `lib/utils.js`, `AIKB/aikb.md`, `AIKB/fetch-policy.md` and `GUIDE.md`'s sentence on what is recorded. A and B start from C's commit. D's example sweep still follows B. E is independent.

**Workstream A.**

- Item 1: measured on Node 24.14.0, `controller.abort()` after the headers rejects `response.json()` with an `AbortError` whose `code` is the number `20`. Today `part()` accepts a finite number, so that error would print `→ 20`. Item 4's code shape is string-only, which closes it; the floor (22.23.4) is measured by CI. After item 1, the timeout error's `own` marking is live and load-bearing: a timeout during the body read reaches `failureOf` with `arrived` set.
- Item 2: `{ ...DEFAULT_FETCH, ...options }` lets an explicit `retries: undefined` override the default, so the guard in `fetchModel` handles `undefined` as well as `NaN`, and does not rely on `resolveConfig` having stripped it.
- Item 4 gains a fifth field: a status is an integer from 100 to 599, read at `statusLine` and in `failureOf`. `part()` today prints a stub's `status: 'TOKENX'`.
- Item 6 is not closed: `response.status < 500` is compared unguarded, so a stub's non-numeric status is retried. The status shape above guards both reads.
- Item 5: the existing row asserting the cache-write throw is inverted, not added to.
- Item 8 is narrower than written: the drop and redirect rows already run against the local server, and `bad port` and `unknown scheme` need none. The one timing-dependent row is `/drop`, where a socket destroyed before the headers can yield `ECONNRESET` rather than `other side closed`. That row is the whole item.
- `npm run types` is run by the main session before each commit that changes a JSDoc type (`KissFetch`, `redactUrl`, `SiteMapPipelineStep`): `test/unit/types.test.js` is byte-identity and fails the gates otherwise.

**Workstream B.**

- Item 9's push must not double-count: the inner `try/catch` at the controller already pushes `{ view, buildTo: null, error }` and rethrows into the same `.catch`. The `.catch` pushes only for a rejection that did not pass through the inner block (mark the rethrown error, or move `resolveModel` inside the `try`). One push per failure, asserted.
- B now owns the row "a bad model is logged and skipped" in `test/integration/lifecycle.test.js` (lines 15 to 33), which is inverted: `complete()` rejects, the page is named. The rename covers both messages: `Skipping: <file>` and `Invalid model <folder>`.
- B owns the doc sentence and its contradiction: `GUIDE.md` § Waiting for the build ("A bad model is not a build failure") and `AIKB/kiss.md`'s two lines saying the same. The old sentence goes into `test/unit/skill-coverage.test.js`'s `CONTRADICTIONS` as one row (B's row in a file D also adds one row to: the main session merges).
- Watch: `replaySession` keeps only `_carriedFailures`, so a model failure clears on the next rebuild without new code provided B does not carry it. B owns one new row in `test/unit/rebuild.test.js` proving a model file restored after a failed build clears the failure.

**Workstream C.**

- Item 10: the two credential rows (`@` and `/` in a password) already pass today and are pinning rows, not regression tests; only the whole-query row is seen red. The site map's model identity coarsens: two URL models differing only in a parameter name now merge into one source and one subject. `AIKB/aikb.md` says so.
- Item 11's readers were wrong in the plan: `lib/check.js` and the skills never read `run`. The readers are `lib/aikb.js` line 793 (the committed `AIKB/README.md`'s "Asset pipeline" table renders `step.run`, a second committed home of a token), line 876 (README prose), `subjectsOf` at line 338 (the hash reads `map.pipeline[].run`, so with `run` gone the hash is taken from the config's pipeline, handed in), `types/aikb.d.ts`, and `test/integration/aikb.test.js` line 229. The subject hash stays the hash of the whole command, because change detection needs it; `AIKB/aikb.md` says a sha1 of a command is committed, and a token belongs in the environment, not the command line. Examples 9 and 11 have byte-identical committed `AIKB/` folders under test: C re-records them with `kiss-ssg aikb` after the shape change.

**Workstream D.**

- `verbose: true` is in 12 of the 14 routers (12 and 13 lack it); the scripts run `eg1` to `eg14`. `CLAUDE.md` § Commands says `eg12`: D corrects it.
- `llms.txt` has 9 characters of headroom (15,991). Items 10 and 13 each add a trap line, so D cuts elsewhere for both; C hands its line to D through the main session.
- Item 14: `AIKB/consent-client.md` does not contain the word "inferred". The claim is bullet 44 of that doc and the comments at `lib/consent-client.js` lines 305 and 317: those are what change to the measured sentence. `kiss-security` has no `skill-coverage` row today; D adds the first.

**Workstream E.** `scripts/bench.mjs` exports `resolveSiteEntry`, pure and tested: reuse that, not `benchSite`, whose file check rejects a1k9training's `node router` (no extension). Zeroing pipeline durations is a no-op for `diffReports` and is kept only for the printed comparison.

**Review.** Skipping Codex is a choice against the standing preference that credit is not a reason to skip it. The operator's reason, given 2026-11-06: no credits remain. Recorded, not inferred.
