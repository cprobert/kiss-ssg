# 04. Fetch redirects with custom headers

**Model:** Sonnet. **Impact surface:** public behaviour (patch with an Upgrading note).

## Objective

A URL model fetched with `fetch.headers` set must not send those headers to a different origin
when the endpoint redirects.

## Decision already made (Fable, 2026-11-10)

- With no custom headers: behaviour is unchanged. Redirects are followed as today.
- With custom headers: a redirect to the **same origin** is followed, at most 5 times. A
  redirect to **another origin** fails that model, with an error naming both origins.
- No new config key. No response size cap: the 10-second timeout already bounds a response, and
  the limit is recorded in the AIKB doc instead.

## Paths in scope

- `lib/fetch-policy.js`
- `test/unit/fetch-policy.test.js`
- `AIKB/fetch-policy.md`
- `GUIDE.md` (§ Remote models, one or two sentences)

Out of scope: `lib/model-resolver.js`, `lib/config.js`, `llms.txt`, retries, caching.

## Assumptions

- `attempt` calls `fetchImpl(url, { headers, signal })` with no `redirect` option
  (`lib/fetch-policy.js:207-211`). Measured.
- URLs in errors go through `redactUrl` (`lib/fetch-policy.js:232`). Measured. The new error must
  too, and must never print a header value.
- Tests inject `fetchImpl`. Measured by the test-quality review. Stubs must keep working when an
  extra option is passed.
- With `redirect: 'manual'`, Node's `fetch` returns the 3xx response with its `location` header
  readable. Inferred. Step 1 checks it; if it is false, stop and ask.

## Steps

1. Write a test using a real `http.createServer` (as `test/integration/lifecycle.test.js:73`
   does) with two servers on different ports: the first redirects to the second, the second
   records the headers it receives. Fetch through the policy with a custom header set.
   verify: `npx vitest run test/unit/fetch-policy.test.js -t redirect` fails because the second
   server received the header. Record the output.
2. Add tests for: same-origin redirect followed with headers; more than 5 same-origin redirects
   fails; no custom headers and a cross-origin redirect still succeeds.
3. Implement in `attempt`, or a helper beside it. The error message says what happened and what
   to do: fetch the final URL directly, or remove the header.
   verify: the same command passes.
4. Update `AIKB/fetch-policy.md` and `GUIDE.md`. Run any snippet you add to `GUIDE.md`.
5. verify: `npm run gates`.

## Stop and ask

- `redirect: 'manual'` does not expose the `location` header.
- A test in another file starts failing because its stub rejects the new option.
- The work seems to need a config key.

## Fast feedback

```sh
npx vitest run test/unit/fetch-policy.test.js
```
