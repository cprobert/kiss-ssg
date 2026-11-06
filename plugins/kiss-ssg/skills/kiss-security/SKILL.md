---
name: kiss-security
description: Build and review a kiss-ssg site's security headers in proportion to a static site's small attack surface — kiss's set-and-forget baseline, and the optional steps with their upkeep (a hash-based CSP, framing, COOP, HSTS on subdomains, Subresource Integrity). Use for "security headers", "HSTS", "CSP", "Content-Security-Policy", "clickjacking", "X-Frame-Options", "SRI", "is my site secure".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Security

A static site has no server code, no database and no login, so its attack surface is small. The aim is proportion: the protections that cost nothing once set, and the stronger ones only when a site has a reason and the owner can keep them up. A header that blocks the owner's next widget, or locks visitors out of a subdomain, is a security choice that has failed.

Every rule here traces to a verified finding in kiss's research (`planning/specs/2026-10-30-privacy-and-security-research.md` in the kiss-ssg repository, second pass): OWASP's HTTP Headers Cheat Sheet, MDN, web.dev and each host's own documentation. What a site says to people about their data is [`kiss-legal-and-privacy`](../kiss-legal-and-privacy/SKILL.md)'s, not this skill's.

## In a kiss site

- **`securityHeaders: true`** writes the baseline below into the host's header file, beside kiss's cache headers, chosen by `host` (`node_modules/kiss-ssg/GUIDE.md` § Security headers). Off by default.
- **The site's own headers live in `src/assets/_headers`** (Netlify, Cloudflare Pages), copied into the build. kiss appends its marked blocks after the site's lines and never adds a header the site's `_headers` already sets, for any path. On Firebase, kiss writes `security-headers.firebase.json` for the owner to merge into `firebase.json` once; on Vercel, the headers go in `vercel.json`'s `headers` property by hand; GitHub Pages cannot set headers.
- **The build's audit already catches what a static build leaks:** `stray-file` (a source map, a log, a dotfile in the build) and `debug-dump` (a `debug.json` of every page's models). `kiss-site-review` says the fix for each.

## Build mode

1. **Set `host` and `securityHeaders: true`.** That sends, on every page: `Strict-Transport-Security: max-age=63072000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: geolocation=(), camera=(), microphone=()`. Never add `X-XSS-Protection`: it is deprecated and can open holes in a safe site.
2. **On Firebase,** merge the fragment into `firebase.json`, and tell the owner that Firebase replaces HSTS on `*.web.app`: only the custom domain serves it.
3. **Stop there unless the site has a reason** for one of the optional steps below. Say which you left out and why, so the owner can choose later.

## The optional steps, and what each costs

Offer these; never add one the owner has not chosen. Each goes in the site's own `src/assets/_headers` (or its host's config), where the owner can see it.

- **HSTS on subdomains (`includeSubDomains`) and `preload`.** Both are slow to undo: only `max-age=0` sent over HTTPS turns HSTS off, it does not clear a subdomain's own policy, and leaving the preload list takes longer still. Add them only once **every** subdomain serves HTTPS; check each one first. The preload list needs `max-age` of at least `31536000` with `includeSubDomains`.
- **A Content-Security-Policy.** For a pre-built site, the strict form uses **hashes, not nonces** (a nonce must be new on every response, which a static file cannot give): `script-src 'sha256-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`, one hash per inline script. **The cost:** every inline script edit changes its hash, and every third-party widget the owner adds later is blocked until the policy changes. **Roll it out report-only first** (`Content-Security-Policy-Report-Only`), and send both `report-to` and the deprecated `report-uri`, since browsers do not all support `report-to`. An allowlist CSP, or even `default-src https:`, is weaker but still better than none. Do not copy OWASP's generic baseline CSP whole: its `default-src 'self'` blocks every third-party font, script and embed.
- **On GitHub Pages,** a `<meta http-equiv="Content-Security-Policy">` as the first `<meta>` in `<head>` is a partial substitute. It **cannot carry `frame-ancestors`, `report-uri` or `sandbox`, and cannot be report-only**, so it gives no clickjacking protection and no rollout.
- **Denying framing** (`frame-ancestors 'none'` in a CSP, and `X-Frame-Options: DENY` for older browsers) stops clickjacking. **The cost:** nothing can show the site in a frame, which breaks a learning package in Moodle and any page that embeds this one. Never on a site that builds learning packages.
- **`Cross-Origin-Opener-Policy: same-origin`.** **The cost:** it can break pop-up windows the site relies on, such as a payment or sign-in window.
- **Subresource Integrity** (`integrity` on a third-party `<script>` or stylesheet) works only with a version-pinned URL: on a floating URL, any change to the file fails the hash and the browser blocks it. For a vendor script that updates in place, leave `integrity` off and restrict it another way. kiss's build fails if it minified or purged a file after its hash was taken (`node_modules/kiss-ssg/GUIDE.md` § Checking a build).

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, one row per cause. A header the site records as a choice is not a finding.

1. **Read the live site's headers**, not the files: `curl -sI https://<the site>/` and one inner page. On Firebase, check the custom domain, not `*.web.app`. A header in `_headers` that the response does not carry is a deploy finding.
2. **Check against the baseline:** the four headers present; no `X-XSS-Protection`; HSTS without `includeSubDomains` unless every subdomain serves HTTPS (try each one the owner names).
3. **Check each optional step the site has taken** against its cost above: a CSP that blocks a widget the owner uses, framing denied on a site that builds learning packages, `integrity` on a floating URL.
4. **Read the build's audit** for `stray-file` and `debug-dump`.

## Not yet researched

kiss's research verified nothing on these, so this skill states no rule for them: form spam and abuse (honeypots, time checks, a host's form handling, Turnstile, reCAPTCHA, hCaptcha, and whether a CAPTCHA needs consent), click-to-load embeds, self-hosting scripts, mixed content, secrets in the build pipeline, npm supply-chain controls, `security.txt` and `rel="noopener"`. If the owner asks, say it is not yet researched, and do not answer from memory.
