# Phase 4 — Search, Sync & Polish

## Goal

Make the library feel fast and complete. Add search, improve sync, polish all loading/error states, and add quality-of-life features.

## Outcome

When this phase is complete: the library has instant title search, background sync detects repo changes, every error has a clear message, and recently opened files are tracked. Clarity feels production-ready.

## Tasks

### 4.1 — Title/filename search

Search input at the top of the library main content area:

- Filters files in real-time as user types (client-side, no API calls)
- Searches across filename and folder path, case-insensitive substring match
- Results grouped by category
- Clearing restores previous category view
- Keyboard shortcut: `⌘K` or `/` focuses search
- On mobile: search input always visible at top

**Done when:** Typing instantly filters the file list. Clearing restores previous view.

### 4.2 — Background sync & refresh indicator

- On app load: display cached tree, fetch fresh tree in background
- If tree SHA changed: "Library updated" toast with count of changes
- Manual refresh button in library header
- "Last synced: X minutes ago" in sidebar footer
- Offline: show cached data with "Showing cached library" notice
- After write operations (Phase 3): tree is already refreshed, but validate consistency

**Done when:** Cached data loads instantly. Changes detected and surfaced. Offline works gracefully.

### 4.3 — Loading & error state polish

Every state audited:

- **OAuth errors**: Failed sign-in, denied permissions, expired token → clear messages with retry
- **File tree loading**: Skeleton placeholders (not spinners)
- **File content loading**: Subtle loading bar at top of reader
- **Token expired**: Prompt to sign in again
- **Repo not found / permissions changed**: Suggest re-authorizing
- **Rate limited**: Show reset time, serve from cache
- **File not found (deleted externally)**: "This file is no longer in the repo" with back button
- **Network failure**: "Can't reach GitHub" with retry, serve cached data
- **Write operation failures** (Phase 3): Specific messages — "Couldn't rename: file already exists", "Couldn't delete: file was modified", etc.

**Done when:** Every failure has a helpful message. No blank screens, no uncaught errors, no confusing states.

### 4.4 — Recently opened files

- Track last 10 opened files in localStorage (per user namespace)
- "Recent" section at top of library, above categories
- "Continue reading: filename" prompt if user was last reading a file
- Recent list updates when files are renamed/moved/deleted (Phase 3 integration)

**Done when:** Library shows recently opened files. Most recent file highlighted for quick continuation.

### 4.5 — Keyboard navigation

Full keyboard support for the library:

- `⌘K` or `/` — Focus search
- `↑` / `↓` — Navigate file list
- `Enter` — Open selected file
- `Escape` — Clear search, close menu/modal, or go back from reader to library
- `⌘[` or `Backspace` (when not in input) — Back to library from reader
- `Delete` / `Backspace` on selected file — Open delete confirmation (desktop only)

**Done when:** Entire library navigable without a mouse.

## Design Considerations

- **Search input**: Minimal — no visible border by default, subtle background on focus. Search icon left, clear button right.
- **Toast messages**: Small rounded pill, top-center, auto-dismisses in 5 seconds. Consistent with undo toasts from Phase 3.
- **Skeleton loading**: Animated gradient blocks matching expected layout. `--bg-tertiary` color.

## Dependencies

- Phase 3 complete (file management — needed for error state coverage and recent file tracking integration)

## Estimated Effort

Medium. Each task is individually small. Search and keyboard nav are straightforward. Sync indicator and comprehensive error states need design attention.
