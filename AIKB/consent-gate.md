# consent-gate.js

## Responsibility

The consent manager's server side:

- the markup that holds a script back until the visitor allows it;
- the check that a rendered page is wired so that it can be.

`{{consentScript}}` in `lib/handlebars-helpers.js` calls the first; `lib/kiss-page.js` calls the second on every rendered HTML page. An embed's markup is `lib/embed.js`'s (`AIKB/embed.md`). The attribute vocabulary is the contract's (`planning/plans/2026-11-02-consent-manager.md` §3), and `lib/consent-client.js` reads the same names.

## Public interface

- **`gatedScript(name, service, { consent, params, body, partialHtml, src })` → `string`.** What `{{consentScript}}` writes.
  - **No body or partial:** the service's `inline` script, then its `src` (or `src=` from the call). Each is `<script type="text/plain" data-kiss-service data-kiss-consent [data-src]>`. The `inline` script's placeholders are filled by `fillScript` (each value URL-encoded, then every character of that outside `[A-Za-z0-9_.-]` written as `\uXXXX`), the `src`'s by `fill` (URL-encoded).
  - **A body (block form) or a rendered partial of a service that is not gated** (necessary, or a Google tag under advanced mode) is written exactly as the author wrote it. Until 2026-11-03 it went through the rewrite below, which drops `defer` because the queue keeps order; a plain script never enters the queue, so a `defer` head script lost it and ran before `<body>` existed (found by the Codex review).
  - **A body (block form) or a rendered partial of a gated service:** every `<script>` in it is rewritten into that form:
    - `src` becomes `data-src`, `async` becomes `data-async`, and `type="module"` becomes `data-type="module"`;
    - `defer` is dropped, because the queue already runs in document order;
    - other attributes are kept;
    - attribute values are read decoded, as a browser reads them, and escaped once on the way out, so `src="/s.js?a=1&amp;b=2"` stays exactly that. Until 2026-11-03 they were read raw and escaped again, which wrote `&amp;amp;` and changed the URL loaded after consent (found by the Codex review);
    - everything around the scripts is kept byte for byte, and a data block (`application/ld+json`) is left alone;
    - which scripts are rewritten is `scriptKind` (`lib/consent.js`): every type a browser runs, `application/x-javascript`, `text/javascript1.5`, a padded `text/javascript` and `language="javascript"` included, and `language` is dropped with `type`. Until 2026-11-03 a hand-written list of six types let those through ungated, and the wiring check and the audit each had a copy of it (found by the Codex review).

    A body with no `<script>` tag is taken as one script's text.

  - **Not gated:** a `necessary` service, or a Google tag under `google.mode: 'advanced'`, is written as a plain `<script>`.
  - **Throws** on:
    - a missing `{param}` value;
    - `document.write` or `writeln` in an inline body;
    - an `<iframe>` in a block or partial (the message points at `{{embed}}`);
    - a service with nothing to load.
- **`consentWiringProblems(html)` → `string[]`.** One sentence per problem:
  1. gated markup, or a settings control, with no consent head. A facade embed (`data-kiss-embed-facade`, `{{embed}}` with no `config.consent`) is not gated markup: it wires itself and remembers nothing;
  2. a head with no banner, or more than one head or banner;
  3. an executable script before the head's;
  4. one service's script `src` twice on a page.
- **`findDocumentWrite(js)` → `boolean`.**

## Depends on

`htmlparser2` (`Parser`, tokenising with source indices); `./consent.js` (`fill`, `fillScript`, `gatingOf`, `scriptKind`).

## Depended on by

`lib/handlebars-helpers.js` (`consentScript`); `lib/kiss-page.js` (`consentWiringProblems`). Tests: `test/unit/consent-gate.test.js`, and `test/integration/consent.test.js`, which builds `test/helpers/consent-site.js`.

## Non-obvious behavior

- **The block rewrite uses a tokenizer, not a regex.** `htmlparser2`'s `startIndex` and `endIndex` locate each `<script>` in the source, and only those ranges are replaced. Getting a script tag wrong here would ship a third party ungated, which a regex that misreads one attribute could do silently. The audit's tolerant regex reading is a different job, because a missed fact there is only a missed finding.
- **`document.write` is refused** because a script revived after consent runs after the page has parsed. There `document.write` replaces the whole document, and in the serial queue `load` never fires (contract Appendix A, S3; `AIKB/upstream.md`). A `src` script's body cannot be seen, so the guide states that limit. The check runs on the filled `inline` text, so a placeholder value that holds `document.write(` is now inert (its parenthesis is written as a `\u` escape) and does not trip it, which is right: it calls nothing. A service's own `inline` that calls it is still refused.
- **An `inline` placeholder is filled as a script body, not a URL** (security hardening, 2026-11-06). Under `fill`, `encodeURIComponent` left `'`, `(` and `)` alone, so `{{consentScript "gtag" id=model.gaId}}` with `G-X'-alert(1)-'` closed the preset's string literal and called `alert`. `fillScript` (`AIKB/consent.md`) closes that while keeping the URL-encoding, so a placeholder the site's `inline` puts inside a URL or an HTML string stays encoded and inert. The unit tests evaluate the emitted script, gated and (under advanced mode, through `html-minifier-terser` with `minifyJS`) ungated, and compare the value gtag was handed with `encodeURIComponent` of the original; two more evaluate a placeholder inside an `innerHTML` string and inside a URL (one parameter, no markup from the value), and one pins an unquoted `init()` as a syntax error that calls nothing.
- **No scheme check on a script's `src`** (`src=` from the call, or the service's `src`): a script URL from model data is code whatever its scheme, so a check there would promise something it cannot keep (the security-hardening contract, 2026-11-06). A `src` from the call goes in as written, escaped for the attribute only.
- **The wiring check reads the rendered bytes.** It runs on HTML outputs only, before minifying and before the dev live-reload script is added.
  - It catches a hand-written gated tag as surely as a helper's.
  - It fails the page in a production build, with `consent: <problems> (<view>)`, and warns in dev, the `{{link}}` stance. A gated service with no consent head would never run, and a script ahead of the head would run before the Consent Mode default is set.
  - JSON-LD and other data blocks before the head are fine.
  - A page with no `data-kiss-` attribute at all costs one `includes` and is never parsed.
- **A service loaded twice on one page is a problem,** because the client would run it twice. Two `{{embed}}` of one service are not: each embed is its own frame.
