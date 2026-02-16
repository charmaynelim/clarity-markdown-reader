# CLAUDE.md


## Working Style

- Before each action, print a one-line summary of what you're about to do. Example: "→ Scaffolding React app with Vite..."
- Keep explanations concise. Don't narrate — just build.
- After completing a step, confirm it with a one-liner. Example: "✓ Supabase client configured."

## Error Handling

If something fails, stop and tell me three things:

1. **What failed and why** — the actual error, not a guess.
2. **How to check the state** — a command I can run or a file I can look at to verify.
3. **What to do next** — explicitly recommend one of: retry, skip, or troubleshoot (with steps).

Do not silently retry or work around failures. I want to know about them.

## Manual Steps

If ANY step requires me to do something outside of Claude Code — creating an account, clicking something in a browser, copying a key, configuring a dashboard — STOP and tell me before proceeding. Format it like this:

⚠️ MANUAL STEP REQUIRED:
[What I need to do]
[Where to do it (URL or location)]
[What to copy/paste back to you when done]

Then wait for me to confirm before continuing.

---

## Session Management

When I say **"end session"**, stop all work and do the following three things:

### 1. Session Summary
Write a concise summary of what happened this session. Include:
- What was built, changed, or fixed.
- Any decisions made during the session.
- Any errors encountered and how they were resolved (or not).
- Files created or modified (list them).

### 2. Progress Check
Tell me exactly where we stand:
- Which phase are we in?
- What steps within that phase are done vs. remaining?
- Are there any open issues, broken states, or things that need manual attention before the next session?
- A simple checklist using the "Done When" criteria from the current phase file.

### 3. Resumption Prompt
Write a ready-to-paste prompt I can use to kick off the next Claude Code session. It should:
- Tell Claude which files to read for context.
- Summarize what's already done (so Claude doesn't redo work).
- State exactly what to do next.
- Carry forward any unresolved issues or context that would otherwise be lost.
- Include the same working style, error handling, and manual step rules from the original kickoff prompt.

Format it as a code block I can copy directly.
