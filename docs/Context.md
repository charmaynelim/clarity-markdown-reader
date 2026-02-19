# Clarity — Product Context

## What Clarity Is Today

Clarity is a single-file, static HTML markdown reader. It has no backend, no accounts, and no persistent state. A user opens the page, drops in a `.md` file (or clicks to browse), and reads it in a clean, typographic interface.

**Current capabilities:**

- Drag-and-drop or file picker to open `.md`, `.markdown`, `.txt` files
- Rendered markdown with full GFM support (tables, task lists, code blocks, etc.)
- Auto-generated outline panel from document headings with scroll spy
- Export to PDF via browser print
- Dark/light theme toggle with persistence via localStorage
- Fully responsive (desktop, tablet, mobile)
- Keyboard shortcuts (⌘/ for outline, ⌘O for open)

**Current architecture:**

- Single HTML file (~1,500 lines)
- No build step, no dependencies beyond two CDN imports (Inter/JetBrains Mono fonts, marked.js)
- All CSS inline in `<style>`, all JS inline in `<script>`
- Zero server-side requirements — deployable anywhere as a static file
- State is ephemeral — nothing persists between sessions except the theme preference

**Current deployment:**

- Static file, intended for Vercel (Hobby plan) deployment

---

## What Clarity Will Become

Clarity evolves from a single-file reader into a **multi-user personal markdown document library** backed by GitHub. Any user can sign in with their GitHub account, connect a repo, and browse, upload, and organize their documents from any device.

**New capabilities:**

- Landing page for unauthenticated visitors explaining the product
- GitHub OAuth sign-in — no tokens to manage, one-click auth
- Browse all markdown files in a connected repo, organized by folder (categories)
- Upload markdown files to any folder in the repo
- Full file management: rename, move, delete files; create, rename, delete folders
- Open any document directly from the library
- Category/folder navigation sidebar
- Search across document titles
- Cached locally for fast repeat access, synced with GitHub on refresh
- Works on desktop and mobile Chrome with the same library
- Installable as a PWA (home screen icon on iOS/Android)
- Still supports local file drop for one-off reading without signing in

**Target architecture:**

- Vercel deployment with a single serverless API route (OAuth token exchange)
- GitHub OAuth for authentication (no PATs, no user-managed tokens)
- GitHub API (REST v3) as the data layer — both reads and writes
- GitHub Contents API for single-file operations; Git Trees API for batch operations (folder rename/move/delete)
- localStorage for caching file trees and recently read documents
- Multi-view UI: Landing → Library ↔ Reader, with settings
- Repo folder structure = categories (simple, portable, no metadata layer)
- Editor-ready data layer (clean read/write separation in the GitHub client)
- Optimistic UI updates for all write operations
- Vercel Hobby plan compatible (one API route is within free tier limits)

**What stays the same:**

- The reading experience (typography, outline, scroll spy, PDF export)
- Dark/light theme toggle
- Responsive design
- Local file drop as a fallback
- Vanilla HTML/CSS/JS — no framework (but split into modules)

---

## Key Architectural Decisions

### 1. Authentication: GitHub OAuth

Since Clarity is a multi-user public tool, we use GitHub OAuth:

- Users click "Sign in with GitHub" and authorize Clarity
- GitHub redirects back with an auth code
- A Vercel serverless function exchanges the code for an access token (server-side — GitHub requires the client secret)
- The access token is stored in the browser (localStorage) for subsequent API calls
- Users can revoke access anytime from their GitHub settings

**Serverless function:** The only server-side code — a single `/api/auth/callback` route. Vercel free tier supports this.

**OAuth scope:** `repo` (for private repo read + write access). Write access is needed for file management and uploads, and is already authorized for the future editor.

### 2. Repo Structure = Categories

Clarity maps GitHub repo folders directly to categories:

