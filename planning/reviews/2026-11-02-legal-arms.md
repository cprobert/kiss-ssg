# `kiss-legal-and-privacy`: the 2026-11-02 arms

Measured on `feat/kiss-legal-and-privacy` at `61a9eee`, with `scripts/arms.mjs`, its first real use. **One run per arm: a signal, not a verdict.**

## What the benches are for

The skill exists to prevent legal and privacy gaps on a small business site. A site that already has a good privacy notice shows "no difference" whatever the skill says (`CLAUDE.md`, the domain-skills paragraph). So both benches have the gaps:

- **a1k9training at `385434a`.** This is the real site before its 2026-11-02 privacy work. It has an enquiry form on ten pages, Google Maps iframes, `youtube-nocookie` embeds (one static, one injected by script), no privacy page, no email address and a locality-only address. 16 of the 18 findings in `test/fixtures/legal-answer-key.json` are visible there; the two marketing items are not.
- **`test/fixtures/legal-weak-site`.** It has 7 planted gaps: no notice, a pre-ticked offers box, a `<mark>` placeholder, Google Fonts, a YouTube iframe, third-party analytics and no address. It ran as a standalone scratch repo (`86f1705`), because `setup` copies a whole repository at a commit and the fixture is a folder in this one.

## How the arms ran

|             |                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session     | One headless `claude -p` session per arm: `claude-opus-5-5`, Claude Code 2.1.316                                                                                                  |
| Engine      | This branch packed (`kiss-ssg-2.9.0.tgz`, sha512 in each `arm.json`). Both arms ran the same engine, including the three new audit checks                                         |
| Plugin      | `main` at `9c525e1` ("without") or this branch at `61a9eee` ("with"), each from `git archive` of that commit. **The variable is this branch's plugin diff, not the skill alone**  |
| Permissions | `--permission-mode acceptEdits`, `--permission-prompts none`, an allow-list (Bash allowed whole) and a deny list for commit, push, remote, gh, publish and deploy. No bypass flag |
| Budget      | `--max-budget-usd` 5 (a1k9) and 2.5 (fixture)                                                                                                                                     |

The brief was the same for all four: "Review this site's privacy and legal pages before launch, fix what you can, and tell me what only I can decide. You cannot ask me questions now; list what you would ask."

**`--setting-sources local` does not isolate user-level plugins.** Three of the operator's user plugins loaded in every arm: `cc-plugin-agents-md`, `cc-plugin-telemetry` and `cc-plugin-plugin-authoring`. This was the same in all four arms, so it doesn't bias the comparison, but it answers the contract's unverified row.

| Arm             | Cost  | Time  | Turns | Skill used                                                    | Commit attempts |
| --------------- | ----- | ----- | ----- | ------------------------------------------------------------- | --------------- |
| a1k9-without    | $1.42 | 250 s | 32    | none                                                          | 0               |
| a1k9-with       | $1.75 | 788 s | 49    | `kiss-legal-and-privacy`, then `uk.md` and `owner-handout.md` | 0               |
| fixture-without | $0.41 | 98 s  | 17    | none                                                          | 0               |
| fixture-with    | $0.54 | 109 s | 16    | `kiss-legal-and-privacy`                                      | 0               |

The total was **$4.12**.

## Marking

The operator chose the marker: **a fresh agent marking blind** (2026-11-02). Each run became a packet holding its final message and its full diff against the baseline. Every mention of the skill's name, its reference files and `kiss-ssg:` skill ids was redacted, and a grep found none left. The packets were labelled X and Y, mixed across benches (a1k9: X = with; fixture: X = without), and the key was withheld.

**Limits.** The marker is the same model family as the agents it marked. The redaction cannot hide the skill's style: its P1 tables, its "not legal advice" line and its handout.

## Results

| Bench                | With                          | Without                  |
| -------------------- | ----------------------------- | ------------------------ |
| a1k9 (16 applicable) | **13 hit, 3 partial, 0 miss** | 2 hit, 8 partial, 6 miss |
| fixture (7)          | 6 hit, 1 partial              | 7 hit                    |

**On a1k9 the skill changed the outcome.**

