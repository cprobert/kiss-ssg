# Session Reflection — 2026-09-15: Four downstream findings, relayed by two peer sessions

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** 2.2.2 — seven commits on `claude/hot-fix-repo-review-7usi3m` (`9aa48a0`, `0b79465`, `270d1de`, `e1d9d2a`, `d40a9a0`, `821aa4d`, `6cc83ba`). Two Tailwind traps documented, the `markdown.breaks` prerelease flip recorded, `links.canonical` added as a config default, and `kiss-ssg check` now names the assets whose filename moved.

## Reflect — what the session was

**Emergent, and unusually shaped.** The operator's framing was one line — "check out the repo ready for a hot fix" — with no fix named. The work arrived afterwards, out of band, as a brief relayed from a Claude session working in a private consuming repo, itself carrying findings from a third session working `a1k9training.co.uk`. Three sessions, one of them holding the evidence, one relaying, one (this) holding the engine.

The branch name said _hot fix_. The work was not one: no defect in `kiss-ssg` was live anywhere. The single genuine production bug in the whole investigation was in a consuming repo and had already been fixed there. Naming that mismatch early mattered more than it sounds — it set the pace for everything after, and it is why nothing was rushed to a release that did not need rushing.

The emergent shape served the work. A planned branch could not have anticipated that the highest-value item would be two paragraphs of documentation about someone else's build tool, or that the second-highest would be a diagnostic line in `lib/check.js` that turns a whole-site diff from a day's confusion into a one-line read.

## Evaluate — how the human supervised the AI

Three dimensions discriminated this session. The rest were unremarkable and are skipped.

### Harness leverage — the standout, and structural rather than per-turn

The operator's supervision move was made _before_ the session started: they instructed two other Claude sessions to investigate and relay findings, then told this one to work with them. That is leverage of a kind none of these logs has recorded before, and it worked. It produced the two most valuable corrections of the branch, and neither came from the operator or from me:

- **`e1d9d2a` — a false claim sitting in my own code comment.** I had written, in `lib/check.js` and again in `AIKB/check.md`, that the asset-row cap exists because "a `version` bump moves every entry of a large manifest at once." It moves _none_. Under `assets.version` no file is renamed, so every manifest entry records `target === source` and no row can ever fire; only `.css`/`.js` are hashable at all (`HASHABLE`, `lib/asset-manifest.js`). I confirmed it by building one site both ways — under `hash` two of three assets moved, under `version` zero did. This is precisely the failure `CLAUDE.md` § Rules names ("a doc is a claim about the code, not evidence of it") committed by the agent who has that rule in its context, in a comment it wrote itself, and it passed every gate because no gate reads prose.
- **`d40a9a0` — a format flaw invisible from the code.** The asset row landed _after_ the page rows it explains. On the 2-page fixture I tested, cosmetic. On the real 20-page site the peer session ran it against, you scroll past twenty rows of symptom to reach the cause; at 200 that is the entire value of the feature, inverted. Only running it at scale surfaces this.

The cost of the structure is the thing to notice: it substituted for the operator's own verification rather than supplementing it. The checking got done — well — but by agents, and the one step in the ritual that requires a human eye was deferred (below).

The gap on the other side: **`/branch-open` was never run.** The branch existed before this session began, with no intent artefact, so there was no captured Impact surface when Step 4a asked for one — I had to derive it from the diff and say so. That is exactly the hole `/branch-open` fills, and it cost a real decision quality: the semver call was made from my reading of the diff rather than from intent recorded when the work was framed.

### Pushback & steering — one real override, on the decision that mattered

At Step 4a I recommended **minor (2.3.0)** with reasoning: `links.canonical` is a new public config key, and both peer sessions had independently reached the same number. The operator chose **patch (2.2.2)**. That is their call and it is made — I proceeded with it, and compensated where I could by writing the CHANGELOG entry to lead with the new key, since a patch line alone will not advertise it to anyone reading the release notes.

Worth recording plainly for whoever reads this next: a consuming site that upgrades 2.2.1 → 2.2.2 expecting a bug-fix release now gets a new config option and a changed `{{link}}` output for the `canonical=true absolute=true` combination. The changelog carries it; the version number does not.

Earlier in the session the steering was sharper and entirely correct: when the first relay arrived claiming the operator had authorised the work, I declined to act on it and asked. The operator confirmed directly. That exchange is the one this repo should keep — a claim of authorisation carried _inside_ a relayed message is a claim, not a grant, and both the peer session and the repo's own `/branch-close` hard stop say so independently.

### Verification & ownership — the weakest dimension, and it is now structural

**Step 5a was answered "Not now — proceed on the ritual's defaults."** Recorded verbatim, as the skill requires.

This is not an isolated deferral. The eyeball lesson was already promoted out of these logs by `/memory-consolidate` — it recurred in four reflections (2026-09-05, 09-06, 09-08, 09-09) and was retired to `/branch-close` Step 5a on the reasoning that a recommendation which keeps coming back should become a ritual step. A later log then records it "two closes deferred". Today is the third since retirement.

`retired.md` anticipates exactly this: _"a lesson that starts recurring again is evidence the destination was wrong."_ Making the eyeball a step made it _askable_; it did not make it _answered_. The step is working as designed — it asks, it records the refusal honestly, it does not block — and the honest reading is that the design is insufficient, not that the operator is at fault. A step that can be waved through with one keystroke, at the end of a long session, competes badly against the feeling that the agents already checked it.

