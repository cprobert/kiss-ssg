# Codex repository instructions

Read and follow `CLAUDE.md` in this directory before working in this repository. It is the shared source of project guidance; references to Claude as the working agent also apply to Codex.

Repository skills are shared from `.claude/skills` through `.agents/skills`.

When following those skills:

- Treat `/skill-name` as a reference to the corresponding shared skill and read its `SKILL.md` before using it.
- Use Codex's available question tool or direct conversation where instructions name `AskUserQuestion`.
- Map Claude tool names such as Read, Edit, Bash, Glob, and Grep to the equivalent available tools. Translate shell examples for the active shell while preserving their intent.
- Keep shared instructions and lessons in `CLAUDE.md` and `.claude/skills`; do not duplicate them here.
