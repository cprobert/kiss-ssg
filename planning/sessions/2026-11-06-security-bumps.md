---
branch: fix/security-bumps
base: main
status: open
opened: 2026-11-06
---

# Session — 2026-11-06: Clear the Dependabot security alerts

## Intent (captured at /branch-open)

**Objective:** Clear the 17 open Dependabot alerts that switching alerts on surfaced (2 critical, 4 high, 10 moderate, 1 low). The two handlebars injection criticals ship in every site's dependency tree, so release the fix as a kiss patch with an upgrade note.

**Success criteria:**

- [ ] `handlebars` is at ≥ 4.7.10, and the `package.json` range is raised so a site resolving kiss cannot get a vulnerable one (`^4.7.10`).
- [ ] `glob` is at ≥ 14.0.2 (a major bump). Its breaking changes are read against every call site in `lib/`, `bin/` and `scripts/` before the bump, and the result is stated.
- [ ] The transitive alerts are cleared in the lockfile: `brace-expansion` ≥ 5.0.12, `source-map-js` ≥ 1.2.2, `minimatch` at a fixed version, `vite` ≥ 8.2.4, `@vitest/mocker` ≥ 5.0.3. Overrides are used only if no parent release takes them.
- [ ] `npm audit` reports 0 vulnerabilities (measured; the output is quoted in the pulse).
- [ ] `npm run gates` pass, and every example builds (`npm run eg1` … `eg12`; eg8 exits 1 by design).
- [ ] The built output of the docs site and at least one example is byte-compared before and after the bump. Any difference is explained, not assumed harmless.
- [ ] A patch version bump with a `CHANGELOG.md` entry whose `### Upgrading` note tells sites to take it (`npx kiss-ssg@latest upgrade`) because of the handlebars fix.
- [ ] After merge, the repository's Dependabot alert list shows 0 open (measured).

**Non-goals / out of scope:** Dependency bumps beyond what the alerts need (no general refresh), any change to handlebars usage or API, and upgrading the fleet sites (that is each site's own `upgrade`).

**Impact surface:** engine internals. Runtime dependency versions change, with no API change, so it is a patch.

**Expected shape:** planned. glob 14 is the one unknown.

**Delegation convention:** none: one session.

### Amendments

- 2026-11-06: the criterion "`npm audit` reports 0" cannot be met. eslint (the latest, 10.14) and `@eslint/config-array` still require minimatch `^10`, which the advisory covers in full. The operator chose to document and dismiss: it is recorded in `AIKB/upstream.md`, and the Dependabot alert is dismissed after merge as tolerable risk (dev-only). The criterion now reads: 0 runtime findings, and the 4 dev-only findings are that one eslint → minimatch chain.
- 2026-11-06: vitest and `@vitest/coverage-v8` move together (coverage pins vitest exactly), and `npm install` took them to 5.1.0, a dev-only minor. postcss moved 8.5.28 → 8.5.32 along with source-map-js. A first attempt that also updated sass and eslint was reverted as a general refresh, which is a non-goal.
- 2026-11-06: scope widened by the operator to have the docs site (`docs.js`, `src/`) use kiss's current features. A read of `llms.txt` against the site offered five items. The operator chose three: `{{image}}` for the header logo and the homepage screenshots (the audit's `img-not-responsive` on all 14 pages), listing examples 13 and 14 with the page's count corrected, and self-hosting Google Fonts and highlight.js (all 3 third-party origins). `cleanBuild: 'atomic'` and `host: 'github-pages'` were offered and not chosen. Criteria added: `kiss-ssg check docs.js --summary` reports no audit finding and 0 third-party origins; the Examples page lists all 14; a screenshot of the home page and a guide page at 375 and 1440 px is shown to the operator before the close. Nothing here ships in the tarball, so the 2.12.3 changelog entry stays the security note.
- 2026-11-06: `{{image}}` made the build's image variants hashed files, and the audit then reported `host-unset: cache headers`. So `host: 'github-pages'` was put to the operator again, and they added it. `cleanBuild: 'atomic'` stays unchosen.

## Pulse log

- **2026-11-06** — Security criteria met. `npm ls` shows handlebars 4.7.10 and glob 14.0.4. `npm audit --omit=dev`: 0 vulnerabilities; the full audit has 4 moderate, all the one dev-only eslint → minimatch chain (amended). Gates green on `ce368b1`. Docs and 14 examples byte-identical across the dependency bump. Docs criteria met: `check docs.js --summary` gives `ok — 14 pages, 0 failed` with no audit finding and no third-party origin, and the Examples page lists 14. Not yet: the 2.12.3 bump and changelog (close), and 0 open alerts (after merge). Impact surface moved to engine internals plus the docs site through Amendments; still a patch, tarball unchanged at 411 files. **Eyeball: looked**: the operator opened the homepage screenshots at 1440 and 375 (self-hosted fonts, `{{image}}` cards) and they match. The production AVIF/WebP markup has been read but not loaded in a browser until the site is live. Offer: vendoring highlight.js 11.9.0 (invisible to Dependabot), **kept** by the operator. Decision: ready to close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