```
my-documents/
├── work/
│   ├── q1-planning.md
│   └── meeting-notes.md
├── personal/
│   ├── journal.md
│   └── book-notes.md
├── recipes/
│   └── sourdough.md
└── inbox/
    └── unsorted-note.md
```

Folders at the root become top-level categories. Files at the root go into "Uncategorized."

**Why this over tags/frontmatter:** It's portable. The repo works independent of Clarity — you can organize in Finder, VS Code, or GitHub's web UI. No lock-in, no proprietary format.

### 3. Caching Strategy

GitHub API rate limit is 5,000 requests/hour (authenticated). Caching keeps the UI fast:

- **File tree**: Cached in localStorage. On load, display cache immediately, refresh in background via the Trees API (single request for full repo). Compare SHA to detect changes.
- **File content**: Cached keyed by path + SHA. Matching SHA = serve from cache.
- **Cache isolation**: Namespaced per user (`clarity:{username}:*`) to prevent collisions.
- **Write-through**: All write operations (upload, rename, move, delete) refresh the cached tree after completion.
- **Optimistic updates**: Write operations update the local cache immediately, then confirm against the API response. Roll back on failure.

### 4. File Management Design Pattern

Clarity uses an **action menu pattern** (not drag-and-drop) for file management:

- **Files**: Each file in the list shows a three-dot menu on hover (desktop) or long-press (mobile) with actions: Rename, Move to…, Delete.
- **Folders**: Each folder in the sidebar shows a three-dot menu with: Rename, Delete (with confirmation if non-empty).
- **"Move to…" modal**: Opens a folder tree picker. User selects destination, confirms. File is moved via the GitHub API.
- **Uploads**: "Upload" button in the library header opens a file picker + folder destination picker (defaults to current category).
- **New folder**: Button at the bottom of the sidebar or in the sidebar header.
- **New document**: "New document" button creates a blank `.md` in the current folder (opens in reader; will open in editor when Phase 6 ships).

**Why not drag-and-drop:** It's the hardest interaction to build well (hit-testing, drop zones, scroll-while-dragging, mobile support, undo). The action menu + "Move to…" modal achieves the same result with a fraction of the complexity. Drag-and-drop can be added later as a progressive enhancement.

**Commit messages**: Auto-generated by default ("Uploaded via Clarity", "Renamed notes.md → meeting-notes.md", "Moved notes.md to /work"). No user-facing commit message input for now.

**Confirmations and undo:**
- Deletes: Always show a confirmation dialog ("Delete notes.md? This will remove it from your GitHub repo.")
- Moves and renames: Undo toast ("Moved notes.md to /work — Undo") that persists for 5 seconds.

### 5. GitHub API Strategy for Writes

Every file management action is a git commit. Two APIs are used depending on the operation:

**Contents API** (single-file operations):
- Upload/create file: `PUT /repos/{owner}/{repo}/contents/{path}`
- Update file: `PUT` with existing SHA
- Delete file: `DELETE /repos/{owner}/{repo}/contents/{path}` with SHA
- Rename/move single file: Delete at old path + create at new path (two commits)

**Git Trees API** (batch operations — used for folder-level changes):
- Rename folder: Submit new tree with updated paths for all files, create single commit
- Delete folder: Submit new tree with all folder files removed, single commit
- Move folder: Same approach — restructure tree in one commit

The Trees API is more complex but produces clean single-commit operations instead of N commits for N files. It's the right choice for folder operations.

**Optimistic UI**: Write operations update the local cache and UI immediately, then confirm in the background. On failure, roll back the optimistic update and show an error toast. This makes the UI feel instant despite 500ms–2s API latency.

### 6. Project Structure

