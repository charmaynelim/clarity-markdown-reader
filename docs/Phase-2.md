# Phase 2 — Library, Landing Page & Uploads

## Goal

Build the library UI, the landing page, view routing, and file uploads. This is where Clarity transforms from a reader into a product that users can visit, sign in to, browse, and start adding documents.

## Outcome

When this phase is complete: unauthenticated visitors see a landing page. Authenticated users see a document library organized by folder. Users can upload markdown files to any folder. Clicking a file opens the reader. Navigation works.

## Tasks

### 2.1 — Build the landing page

Replaces the welcome/drop-zone for unauthenticated visitors:

**Content:**
- Hero: product name, one-line description, "Sign in with GitHub" button
- Feature highlights (3–4 items): clean reading, organized by folder, any device, dark/light mode
- "Try it now" section preserving the file drop — visitors can preview the reading experience without signing in
- Footer with link to GitHub repo

**Design:**
- Matches Clarity's aesthetic — same typography, colors, theme support
- Clean and minimal — not a SaaS marketing page
- Mobile responsive

**Done when:** Visiting without auth shows landing page. "Sign in" triggers OAuth. File drop still works for anonymous users.

### 2.2 — Implement view routing (`js/app.js`)

Hash-based router:

```
#/                       → Landing (unauth'd) or Library (auth'd)
#/library                → Library — all documents
#/library/work           → Library — filtered to folder
#/read/work/notes.md     → Reader — specific file
#/settings               → Settings modal
```

- Listen for `hashchange`
- Parse hash into view + params
- Show/hide view containers
- Browser back/forward works
- Guards: library/reader routes redirect to landing if not authenticated

**Done when:** Back/forward works. Refresh preserves view. Deep links work. Unauth'd users can't access library.

### 2.3 — Build the library view (`js/library.js`)

**Sidebar (repurposed outline panel):**
- Header: "Library"
- "All Documents" at top
- Folders as category items with file count badges
- "Uncategorized" for root-level files
- Active category highlighted

**Main content area:**
- Header: selected category name + Upload button
- File list: filename (sans `.md`), folder path (in "All" view)
- Click → navigate to `#/read/{path}`
- Empty states for no files / no files in category

```javascript
function buildLibrary(files)
// → { categories: [{ name, path, fileCount, files }], uncategorized: [...] }

function renderCategories(library, activeCategory)
function renderFileList(files, categoryName)
function openFile(filePath)
```

**Done when:** All `.md` files browsable by folder. Categories filter. Clicking opens reader.

### 2.4 — Implement file uploads

Add the ability to upload `.md` files to the connected repo:

**Upload flow:**
1. User clicks "Upload" button in the library header (or drags a file onto the file list area)
2. File picker opens (accepts `.md`, `.markdown`, `.txt`)
3. After selecting a file, a **destination picker** appears:
   - Shows the folder tree (same structure as sidebar categories)
   - Current category is pre-selected as the default destination
   - "New folder" option at the bottom to create a destination on the fly
   - Confirm button: "Upload to /work"
4. File is uploaded to GitHub via `uploadFile()` in `github.js`
5. Optimistic UI: file appears in the list immediately
6. Cache is refreshed in the background
7. Success toast: "Uploaded notes.md to /work"
8. On failure: roll back optimistic update, show error toast

**Implementation:**
- Implement `uploadFile()` in `github.js` (remove the "Not implemented" stub)
- Read file content via `FileReader`, base64 encode for the GitHub API
- Auto-generate commit message: "Upload: {filename} via Clarity"
- Handle name collision: if file already exists at that path, show a confirmation ("A file named notes.md already exists in /work. Replace it?") — replacing requires the existing file's SHA

**Drag-and-drop upload:**
- In library view, dragging a file onto the file list area triggers the upload flow (with the current category as default destination)
- Visual indicator: dashed border, "Drop to upload" overlay

**Done when:** Users can upload `.md` files to any folder. Destination picker works. Optimistic UI shows the file immediately. Collisions are handled.

### 2.5 — Integrate reader with GitHub files

Modify reader to work with GitHub-sourced content:

- `renderMarkdown(content, filename)` is reused as-is
- Back button in top bar returns to `#/library`
- On navigate to `#/read/{path}`: check cache, fetch if needed, show loading during fetch
- Outline panel works as before
- PDF export works as before

**Done when:** Reading a GitHub file is identical to reading a local file. Back button returns to library.

### 2.6 — Preserve local file drop

Works across all states:

- **Landing (unauth'd)**: Drop zone is prominent. Opens temporary reader.
- **Library (auth'd)**: Drag-and-drop over file list triggers upload flow (2.4). Drag-and-drop over reader area opens as temporary local file.
- **Reader**: Dropping a new file replaces current content (temporary).

Local files marked as "Local: filename" in the title bar.

**Done when:** Local file drop works everywhere. Clear distinction between local (temporary) and GitHub (persistent) files.

## Design Considerations

- **Upload button**: Prominent but not dominant. Sits in the library header next to the category name. Icon + "Upload" text on desktop, icon-only on mobile.
- **Destination picker modal**: Simple list of folders, indented to show nesting. Current folder pre-selected. "New folder" option at the bottom with inline text input. Confirm/cancel buttons. Theme-aware.
- **View transitions**: Subtle `contentFadeIn` animation between views.
- **Mobile library**: Sidebar is slide-over panel. File list is full main area. Tapping category filters and auto-closes sidebar.
- **Loading states**: Minimal loading indicator when fetching file content. Don't block the whole UI.

## Dependencies

- Phase 1 complete (OAuth, API client, caching, settings)

## Estimated Effort

Large. Landing page, library view, category sidebar, uploads with destination picker, view routing — this is the most UI-intensive phase.
