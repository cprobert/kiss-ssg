# consent-gate.js

## Responsibility

The consent manager's server side:

- the markup that holds a service back until the visitor allows it: gated scripts and click-to-load embeds;
- the check that a rendered page is wired so that it can be.

The helpers in `lib/handlebars-helpers.js` call the first; `lib/kiss-page.js` calls the second on every rendered HTML page. The attribute vocabulary is the contract's (`planning/plans/2026-11-02-consent-manager.md` §3), and `lib/consent-client.js` reads the same names.

## Public interface

- **`gatedScript(name, service, { consent, params, body, partialHtml, src })` → `string`.** What `{{consentScript}}` writes.
  - **No body or partial:** the service's `inline` script, then its `src` (or `src=` from the call). Each is `<script type="text/plain" data-kiss-service data-kiss-consent [data-src]>`.
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
    - an `<iframe>` in a block or partial;
    - a service with nothing to load.
- **`embedMarkup(name, service, { consent, params, src, title })` → `string`.** What `{{consentEmbed}}` writes:
  - a `div.kiss-embed[data-kiss-embed][data-kiss-consent]` holding a `[data-kiss-consent-ui]` notice with **Load it** and **Always allow** buttons (wording from `ui.text`, `{provider}` filled);
  - the provider's own link (`embed.watch`), omitted when it has none or a placeholder cannot be filled;
  - the iframe inside `<template data-kiss-embed-frame>`.

  A `necessary` service gets the plain iframe. **Throws** with no title, or no src.

- **`consentWiringProblems(html)` → `string[]`.** One sentence per problem:
  1. gated markup, or a settings control, with no consent head;
  2. a head with no banner, or more than one head or banner;
  3. an executable script before the head's;
  4. one service's script `src` twice on a page.
- **`findDocumentWrite(js)` → `boolean`.**

## Depends on

`htmlparser2` (`Parser`, tokenising with source indices); `./consent.js` (`fill`, `gatingOf`).

## Depended on by

`lib/handlebars-helpers.js` (`consentScript`, `consentEmbed`); `lib/kiss-page.js` (`consentWiringProblems`). Tests: `test/unit/consent-gate.test.js`, and `test/integration/consent.test.js`, which builds `test/helpers/consent-site.js`.

## Non-obvious behavior

- **The block rewrite uses a tokenizer, not a regex.** `htmlparser2`'s `startIndex` and `endIndex` locate each `<script>` in the source, and only those ranges are replaced. Getting a script tag wrong here would ship a third party ungated, which a regex that misreads one attribute could do silently. The audit's tolerant regex reading is a different job, because a missed fact there is only a missed finding.
- **`document.write` is refused** because a script revived after consent runs after the page has parsed. There `document.write` replaces the whole document, and in the serial queue `load` never fires (contract Appendix A, S3; `AIKB/upstream.md`). A `src` script's body cannot be seen, so the guide states that limit.
- **The wiring check reads the rendered bytes.** It runs on HTML outputs only, before minifying and before the dev live-reload script is added.
  - It catches a hand-written gated tag as surely as a helper's.
  - It fails the page in a production build, with `consent: <problems> (<view>)`, and warns in dev, the `{{link}}` stance. A gated service with no consent head would never run, and a script ahead of the head would run before the Consent Mode default is set.
  - JSON-LD and other data blocks before the head are fine.
  - A page with no `data-kiss-` attribute at all costs one `includes` and is never parsed.
- **A service loaded twice on one page is a problem,** because the client would run it twice. Two `{{consentEmbed}}` of one service are not: each embed is its own frame.