```
clarity/
├── index.html              — App shell, layout, all views
├── css/
│   └── styles.css          — All styles
├── js/
│   ├── app.js              — Initialization, routing, state
│   ├── auth.js             — OAuth flow, token management
│   ├── github.js           — GitHub API client (read + write) + caching
│   ├── library.js          — Library view logic
│   ├── filemanager.js      — File/folder CRUD operations + UI (modals, menus)
│   ├── reader.js           — Reader view logic (display only)
│   └── settings.js         — Settings/connection UI
├── api/
│   └── auth/
│       └── callback.js     — Vercel serverless function (OAuth)
├── manifest.json           — PWA manifest
├── sw.js                   — Service worker
├── CLAUDE.md               — AI coding guidelines
└── README.md
```

`filemanager.js` is separate from `library.js` because file management (action menus, modals, confirmations, undo toasts, GitHub write calls) is a substantial module on its own. `library.js` handles the view rendering and category browsing; `filemanager.js` handles mutations.

### 7. Views & Navigation

Three primary states, hash-based routing:

```
#/                       → Landing (unauth'd) or Library (auth'd)
#/library                → Library — all documents
#/library/work           → Library — filtered to "work" folder
#/read/work/notes.md     → Reader — specific file
#/settings               → Settings modal
```

- Browser back/forward works. Refresh preserves view. Deep links work.
- Library/reader routes are guarded — redirect to landing if unauthenticated.

### 8. Editor-Ready Architecture

The editor is Phase 6 but the architecture supports it from day one:

- **`github.js` exposes full read/write surface.** Write functions are implemented for file management (Phase 3), so by the time the editor ships, the data layer is battle-tested.
- **The reader is a pure display component.** It receives markdown content as a string. An editor is a sibling component that also works with markdown strings.
- **Data flow is unidirectional.** Read: GitHub → cache → view. Write: UI → `github.js` → GitHub → cache refresh. The editor follows the same write path as file management.
- **OAuth scope is `repo`** — write access is already authorized.
- **SHA-based conflict detection** is built into all write functions from Phase 3. The editor reuses this to detect when a file changed on GitHub since it was opened.

---

## Non-Goals (for now)

- **Inline editing** — Architecture is editor-ready, but the feature is Phase 6.
- **Multi-repo support** — One repo per user session.
- **Collaboration/sharing** — Personal tool, used by many individuals.
- **Full-text search** — Title/filename search only initially.
- **Drag-and-drop file reordering** — Action menus + "Move to…" modal instead. Drag-and-drop is a future enhancement.
- **Native iOS widget** — Not possible with web tech. PWA home screen icon is the solution.
- **Google Sign-In** — GitHub only. Revisit if demand exists post-launch.

---

## Success Criteria

1. A new user can visit Clarity, understand what it is, sign in with GitHub, connect a repo, and browse their files — all in under 2 minutes.
2. Users can upload markdown files, create folders, and organize their library from within Clarity.
3. I can open Clarity on my phone, see my documents organized by folder, and read any of them.
4. The reading experience is identical to current Clarity.
5. First load after connecting a repo takes <3 seconds to show the file tree.
6. Subsequent loads show the cached library instantly, with background refresh.
7. File management operations feel instant (optimistic UI).
8. Local file drop still works for one-off files without signing in.
9. Deployable on Vercel free tier (Hobby for personal, Pro if commercial).
10. Multiple users can use the tool independently, each with their own GitHub connection.

---

## Phase Overview

| Phase | Name | Summary |
|-------|------|---------|
| 1 | Foundation | Multi-file project, GitHub API client (read + write stubs), OAuth, settings UI |
| 2 | Library & Landing | Library view, categories, view routing, uploads, reader integration, landing page |
| 3 | File Management | Rename, move, delete files; create, rename, delete folders; action menus, modals, undo |
| 4 | Search, Sync & Polish | Title search, background sync, loading/error states, recently opened, keyboard nav |
| 5 | Mobile & PWA | Mobile UX polish, service worker, offline support, installable home screen app |
| 6 | Editor (Future) | Markdown editing, live preview, GitHub commits from Clarity, conflict detection |

Phases 1–5 are scoped and planned. Phase 6 is documented as a future direction.
