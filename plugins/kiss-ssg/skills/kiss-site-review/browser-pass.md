# The browser pass

How to look at a built kiss site in a browser. `kiss-site-new` uses it to look at what it built before the hand-over, `kiss-site-review` uses it for its usability audit, and every domain skill whose checks need a browser uses it the same way. The checks themselves belong to the skill that asks for them; this file is only how to get the site in front of a browser correctly.

## Build it, then serve the build folder as the site root

The audit reads markup. Whether the site looks finished needs eyes. `check` publishes nothing, so there is nothing on disk to look at yet: build the site for real first (`npm run build` on a site set up by `init`, or `node <site-script>`). That writes the build folder — including anything the audit flagged, such as a `debug.json` — so say in the report that you did, and remove it afterwards if it was not there when you started.

Look at the built site **served with the build folder as the site root**: the site's own `--dev` preview (`npm run dev`), or any static server started in the build folder (`public/` by default). Never a server rooted above it — VS Code Live Server opened on the repo is the usual one — because every root-relative `{{link}}` then resolves outside the site and reads as broken when it is not.

## Widths

Look at each distinct page template (not every page) at 320, 768 and 1440 wide, and one odd width (say 1023) where breakpoints meet, in both colour schemes if the site has a dark one.

## The browser

A browser does not have to be a tool of the agent's own. A Playwright or Puppeteer install driven from a script through the shell does the job: serve the build folder over HTTP, never `file://`, for the reason above.

**When Anthropic's `webapp-testing` skill is available, it is a recipe for that script** in Python Playwright, which needs `pip install playwright` and `python -m playwright install chromium` first. Use it or write your own script; the browser is what matters. Either way, three of the skill's defaults are wrong for a kiss site:

- **Not `file://`.** Its decision tree sends static HTML to the file itself, and its example opens a `file://` URL. A kiss build is static HTML whose links are root-relative, so this pass is still served over HTTP with the build folder as the root.
- **Not `with_server.py` on Windows.** It stops the shell it started, not the server under it: measured twice, `npm run dev` was still listening after it printed "Server 1 stopped", and the next run failed to bind. Start the server yourself in the background, or any static server in the build folder, and stop that process when the pass is done.
- **Not port 3001 by assumption.** `--dev` listens where the site's `router.js` says, and prints the address when it binds; read it there. Example 11 uses 3011.

**Without a browser, say that this pass did not run.** Do not infer the result from the templates: a layout that looks right in the source is exactly what this pass exists to check.
