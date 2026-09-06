# fetch-policy.js

## Responsibility

Applies `config.fetch` — headers, timeout, retries and an on-disk cache — to a single URL model request, and hands back the parsed body. Everything the engine does between "here is a URL" and "here is JSON" lives here; `model-resolver.js` keeps only the dispatch on model shape.

## Public interface

- `async fetchModel(url, { fetchImpl = globalThis.fetch, logger, headers, timeout, retries, cache })` → `Promise<data>` — the parsed JSON body of a 2xx response. Every policy key is optional and falls back to `DEFAULT_FETCH` from `config.js`, so a caller that passes only `fetchImpl`/`logger` gets today's behaviour plus the default timeout. Rejects with an `Error` on a non-2xx response, a network failure or a timeout.

## Depends on

`fs-extra`; `./utils.js` (`hashId`, `posixPath`); `./config.js` (`DEFAULT_FETCH`).

## Depended on by

`lib/model-resolver.js`.

## Non-obvious behavior

- **Order of operations: cache read → fetch (headers + timeout) → non-2xx guard → retry decision → parse → cache write.** The cache is consulted before anything else, so a cached model costs no network at all; the body is written only after a 2xx response has parsed, so an error envelope can never become a cache entry (the guard that `model-resolver.js` gained for the same reason — review finding C2 — stays authoritative over the cache).
- **The cache key is a hash of the URL _and_ the header set**, with the header entries sorted so key order cannot fork the identity. The same URL fetched with two different bearer tokens is two different identities upstream, and one build's body must never be served to the other's request.
- **The cache has no TTL and no expiry sweep.** A consumer clears the directory (or a single `<hash>.json` inside it) to refetch. That also makes stale-on-error unreachable rather than merely unimplemented: an entry is only ever written after a success, and once written it is hit before any request is made, so there is no state in which a fetch fails _and_ a cached body exists. Stale-on-error only becomes a real option if a TTL is added — which is why `cache` is a plain directory string, not a `{ dir, staleOnError }` object.
- **An unreadable cache entry is a miss, not a failure**: a truncated or hand-edited file logs one warning and the request goes to the network. A half-written file (a build killed mid-write) must not poison every later build.
- **The timeout is a `Promise.race` as well as an `AbortController.abort()`.** The abort is what a real `fetch` needs; the race is what makes the timeout hold for a `fetchImpl` that ignores its signal — the injected seam is a test stub or a polyfill as often as it is Node's `fetch`, and one that hangs would otherwise hang the whole build with nothing to report. The losing attempt gets a no-op `.catch()` so the abort's own rejection is never unhandled.
- **A 4xx is never retried, a 5xx and a network error are.** A 4xx is the server rejecting _this_ request — repeating it cannot change the answer, and hammering an auth failure can get a key locked. Backoff is linear (`200ms × attempts`), deliberately short: this is a build, not a daemon.
- **The attempt count is named in the rejection only when more than one attempt was made** (`… (after 3 attempts)`). With the default `retries: 0` the message is byte-identical to the one the resolver threw before this module existed, so nothing reading build output has to change for a site that never configures retries.
