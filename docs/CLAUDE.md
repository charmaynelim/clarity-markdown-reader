# CLAUDE.md

## Project: Clarity — Personal Markdown Document Library

Clarity is a vanilla HTML/CSS/JS web app (no framework, no build step) that connects to GitHub as a document backend. Users sign in with GitHub OAuth, connect a repo, and browse/upload/organize their markdown documents. Deployed on Vercel with a single serverless function for OAuth.

## Critical Architecture Rules

### Security (NEVER violate)
- NEVER put `GITHUB_CLIENT_SECRET` in any client-side file (html, css, or any file in js/)
- The ONLY file that may access `GITHUB_CLIENT_SECRET` is `api/auth/callback.js` (Vercel serverless function)
- NEVER store or log the client secret anywhere other than Vercel environment variables
- GitHub access tokens stored in localStorage — treat as sensitive: never log, never include in error messages, never send to any endpoint other than `api.github.com`
- Always validate the OAuth `state` parameter to prevent CSRF
- Never trust client input for auth — verify tokens against GitHub's API
- All write operations (upload, rename, move, delete) must include the file's current SHA — never skip conflict detection

### GitHub API Pattern
- All GitHub API calls go through `js/github.js` — no direct `fetch()` to `api.github.com` from other modules
- `github.js` handles: auth headers, error handling, rate limit detection, base64 encoding/decoding, SHA tracking
- Other modules call `github.js` functions, never raw API endpoints
- **Single-file operations** (upload, rename single file, delete single file): use the Contents API
- **Batch operations** (rename folder, delete folder): use the Git Trees API for atomic single-commit changes
- Never use the Contents API for batch operations — it creates N commits for N files

### Write Operation Rules
- Every write to GitHub is a git commit. Commit messages are auto-generated: "Upload: {file} via Clarity", "Renamed {old} → {new}", "Moved {file} to {folder}", "Deleted {file}", etc.
- All write functions require the current SHA for conflict detection. If the SHA has changed (file modified externally), the operation fails with a clear error — never silently overwrite.
- Write operations must refresh the cached file tree after completion.
- `filemanager.js` handles all write-related UI (action menus, modals, confirmations, undo toasts). `library.js` handles read-only view rendering. Keep them separate.

### Optimistic UI Pattern
- All write operations update the UI and local cache immediately, before the API call returns.
- On API success: confirm, show success toast (with undo link where applicable).
- On API failure: revert the optimistic update, show error toast with specific message.
- Use the `optimisticAction()` helper in `filemanager.js` for all write operations.
- Undo toasts persist for 5 seconds. Clicking "Undo" reverts the operation via another API call.
- Delete operations do NOT have undo — they use a confirmation dialog instead.

### Data Flow
- **Read path**: GitHub API → cache (localStorage) → view. Views never fetch directly.
- **Write path**: UI → `filemanager.js` → `github.js` → GitHub API → cache refresh → view update.
- Views never write to GitHub directly — always go through `github.js`.
- The reader is a pure display component: receives a markdown string, renders HTML. Does not know where content came from. Does not trigger writes.
- `library.js` renders the file list and categories. `filemanager.js` handles mutations (rename, move, delete, upload, folder operations).

### Cache Rules
- All localStorage keys namespaced per user: `clarity:{username}:*`
- File tree cache: `clarity:{username}:tree:{owner}/{repo}`
- File content cache: `clarity:{username}:file:{path}`
- Settings: `clarity:{username}:settings`
- Recent files: `clarity:{username}:recent`
- Always check SHA before serving cached file content — stale SHA = stale content
- After any write operation: invalidate and refresh the tree cache
- Never cache tokens under a key that includes sensitive data in the key name

### Environment Variables
- `GITHUB_CLIENT_ID` = safe for client code (public, used in OAuth redirect)
- `GITHUB_CLIENT_SECRET` = server only (NEVER in client code)
- Validate required env vars exist in serverless function at invocation — fail fast with clear error

### File Organization
- `js/auth.js` — OAuth flow, token storage/retrieval, sign out
- `js/github.js` — All GitHub API calls (read + write), caching layer
- `js/library.js` — Library view rendering, category browsing (read-only display)
- `js/filemanager.js` — File/folder CRUD UI: action menus, modals, confirmations, undo toasts, optimistic updates
- `js/reader.js` — Markdown reader (display only, pure component)
- `js/settings.js` — Settings modal, repo picker
- `js/app.js` — Initialization, routing, state management, theme
- `api/auth/callback.js` — The ONLY server-side file. OAuth token exchange.
- `css/styles.css` — All styles. No inline styles in JS.

### Code Style
- Vanilla JS with ES modules (`import`/`export`). No framework. No build step. No npm.
- Use JSDoc type annotations for all function signatures
- Prefer explicit over implicit: name functions clearly, avoid abbreviations
- Error handling: always handle, never swallow. Catch errors, display to user, log to console with context.
- External CDN dependencies (marked.js, fonts) loaded in `index.html` `<head>` only

### CSS Rules
- All styles in `css/styles.css` — no inline styles except dynamic show/hide via JS
- Theme variables on `[data-theme="light"]` and `[data-theme="dark"]` selectors
- Layout-structural values (like `--outline-width`) on `:root`
- All new components must support both themes — use CSS variables, never hardcode colors
- Responsive breakpoints: 1024px (tablet), 768px (mobile), 480px (small mobile)
- Action menus, modals, toasts must all be theme-aware and responsive

## Working Style

- Before each action, print a one-line summary. Example: "→ Implementing folder rename via Git Trees API..."
- Keep explanations concise. Don't narrate — just build.
- After completing a step, confirm. Example: "✓ Folder rename working with atomic commits."

## Error Handling

If something fails, stop and tell me three things:

1. **What failed and why** — the actual error, not a guess.
2. **How to check the state** — a command I can run or file I can look at.
3. **What to do next** — explicitly recommend: retry, skip, or troubleshoot (with steps).

Do not silently retry or work around failures.

## Manual Steps

If ANY step requires action outside the coding environment — creating a GitHub OAuth App, setting Vercel env vars, clicking something in a browser — STOP and tell me. Format:

⚠️ MANUAL STEP REQUIRED:
[What I need to do]
[Where to do it (URL or location)]
[What to copy/paste back when done]

Wait for confirmation before continuing.

---

## Session Management

When I say **"end session"**, stop all work and do:

### 1. Session Summary
- What was built, changed, or fixed
- Decisions made
- Errors and resolution
- Files created or modified

### 2. Progress Check
- Current phase and task status
- Open issues or broken states
- Checklist against "Done when" criteria

### 3. Resumption Prompt
Ready-to-paste prompt for next session:
- Files to read for context
- What's done, what's next
- Unresolved issues
- Working style and rules carried forward

Format as a code block.

---

## Project-Specific Reminders

- ZERO build step. No webpack, vite, npm. Test with `npx serve .` or open `index.html`.
- Only server-side code: `api/auth/callback.js`. Everything else runs in the browser.
- Vercel: `vercel.json` routes `/api/*` to functions. Everything else is static.
- GitHub rate limit: 5,000 req/hr authenticated. Cache aggressively.
- Tree API (`/git/trees/{branch}?recursive=1`): one request for full file list. Always prefer over walking directories.
- Git Trees API (`POST /git/trees`): use for all batch operations (folder rename, folder delete). Never use Contents API for batch ops.
- Reader is a pure display component. Don't couple to GitHub, auth, routing, or file management.
- `filemanager.js` owns all mutation UI. `library.js` owns all read-only display. Don't mix them.
