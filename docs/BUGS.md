# BUGS.md

## Open Bugs

(none)

---

## Fixed Bugs

### BUG-002: Blank screen on mobile
**Fixed:** 2026-02-19 — Two issues: (1) CSS specificity — `.app.outline-collapsed` (0-2-0) beat the mobile media query `.app` (0-1-0), keeping `grid-template-columns: 0 1fr`; fix: added `.app.outline-collapsed` to the mobile media query. (2) Service worker cache — `CACHE_VERSION` was never bumped from `clarity-v1`, so the cache-first SW kept serving the old CSS; fix: bumped to `clarity-v2`.
**Files:** css/styles.css, sw.js

### BUG-001: New folder creation silently fails
**Fixed:** 2026-02-19 — Two issues: (1) Empty folders invisible because fetchRepoTree only returned .md files; fix: added top-level folder tracking to tree cache, optimistic sidebar insertion, and folder-aware collision checks. (2) createFolder() PUT to `.gitkeep` without SHA — if `.gitkeep` already existed from a prior attempt, GitHub returned 422 "sha wasn't supplied"; fix: added existing-file detection (GET before PUT, include SHA if found).
**Files:** js/github.js, js/library.js, js/filemanager.js
