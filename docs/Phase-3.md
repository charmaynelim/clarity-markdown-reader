# Phase 3 — File & Folder Management

## Goal

Give users full control over their document library within Clarity. Rename, move, and delete files. Create, rename, and delete folders. All operations commit to GitHub with optimistic UI.

## Outcome

When this phase is complete: users can organize their entire library from within Clarity — no need to visit GitHub or use git. Every action is fast (optimistic UI), reversible where possible (undo toasts), and safe (delete confirmations).

## Tasks

### 3.1 — Implement file action menu

Add a three-dot context menu to each file in the library list:

**Desktop:** Three-dot icon appears on hover at the right edge of the file row.
**Mobile:** Three-dot icon is always visible, or the menu opens on long-press.

**Menu items:**
- **Rename** — inline rename (filename becomes an editable text input, press Enter to confirm, Escape to cancel)
- **Move to…** — opens the folder picker modal (same component as the upload destination picker from Phase 2, reused)
- **Delete** — confirmation dialog, then delete

The action menu is a small floating panel, positioned relative to the three-dot button. Clicking outside closes it. Only one menu open at a time.

**Done when:** Every file has a working action menu with Rename, Move to, and Delete.

### 3.2 — Implement file rename

When "Rename" is selected from the action menu:

1. The filename in the file list becomes an editable text input, pre-filled with the current name (sans `.md`)
2. User edits the name, presses Enter to confirm or Escape to cancel
3. On confirm: optimistic UI updates the name immediately
4. GitHub API call: `renameFile()` in `github.js` — delete at old path, create at new path
5. Cache refresh in background
6. Undo toast: "Renamed notes.md → meeting-notes.md — Undo" (5 seconds)
7. On API failure: roll back, show error toast

**Edge cases:**
- Empty name → reject, keep editing
- Name collision → "A file named X already exists in this folder"
- `.md` extension is auto-appended if the user omits it

**Implementation in `github.js`:**
- Implement `renameFile(owner, repo, oldPath, newPath, message, branch)`
- Uses Contents API: fetch content at old path → create at new path → delete old path
- Single-file operation, so Contents API is fine (no need for Trees API)

**Done when:** Files can be renamed inline. Undo works. Collisions are handled.

### 3.3 — Implement file move

When "Move to…" is selected:

1. Folder picker modal opens (reused from Phase 2 upload destination picker)
2. Current folder is highlighted but not selectable as a destination
3. User picks a destination folder, clicks "Move here"
4. Optimistic UI: file disappears from current list, appears in destination
5. GitHub API call: `moveFile()` — same as rename, just different path
6. Cache refresh
7. Undo toast: "Moved notes.md to /work — Undo" (5 seconds)
8. On failure: roll back

**Done when:** Files can be moved between folders. Undo works.

### 3.4 — Implement file delete

When "Delete" is selected:

1. Confirmation dialog: "Delete notes.md? This will permanently remove it from your GitHub repository. This cannot be undone."
2. On confirm: optimistic UI removes file from list
3. GitHub API call: `deleteFile(owner, repo, path, sha, message, branch)`
4. Cache refresh
5. Success toast: "Deleted notes.md"
6. On failure: roll back, show error

**No undo for deletes** — git makes recovery possible, but not from within Clarity. The confirmation dialog is the safety net.

**Implementation in `github.js`:**
- Implement `deleteFile()` — `DELETE /repos/{owner}/{repo}/contents/{path}` with SHA

**Done when:** Files can be deleted with confirmation. No accidental data loss.

### 3.5 — Implement folder creation

"New folder" button in the sidebar (below the category list):

1. Clicking opens an inline text input in the sidebar
2. User types folder name, presses Enter
3. Optimistic UI: new folder appears in sidebar
4. GitHub API: `createFolder()` — creates a `.gitkeep` file inside the folder (GitHub doesn't track empty folders)
5. Cache refresh
6. On failure: roll back

**Done when:** New folders can be created from the sidebar and immediately appear as categories.

### 3.6 — Implement folder rename

Three-dot menu on each folder in the sidebar with "Rename" option:

1. Folder name becomes an editable text input
2. User edits, presses Enter
3. Optimistic UI: folder name updates in sidebar
4. GitHub API: `renameFolder()` — **batch operation via Git Trees API**
   - Fetch current tree
   - Build new tree with all files under old path remapped to new path
   - Create a single commit with the new tree
5. Cache refresh (full tree, since many paths changed)
6. Undo toast: "Renamed /notes → /journal — Undo"
7. On failure: roll back

**Why Git Trees API:** Renaming a folder with 10 files using the Contents API would be 20 API calls (10 deletes + 10 creates) and 20 commits. The Trees API does it in 3 calls (get tree, create tree, create commit) and 1 commit.

**Implementation in `github.js`:**
- Implement `renameFolder()`
- Helper: `createTreeCommit(owner, repo, branch, treeChanges, message)` — reusable for all batch operations

**Done when:** Folders can be renamed. All contained files are updated atomically. Single commit in git history.

### 3.7 — Implement folder delete

Three-dot menu on folders with "Delete" option:

1. Confirmation dialog: "Delete /work and all X files inside? This cannot be undone."
2. Shows list of files that will be deleted
3. On confirm: optimistic UI removes folder and files
4. GitHub API: `deleteFolder()` — batch via Git Trees API (single commit)
5. Cache refresh
6. Success toast: "Deleted /work (X files)"
7. On failure: roll back

**Done when:** Folders can be deleted with confirmation showing affected files. Single commit.

### 3.8 — Optimistic UI framework

Build a small reusable pattern for optimistic updates across all write operations:

```javascript
// In filemanager.js:

async function optimisticAction({ 
  apply,      // function to update UI/cache optimistically
  revert,     // function to roll back on failure
  action,     // async function — the actual GitHub API call
  successMsg, // toast message on success
  undoAction  // optional — function to call if user clicks "Undo"
})
```

This standardizes the pattern: apply immediately → call API → on success: show toast (with undo if applicable) → on failure: revert + show error toast.

**Done when:** All write operations (3.2–3.7) use this pattern. UI feels instant. Failures roll back cleanly.

## Design Considerations

- **Action menu**: Floating panel with subtle shadow, rounded corners, theme-aware. Same visual weight as the outline panel items. Position with `position: absolute` relative to trigger button, with collision detection to stay on screen.
- **Inline rename**: The text input replaces the filename text, same font/size/padding so it doesn't cause layout shift. Auto-selects the text (sans extension) on activation.
- **Folder picker modal**: Reused from Phase 2. Full-screen on mobile. Shows indented folder tree with radio-style selection. "New folder" inline option at bottom.
- **Confirmation dialogs**: Centered modal with overlay. Title, description, and two buttons (Cancel, Delete/Confirm). Delete button is styled in a warning color.
- **Undo toasts**: Bottom-center, pill-shaped, contains message + "Undo" link. Auto-dismisses after 5 seconds. Only one toast at a time (new toast replaces old).
- **Mobile considerations**: Three-dot menus should be large enough to tap (44px target). Modals are full-screen. Toasts are bottom-center with comfortable padding from the edge.

## Dependencies

- Phase 2 complete (library view, uploads, folder picker modal)

## Estimated Effort

Large. This is the most interaction-heavy phase — seven distinct operations, each with optimistic UI, error handling, and undo. The Git Trees API integration for batch operations adds complexity. But the result is a fully functional document manager.
