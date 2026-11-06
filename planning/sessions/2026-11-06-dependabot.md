---
branch: chore/dependabot
base: main
status: closed
opened: 2026-11-06
consolidated: 2026-11-06
---

# Session — 2026-11-06: Dependabot version updates

## Intent (captured at /branch-open)

**Objective:** Keep kiss-ssg's dependencies secure and current by adding a `.github/dependabot.yml` for weekly version updates, alongside the Dependabot alerts and security fixes already turned on in the repository's GitHub settings (2026-11-06, outside git).

**Success criteria:**

- [ ] `.github/dependabot.yml` covers the `npm` ecosystem (the root `package.json`, the only tracked manifest) and `github-actions` (`ci.yml`, `static.yml`), weekly.
- [ ] Minor and patch bumps arrive grouped (one PR per ecosystem per week); a major (such as glob 13 → 14) arrives as its own PR.
- [ ] GitHub accepts the file: after the push, the repository's Dependabot page shows the update jobs with no configuration error (measured, not assumed).
- [ ] Dependabot alerts and automated security fixes are confirmed enabled through the API (done at the open: `vulnerability-alerts` 204, `automated-security-fixes` `{"enabled":true}`).
- [ ] `npm run gates` pass.

**Non-goals / out of scope:** Taking glob 14 or any other bump on this branch. Those arrive as Dependabot PRs and each is reviewed on its own. Dependabot for the fleet sites is out of scope too.

**Impact surface:** tooling & docs. Repository configuration only; nothing ships in the tarball.

**Expected shape:** planned. One config file.

### Amendments

- 2026-11-06: the operator chose to push straight to `main` rather than run `/branch-close`, because the change is too small for the full ritual: one repository config file, gates green, nothing in the tarball. So there is no PR, no version bump and no reflection. The "GitHub accepts the file" criterion can only be checked once the file is on `main`.

## Pulse log

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
