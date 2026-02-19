# BUGS.md

## Open Bugs

(none)

---

## Fixed Bugs

### BUG-004: moveFile() fails with "sha wasn't supplied"
**Fixed:** 2026-02-19 — Two issues in `renameFile` (which `moveFile` delegates to): (1) PUT at destination path had no existing-file check — if a file already existed at the target, GitHub returned 422 "sha wasn't supplied"; fix: added GET-before-PUT pattern (same as BUG-001) to detect and include existing SHA. (2) DELETE at old path used the SHA fetched before the PUT commit — after the PUT creates a new commit the branch HEAD moves forward; fix: re-fetch the old file's SHA after the PUT before issuing the DELETE. Also fixed `deleteFile` to always fetch fresh SHA from the API instead of trusting the caller's potentially stale cached value.
**Files:** js/github.js

### BUG-003: deleteFolder/renameFolder fails with "Update is not a fast forward"
**Fixed:** 2026-02-19 — Three issues: (1) `deleteFolder` and `renameFolder` fetched the tree separately from `createTreeCommit`'s ref fetch; fix: refactored `createTreeCommit` to accept a callback and fetch both the ref and tree from the same commit internally. Added retry logic (up to 3 attempts). (2) Retries still failed because `ghFetch` used the browser's default `fetch()` cache policy — GitHub API responses include `Cache-Control: private, max-age=60`, so the browser served the same stale ref on every retry; fix: added `cache: 'no-store'` to all `ghFetch` requests, bypassing the HTTP cache entirely. (3) Full audit of all write functions for stale-SHA patterns, fixed in one pass.
**Files:** js/github.js, sw.js

### BUG-002: Blank screen on mobile
**Fixed:** 2026-02-19 — Two issues: (1) CSS specificity — `.app.outline-collapsed` (0-2-0) beat the mobile media query `.app` (0-1-0), keeping `grid-template-columns: 0 1fr`; fix: added `.app.outline-collapsed` to the mobile media query. (2) Service worker cache — `CACHE_VERSION` was never bumped from `clarity-v1`, so the cache-first SW kept serving the old CSS; fix: bumped to `clarity-v2`.
**Files:** css/styles.css, sw.js

### BUG-001: New folder creation silently fails
**Fixed:** 2026-02-19 — Two issues: (1) Empty folders invisible because fetchRepoTree only returned .md files; fix: added top-level folder tracking to tree cache, optimistic sidebar insertion, and folder-aware collision checks. (2) createFolder() PUT to `.gitkeep` without SHA — if `.gitkeep` already existed from a prior attempt, GitHub returned 422 "sha wasn't supplied"; fix: added existing-file detection (GET before PUT, include SHA if found).
**Files:** js/github.js, js/library.js, js/filemanager.js
