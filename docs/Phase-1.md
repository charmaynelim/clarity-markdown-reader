# Phase 1 — Foundation

## Goal

Split Clarity into a multi-file project, build the GitHub API client with caching and write-ready function signatures, implement GitHub OAuth, and create a settings screen for repo configuration.

## Outcome

When this phase is complete: the user can sign in with GitHub via OAuth, select a repo, and Clarity fetches and caches the repo's file tree. The GitHub client has full read implementation and write function signatures ready for Phase 2 (uploads) and Phase 3 (file management). The existing reader is untouched.

## Tasks

### 1.1 — Extract current Clarity into a multi-file project

Split the single HTML file:

```
clarity/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js              — Initialization, routing shell, theme toggle
│   ├── auth.js             — OAuth flow, token storage
│   ├── github.js           — GitHub API client + caching
│   ├── library.js          — Empty placeholder
│   ├── filemanager.js      — Empty placeholder
│   ├── reader.js           — Current Clarity reader logic
│   └── settings.js         — Settings/repo connection UI
├── api/
│   └── auth/
│       └── callback.js     — Vercel serverless function
├── CLAUDE.md
├── vercel.json
└── README.md
```

- Move all `<style>` content into `css/styles.css`
- Move reader logic into `js/reader.js`
- Move initialization, theme toggle, keyboard shortcuts into `js/app.js`
- Load JS as ES modules (`<script type="module">`)
- Verify everything works identically after the split

**Done when:** Clarity works exactly as before — open page, drop a file, toggle theme, toggle outline, check mobile.

### 1.2 — Implement GitHub OAuth (`js/auth.js` + `api/auth/callback.js`)

**Client side (`js/auth.js`):**

```javascript
function startAuth()
// → redirects to GitHub OAuth authorize URL
//   with client_id, redirect_uri, scope=repo, state=random

async function handleAuthCallback(code, state)
// → validates state against sessionStorage to prevent CSRF
// → sends code to /api/auth/callback
// → stores received access_token in localStorage
// → fetches user profile (GET /user) for username + avatar

function isAuthenticated()
// → boolean based on stored token

function getAuth()
// → returns { token, user: { login, avatar_url } } or null

function signOut()
// → clears token, user info, and all user-namespaced cache
```

**Server side (`api/auth/callback.js`):**

```javascript
// Vercel serverless function
// POST /api/auth/callback { code, state }
// → exchanges code for token via GitHub API using GITHUB_CLIENT_SECRET
// → returns { access_token } to client
// → NEVER returns or logs the client secret
// → validates env vars exist at invocation time
```

**Done when:** Full OAuth flow works: click sign in → authorize on GitHub → return to Clarity with valid token → `getAuth()` returns user info.

### 1.3 — Build the GitHub API client (`js/github.js`)

**Read functions (fully implemented):**

```javascript
async function fetchRepoTree(owner, repo, branch = 'main')
// → GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
// → returns { sha, files: [{ path, type, sha, size }] } filtered to .md files

async function fetchFileContent(owner, repo, path, ref = 'main')
// → GET /repos/{owner}/{repo}/contents/{path}
// → decodes base64, returns { content, sha, name, path }

async function listUserRepos()
// → GET /user/repos?sort=updated&per_page=30
// → returns [{ full_name, private, description, default_branch }]
```

**Write functions (signatures defined, implementation in Phase 2–3):**

```javascript
async function uploadFile(owner, repo, path, content, message, branch)
// → PUT /contents/{path} — create new file
// → throws "Not implemented" until Phase 2

async function updateFileContent(owner, repo, path, content, sha, message, branch)
// → PUT /contents/{path} with SHA — update existing file
// → throws "Not implemented" until Phase 6 (editor)

async function deleteFile(owner, repo, path, sha, message, branch)
// → DELETE /contents/{path} with SHA
// → throws "Not implemented" until Phase 3

async function renameFile(owner, repo, oldPath, newPath, message, branch)
// → delete old + create new (or atomic via Trees API)
// → throws "Not implemented" until Phase 3

async function moveFile(owner, repo, oldPath, newPath, message, branch)
// → alias for renameFile
// → throws "Not implemented" until Phase 3

async function createFolder(owner, repo, path, branch)
// → creates .gitkeep file inside folder
// → throws "Not implemented" until Phase 3

async function renameFolder(owner, repo, oldPath, newPath, message, branch)
// → batch via Git Trees API — single commit
// → throws "Not implemented" until Phase 3

async function deleteFolder(owner, repo, path, message, branch)
// → batch via Git Trees API — single commit
// → throws "Not implemented" until Phase 3
```

All requests use `Authorization: Bearer {token}` via `getAuth()`. Error handling: 401 → re-auth, 403 → rate limit, 404 → not found. UTF-8 safe base64 decoding.

**Done when:** `fetchRepoTree()` and `fetchFileContent()` work from the console. All write stubs exist with correct signatures and throw "Not implemented."

### 1.4 — Build the cache layer (within `js/github.js`)

```javascript
function cacheTree(owner, repo, tree, treeSha)
// → localStorage: clarity:{username}:tree:{owner}/{repo}

function getCachedTree(owner, repo)
// → returns cached tree or null

function cacheFile(path, sha, content)
// → localStorage: clarity:{username}:file:{path}

function getCachedFile(path, sha)
// → returns content if SHA matches, null otherwise

function invalidateTree(owner, repo)
// → removes cached tree (used after write operations)

function clearUserCache()
// → removes all clarity:{username}:* keys
```

**Done when:** Second load serves tree from cache. Cache invalidates on SHA change. Different users' caches don't interfere.

### 1.5 — Build the settings UI (`js/settings.js`)

Settings modal shown after sign-in:

- Repo picker: dropdown of user's repos (via `listUserRepos()`) or manual `owner/repo` input
- Branch selector: default `main`, editable
- "Connect" button: fetches tree, confirms success with file count
- Status: connected repo, file count, last synced
- "Disconnect repo": clears repo settings + cache (keeps auth)
- "Sign out": clears everything

Matches Clarity's design language. Theme-aware.

**Done when:** User can select a repo, see it validated, settings persist. Disconnect and sign out work cleanly.

### 1.6 — Wire it together in `app.js`

On initialization:

1. Load theme preference
2. Check for OAuth callback params (returning from GitHub)
3. Check for stored auth
4. If auth'd + repo configured → load cached tree, background refresh
5. If auth'd + no repo → show settings/repo picker
6. If not auth'd → show current welcome state (landing page is Phase 2)
7. Gear icon opens settings

**Done when:** Full end-to-end flow: open → sign in → pick repo → tree cached → reload → instant → sign out → clean slate.

## Technical Notes

- **GitHub OAuth App**: Manual setup at Settings → Developer Settings → OAuth Apps → New. Callback URL: `https://{your-domain}/api/auth/callback`.
- **Vercel env vars**: `GITHUB_CLIENT_ID` (public), `GITHUB_CLIENT_SECRET` (server-only). Set in Vercel Project → Settings → Environment Variables.
- **`vercel.json`**: Routes `/api/*` to serverless functions.
- **ES modules**: Native `import`/`export`. No bundler.
- **Tree API efficiency**: One request returns the full repo tree vs. N requests to walk directories.

## Dependencies

- GitHub OAuth App (manual setup)
- Vercel deployment + environment variables

## Estimated Effort

Large. OAuth, serverless function, API client, caching, settings UI — this is the foundation for everything.
