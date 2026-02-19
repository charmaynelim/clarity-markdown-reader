# BUGS.md

## Open Bugs

(none)

---

## Fixed Bugs

### BUG-002: Blank screen on mobile
**Fixed:** 2026-02-19 — CSS specificity bug: `.app.outline-collapsed` (0-2-0) beat the mobile media query `.app` (0-1-0), keeping `grid-template-columns: 0 1fr`. With the sidebar `position: fixed` on mobile, `.main-content` was placed in the 0-width column. Fix: added `.app.outline-collapsed` to the mobile media query.
**Files:** css/styles.css

### BUG-001: New folder creation silently fails
**Fixed:** 2026-02-19 — Empty folders were invisible because fetchRepoTree only returned .md files; added top-level folder tracking to tree cache, optimistic sidebar insertion, and folder-aware collision checks.
**Files:** js/github.js, js/library.js, js/filemanager.js
