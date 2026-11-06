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

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