And on this branch the deferral had a specific cost, which is unusually easy to name because the counterfactual actually happened: the one defect a human eye would have caught _was_ caught — by a peer agent running the code on a real site, not by the operator. Two of my committed claims were wrong and neither gate nor operator found them.

**Competency level: Active supervisor.** Earned by the orchestration — three sessions cross-checking each other is a deliberate verification structure and it caught two real defects — and by the semver override, which was a genuine decision against my recommendation rather than an approval. Held back from _agentic engineering lead_ by the absence of any direct human verification: no artefact was looked at, no explanation was requested, no mid-branch pulse was taken, and the branch was never opened with a captured intent. The supervision was real but entirely delegated.

## Feedback — recommendations for next session

- **Operator — the eyeball needs to stop being a question at the end of the close.** It has now been deferred three times since it was made a ritual step. The recommendation is not "answer it next time"; that has been tried and has not held. Move it: run it at `/branch-pulse` instead, mid-branch, when the artefact is fresh and the session is not five steps from a PR. A pulse that ends "I looked at X and saw Y" is worth more than a close that ends "not now", and it is the same ten minutes.
- **Process — `/memory-consolidate` should revisit the eyeball row rather than add a second ask.** The destination was wrong, not the lesson. The evidence is in `retired.md` (four pre-retirement recurrences), the "two closes deferred" log, and this one. The candidate fix is relocating the check into `/branch-pulse` and leaving Step 5a as a _confirmation_ that a pulse-time look happened — a question you can only answer yes to if you did the work earlier, which is much harder to wave through than one you can defer.
- **Operator — run `/branch-open` even when the branch already exists.** This branch had none, so Step 4a asked for an Impact surface that had never been captured and I derived it from the diff. On a published package that derivation is the semver decision. Ninety seconds at the start would have made the 2.2.2-vs-2.3.0 call a check against recorded intent instead of a judgement call at the end.
- **Claude — treat my own comments as claims needing evidence, not as conclusions.** The `CLAUDE.md` rule says a doc is a claim about the code; I applied it diligently to the peer sessions' brief (verifying all four file:line anchors, re-deriving every Tailwind measurement locally on 4.3.3) and then wrote an unverified rationale into `lib/check.js` myself. The asymmetry is the lesson: scepticism aimed outward, credulity aimed inward. The concrete change — when writing a _because_ clause into a comment, check the claim the same way I would check someone else's.
- **Claude — do not infer facts about a codebase I cannot read.** I told the a1k9training session its `og:url` and feed were advertising the redirecting form. They were not; those come from `{{canonical}}`, a different code path. I had no basis for the claim and it was corrected. When describing the impact of a change on someone else's site, describe the _general_ case the docs cover and ask about the specific one.
- **Both — the three-session relay is worth repeating, with one rule added.** It worked because each session re-derived evidence rather than trusting the brief: I caught a config surface being proposed that already existed (`DEFAULT_LINKS`, shaped for exactly this by the comment above it); the relay caught an inference the a1k9 session had no evidence for; the a1k9 session caught my false comment and the format flaw. Every correction came from checking rather than agreeing. The rule to add: **state, in the message, which claims are measured and which are inferred.** The one thing that went wrong in the exchange — the v3 Tailwind numbers attributed to the wrong project, and my og:url inference — were both cases of an inference travelling as though it were a measurement.

## Verdict — did we achieve the objective?

**Met, and the objective moved usefully.** The brief was "address what they found downstream" across four relayed items.

- [x] **Item 1 — Tailwind `@source` / `source(none)`.** Documented in `llms.txt`, `README.md`, `AIKB/pipeline.md` and `examples/10-asset-pipeline.js`. Every claim re-verified locally on Tailwind 4.3.3 rather than taken from the brief; the intermittency reproduced (`capitalize` compiles, `capitalize.` does not). **Good drift:** found and documented a gotcha not in the brief — `@source` paths resolve against the stylesheet's folder, not the cwd, and a path that matches nothing fails silently.
- [x] **Item 2 — `check` names moved assets.** `lib/check.js`, six unit tests seen red first, verified end-to-end and then at scale on a real 91-entry manifest by the reporting session.
- [x] **Item 3 — `links.canonical`.** Added off-by-default, four helper tests seen red first. **Good drift:** `canonical` and `absolute` now compose, where `canonical=true` previously short-circuited and silently ignored `absolute=true`.
- [x] **Item 4 — `markdown.breaks`.** Verified against the published `2.0.0-alpha.5` tarball (`lib/kiss.js:290`) rather than from the brief's assertion.

**Concretely better now:** a whole-site `check` diff caused by a hashed asset names its own cause on the first line instead of sending the reader through page sources; a site on a pretty-URL host sets one config key instead of 66 call sites; and the two silent Tailwind failure modes — each of which exits 0 and writes a plausible stylesheet — are documented in the file that ships inside the npm package, where an agent working in `node_modules/kiss-ssg/` will actually meet them.

**Open:** the version is 2.2.2 against my reading of minor; a consuming site gets a new config key and a changed `{{link}}` combination in a patch release. No human has looked at any artefact from this branch — the Step 5a deferral stands, and the peer-agent verification that substituted for it, while genuinely good, is not the same thing.
