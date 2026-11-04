# Embeds: the 2026-11-04 clean room, before

Measured on `feat/embeds` at `b056e1d` (plugin and engine identical to `main` at `c57de88`), with `scripts/arms.mjs`. **One run: a signal, not a verdict.**

## How it ran

|         |                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site    | `kiss-ssg init --no-install` in an empty folder, committed as a scratch repo (`a3f580c`). No `config.consent`, one page, no stylesheet                                                                                          |
| Engine  | this branch packed, `kiss-ssg-2.11.2.tgz`, installed `--no-save`                                                                                                                                                                |
| Plugin  | `plugins/kiss-ssg` at `b056e1d`, from `git archive`                                                                                                                                                                             |
| Session | one headless `claude -p`, `claude-opus-5-5`, Claude Code 2.1.318, `acceptEdits`, the arm allow-list and deny list, no bypass flag, budget $3. User plugins loaded too, as on 11-02                                              |
| Brief   | "Add this YouTube video to the home page, under the introduction: https://www.youtube.com/watch?v=dQw4w9WgXcQ. You cannot ask me questions now. When you are done, run the build check, and list every place you had to guess." |

Cost $0.41, 59 s, 11 turns, 0 commit attempts.

## What it read

- `kiss-page-add` (Skill tool), then `kiss-build-check` (Skill tool) at the end.
- `grep -i "embed|youtube|iframe"` over `node_modules/kiss-ssg/llms.txt`, which found the `consentEmbed` line.
- `grep -B2 -A25 consentEmbed` over `GUIDE.md`: it read the helper's documentation.
- `sed -n 40,80p` of `kiss-legal-and-privacy/SKILL.md`, and a `grep "facade|poster"` over every skill, which reaches `kiss-front-end`'s facade sentence.

`summarise` reported "SKILL.md reads (0)": every skill file it read went through `sed` or `grep`. This is the `transcript.mjs` undercount the 11-02 log recorded, seen again.

## What it built

A hand-built facade in `src/pages/index.hbs`, 32 lines:

- a `<figure>` with a hidden `<button>` that a script reveals, and a caption with a link to YouTube and a line saying YouTube will store data;
- an inline `<script>` that creates a `youtube-nocookie.com` iframe with `?autoplay=1` on the click;
- inline styles, because the starter has no stylesheet;
- the video's title written from memory, unverified (it said so).

It gave its reason in the final message: "Your site has no cookie banner, and the video is its only outside service, so a click-to-load button means you don't need one." That sentence is `kiss-legal-and-privacy/SKILL.md:51` ("A site whose only third party is one video or map, and that asks about nothing else, may use a click-to-load facade and no banner") applied as written, and `kiss-front-end/SKILL.md:22` ("Only on a site without `config.consent` is it a hand-built click-to-load facade") confirms it.

## Measured in Chromium (2026-11-04)

The arm's build, served over HTTP, a clean profile, 6 s after load, then 6 s after a click on the button:

| Moment       | Third-party requests | Cookies | Storage                                                                                                |
| ------------ | -------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| Before click | 0                    | none    | none, in the page's only frame                                                                         |
| After click  | 13                   | none    | the `youtube-nocookie.com` frame: `localStorage` `ytidb::LAST_RESULT_ENTRY_KEY`, IndexedDB `YtIdbMeta` |

After the click, requests went to `youtube-nocookie.com`, `fonts.gstatic.com`, `www.google.com`, `ssl.gstatic.com` and `jnn-pa.googleapis.com`. The page stores nothing before the click, so the result is sound. It was simply not the engine's.

## What this says

- **Discoverability by search is not the gap.** The arm searched `llms.txt` for "embed", found `consentEmbed`, and read its GUIDE section. The cheap fixes the branch planned (naming YouTube on the `llms.txt` line, and video, embed and map in `kiss-front-end`'s description) would not have changed this run.
- **The skills send it away on purpose.** Both skills allow a hand-built facade on a site with no `config.consent`, and the helper exists only under `config.consent`, which brings the banner and the cookie page with it. For one video, the agent made a reasonable choice: 32 lines of its own rather than a banner the legal skill says it does not need.
- **What the hand-built version lost, compared with `{{consentEmbed}}`:** no tested client, no audit facts (the iframe is injected by script, so `thirdParty` cannot see it), a guessed title, autoplay chosen for the visitor, and inline styles. Every site that gets a video this way gets a different 30 lines.

So the evidence points at the structural fix the intent made conditional: an embed helper that works on a site with no banner.

## The YouTube preset against today's measurement

The preset declares `yt-icons-last-purged` and `ytidb::LAST_RESULT_ENTRY_KEY` (measured 2026-11-02). Today, after the click, the frame held `ytidb::LAST_RESULT_ENTRY_KEY` in `localStorage` and the IndexedDB database `YtIdbMeta`, and no `yt-icons-last-purged`. The operator chose (2026-11-04) to add `YtIdbMeta` and keep both earlier keys, since one measurement missing a key does not show the player never writes it.

## Instagram, measured in Chromium (2026-11-04)

Public items on @instagram, found logged out: the reel `DfQCqMnhpsG` and the post `DfPQchkG1tg`. Each was loaded as a plain `<iframe src="https://www.instagram.com/{reel|p}/{id}/embed">` in a page served over HTTP, in a clean profile, and read 8 s after load.

| Embed | Requests | `Set-Cookie` headers | Cookies stored | Frame `localStorage` / IndexedDB |
| ----- | -------- | -------------------- | -------------- | -------------------------------- |
| reel  | 48       | none                 | none           | none / none                      |
| post  | 55       | none                 | none           | none / none                      |

- **Origins:** `www.instagram.com`, `static.cdninstagram.com`, `scontent.cdninstagram.com`, and an `*.fna.fbcdn.net` image host whose name varies by region (`instagram.fbrs4-2.fna.fbcdn.net` here).
- **Not measured:** storage after playing the reel or interacting inside the frame, and a logged-in visitor, whose existing Instagram cookies the frame will read. A request to Meta carries the visitor's IP address and the page whatever is stored, so the embed stays gated, in `marketing`, even with nothing stored on load.
- **Size.** The frame has no fixed ratio: its height is the media's plus about 215 px for the header, the link and the actions. Rendered at a fixed 900 px it fitted at 1440 px wide and left about 330 px blank at 320 px. **The frame reports its own height** to the parent page with `postMessage`, without `embed.js`: `{"type":"MEASURE","details":{"height":568}}` at 320 px wide and `883` at 1440 px (its width capped at 540 px). The same messages came from the reel and the post, along with `LOADING` and `MOUNTED`.