The run without it:

- left `course.hbs`'s YouTube iframe loading before consent, while its new notice said Google content loads only on a click;
- left the developer out of the recipients;
- stated unconfirmed owner facts without marks ("not sold, not shared for marketing", "after that it is deleted", "within one month");
- told the owner "the deposit probably can't be kept" instead of flagging the question for an adviser;
- wrote no handout.

The run with the skill:

- measured the home video's storage in a browser and found the same two keys the 2026-11-02 review did;
- made the course video and both maps click-to-load, and put the home video to the owner as remove, click-to-play or accept in writing;
- asked whether the developer can see enquiries;
- marked the transfer safeguard to confirm;
- covered the six owner habits in a handout;
- sent the deposit question to a solicitor.

**On the fixture there was no difference**, and it is reported as none. The fixture's gaps are the obvious kind: the engine's audit flags most of them for both arms, and a capable agent fixes them without the skill. Two shortfalls of the with-skill run trace to the skill:

1. **It left Google Fonts as a question.** The skill lists third-party fonts in the inventory, but never says that self-hosting the font (with its licence) is the page fix.
2. **It removed the owner's analytics tag on its own judgement.** The skill never says that keeping, switching or dropping a tracking tag is an owner decision.

**One marker "error" is the marker's own.** It charged both with-skill runs with stating the 30-day complaint acknowledgement and the "Information Commission" as fact, calling them unverified. Both are in force and were checked at source on 2026-11-02:

- UK GDPR Art. 13(2)(ca), in force from 19 June 2026, at legislation.gov.uk;
- the Information Commission's succession on 30 September 2026, in the gov.uk notice.

**Other errors the marker found are real and not the skill's:**

- fixture-without's form line says "only to reply" beside an offers box;
- fixture-with's handout keeps a WhatsApp item the fixture gives no evidence for, against the template's "delete the lines that do not apply".

## What this harness cannot say

- **One run per arm.** a1k9-with took three times as long (788 s, against 250 s), much of it in the browser measurement.
- **Neither bench has a special-category form, a consent banner or a price,** so the legal-review fixes in `61a9eee` (Art. 9, the consent standard, DMCC s.230) are not exercised by either bench.
- **The without arm had the new audit checks too.** The engine's contribution is in both arms; the comparison measures the skills on top of it.
- **`summarise` counts only `Read` calls as skill reads.** The clean room below read `kiss-legal-and-privacy/SKILL.md` with `cat` in Bash, and the summary's "SKILL.md reads" count showed 0 for it. Grep the transcript before concluding that a skill went unread.

## Clean room (2026-11-02, plugin at `6d98b98`)

The aim was to show what an agent does with only what ships. The setup was:

- **Starting point:** an empty repo with a bare `package.json`, set up by `scripts/arms.mjs setup`.
- **Engine:** this branch's packed engine.
- **Plugin:** the plugin at `HEAD`.
- **Brief:** "a sole trader in Cardiff offering home bicycle repairs", three pages, and a contact form with a newsletter sign-up, "ready to launch, including whatever the law needs". No questions allowed; list the guesses.

**Run:** $1.59, 336 s, 41 turns, no commit attempts.

**Route:** it invoked `kiss-site-new`, followed that skill's link to `kiss-legal-and-privacy/SKILL.md` and read it (with `cat`), and listed its references.

**Result:** `npx kiss-ssg check router.js` in the copy, run by the main session: exit 0, 6 pages, 0 failed. The only audit finding is `placeholder-left`, which is expected because the owner's facts are marked. There is no `privacy-link-missing` and no `checkbox-prechecked`.

**What it built:**

- a privacy page;
- the line beside the form;
- an **unticked** newsletter box;
- business details in the footer, every fact marked;
- an owner handout.

**How it handled the owner and the law:**

- It measured storage after a 10-second idle wait, a scroll and a click.
- It listed 9 guesses and 16 questions.
- It put a published home address to the owner as "choosing not to meet that rule; ask an adviser before relying on any other address".
- It said prices must be the total the customer pays.
- It sent the 14-day cancellation question to a solicitor rather than drafting terms.
