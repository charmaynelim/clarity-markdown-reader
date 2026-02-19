# Phase 5 — Mobile & PWA

## Goal

Make Clarity feel native on mobile and installable as a PWA. The "add to home screen and it just works" phase.

## Outcome

When this phase is complete: Clarity is installable on iOS and Android home screens, launches standalone, caches the app shell for instant startup, and every interaction is mobile-optimized.

## Tasks

### 5.1 — Mobile UX audit and fixes

Walk through every screen at 375px–428px:

- **Landing page**: CTA prominent, responsive layout
- **Library sidebar**: Slide-over works smoothly, tapping category auto-closes
- **File list**: 44px minimum tap targets, comfortable padding
- **Action menus (Phase 3)**: Large enough to tap, positioned to not overflow screen
- **Folder picker modal**: Full-screen on mobile
- **Confirmation dialogs**: Full-width buttons on mobile
- **Search**: Prominent but space-efficient
- **Reader back button**: Easily tappable
- **Settings**: Full-screen on mobile
- **Upload flow**: Works on mobile (file picker + destination)
- **Top bar**: All buttons thumb-friendly

**Done when:** Every interaction comfortable on a phone. No tiny tap targets.

### 5.2 — PWA manifest and service worker

**Manifest (`manifest.json`):**
- Name, icons (180, 192, 512), `display: standalone`
- `theme_color` and `background_color` matching dark theme
- `start_url: "/"`

**Service Worker (`sw.js`):**
- Cache app shell (HTML, CSS, JS) on install — cache-first
- Network-first for GitHub API calls with cache fallback
- Cache versioning for updates

**Apple-specific:**
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon" href="icons/icon-180.png">`
- Dynamic `<meta name="theme-color">` updated on theme toggle

**Done when:** "Add to Home Screen" works on iOS Safari and Android Chrome. Launches standalone.

### 5.3 — Offline support

- App shell always available offline
- Library: cached tree shown, "You're offline" banner
- Previously read files: available from cache
- Unread files: shown with "not available offline" indicator
- Write operations (upload, rename, move, delete): disabled with explanation when offline
- Reconnection: auto-refresh tree

**Done when:** Airplane mode → app opens, library browsable, cached files readable. Write operations clearly disabled.

### 5.4 — Touch gestures

- Swipe right from left edge: open sidebar / go back
- Pull to refresh: in library, triggers sync
- Passive event listeners for scroll performance

**Done when:** Gestures feel natural. No interference with scrolling or text selection.

### 5.5 — Performance pass

- Lazy render file list for 100+ files
- Lazy load images referenced in markdown
- `font-display: swap` for fonts
- Audit layout thrashing during view transitions

**Done when:** Library interactive in <1 second on mid-range phone (cached). Smooth transitions.

## iOS Home Screen Notes

- Launches full-screen with `apple-mobile-web-app-capable`
- Status bar matches theme
- Icon on home screen like a native app
- Limitation: no push notifications or background sync on iOS
- Limitation: iOS may evict service worker cache after ~2 weeks inactivity — re-caches on next open
- Not a native widget (requires Swift). PWA icon provides the "tap to open my documents" experience.

## Dependencies

- Phase 4 complete (all features built and polished)
- Icon assets

## Estimated Effort

Medium-large. Service worker and offline need careful implementation. Mobile gesture handling can be fiddly. No new features — all refinement.

## Post-Phase 5: Future Directions

### Phase 6 — Editor

- Markdown editor component (CodeMirror or Milkdown)
- Live preview (side-by-side or toggle)
- "New document" button opens editor instead of creating blank file
- "Edit" button in reader view switches to editor
- Save = GitHub commit via `updateFileContent()` with SHA conflict detection
- Auto-save drafts to localStorage
- Commit message: auto-generated, with optional override
- Conflict resolution: "This file was modified since you opened it. View changes / Overwrite / Cancel"

The data layer (`github.js`) already has `updateFileContent()` with SHA parameter. OAuth scope already includes write. The main work is the editor UI component.

### Other Future Considerations

- **Full-text search**: Prefetch content, client-side index (Fuse.js)
- **Multi-repo support**: Switch between repos
- **Favorites/bookmarks**: Star documents
- **Syntax highlighting**: Prism.js or Shiki for code blocks
- **"Edit on GitHub" link**: Opens file in GitHub's web editor (cheap interim before Phase 6)
- **Drag-and-drop reordering**: Progressive enhancement for file moves
- **Reading statistics**: Time spent, documents per week
