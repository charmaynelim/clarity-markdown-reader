// github.js — GitHub API client (read + write stubs) + cache layer

import { getAuth } from './auth.js';

const API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated GitHub API request.
 * Handles common error codes: 401 → re-auth, 403 → rate limit, 404 → not found.
 */
async function ghFetch(path, options = {}) {
    const auth = getAuth();
    if (!auth) throw new Error('Not authenticated');

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${auth.token}`,
            Accept: 'application/vnd.github.v3+json',
            ...options.headers
        }
    });

    if (res.status === 401) {
        throw Object.assign(new Error('Authentication expired — please sign in again'), { status: 401 });
    }
    if (res.status === 403) {
        const remaining = res.headers.get('X-RateLimit-Remaining');
        if (remaining === '0') {
            const reset = res.headers.get('X-RateLimit-Reset');
            const resetDate = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'soon';
            throw Object.assign(new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}.`), { status: 403 });
        }
        throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (res.status === 404) {
        throw Object.assign(new Error('Not found — the repository or file may have been removed'), { status: 404 });
    }
    if (res.status === 409) {
        throw Object.assign(new Error('Conflict — the file was modified elsewhere. Refresh and try again.'), { status: 409 });
    }
    if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        const msg = body.message || 'Validation failed';
        throw Object.assign(new Error(`Couldn't complete the operation: ${msg}`), { status: 422 });
    }
    if (!res.ok) {
        throw Object.assign(new Error(`GitHub API error: ${res.status}`), { status: res.status });
    }

    return res.json();
}

/**
 * UTF-8 safe base64 decode (GitHub returns base64-encoded file content).
 */
function decodeBase64(encoded) {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Cache layer (Task 1.4)
// ---------------------------------------------------------------------------

function getUsername() {
    const auth = getAuth();
    return auth?.user?.login || '_anonymous';
}

/**
 * Cache a repo's file tree in localStorage.
 */
export function cacheTree(owner, repo, tree, treeSha, folders = []) {
    const key = `clarity:${getUsername()}:tree:${owner}/${repo}`;
    localStorage.setItem(key, JSON.stringify({ sha: treeSha, files: tree, folders, cachedAt: Date.now() }));
}

/**
 * Retrieve cached tree, or null if not cached.
 */
export function getCachedTree(owner, repo) {
    const key = `clarity:${getUsername()}:tree:${owner}/${repo}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Cache a file's content keyed by path + SHA.
 */
export function cacheFile(path, sha, content) {
    const key = `clarity:${getUsername()}:file:${path}`;
    localStorage.setItem(key, JSON.stringify({ sha, content, cachedAt: Date.now() }));
}

/**
 * Retrieve cached file content if SHA matches, otherwise null.
 */
export function getCachedFile(path, sha) {
    const key = `clarity:${getUsername()}:file:${path}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const cached = JSON.parse(raw);
        return cached.sha === sha ? cached.content : null;
    } catch {
        return null;
    }
}

/**
 * Invalidate (remove) cached tree for a repo.
 * Called after write operations.
 */
export function invalidateTree(owner, repo) {
    const key = `clarity:${getUsername()}:tree:${owner}/${repo}`;
    localStorage.removeItem(key);
}

/**
 * Clear all clarity cache for the current user.
 */
export function clearUserCache() {
    const prefix = `clarity:${getUsername()}:`;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ---------------------------------------------------------------------------
// Read functions (fully implemented)
// ---------------------------------------------------------------------------

/**
 * Fetch the full file tree of a repo (recursive).
 * Returns { sha, files: [{ path, type, sha, size }] } filtered to .md files.
 */
export async function fetchRepoTree(owner, repo, branch = 'main') {
    const data = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);

    const files = data.tree
        .filter(item => item.type === 'blob' && /\.(md|markdown)$/i.test(item.path))
        .map(item => ({
            path: item.path,
            type: item.type,
            sha: item.sha,
            size: item.size
        }));

    // Extract all top-level folder names (so empty folders are visible)
    const folders = [...new Set(
        data.tree
            .filter(item => item.type === 'tree' && !item.path.includes('/'))
            .map(item => item.path)
    )].sort();

    // Cache the tree (including folders)
    cacheTree(owner, repo, files, data.sha, folders);

    return { sha: data.sha, files, folders };
}

/**
 * Fetch and decode a single file's content.
 * Returns { content, sha, name, path }.
 */
export async function fetchFileContent(owner, repo, path, ref = 'main') {
    // Check cache first
    const cached = getCachedTree(owner, repo);
    if (cached) {
        const fileEntry = cached.files.find(f => f.path === path);
        if (fileEntry) {
            const cachedContent = getCachedFile(path, fileEntry.sha);
            if (cachedContent) {
                return {
                    content: cachedContent,
                    sha: fileEntry.sha,
                    name: path.split('/').pop(),
                    path
                };
            }
        }
    }

    const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);

    const content = decodeBase64(data.content.replace(/\n/g, ''));
    const name = data.name;

    // Cache the file content
    cacheFile(path, data.sha, content);

    return { content, sha: data.sha, name, path };
}

/**
 * List the authenticated user's repos.
 * Returns [{ full_name, private, description, default_branch }].
 */
export async function listUserRepos() {
    const data = await ghFetch('/user/repos?sort=updated&per_page=30');

    return data.map(repo => ({
        full_name: repo.full_name,
        private: repo.private,
        description: repo.description,
        default_branch: repo.default_branch
    }));
}

// ---------------------------------------------------------------------------
// Write function stubs (signatures defined, implementation in Phase 2–3)
// All write stubs require SHA for conflict detection.
// ---------------------------------------------------------------------------

/**
 * Upload (create) a new file.
 * @param {string} owner
 * @param {string} repo
 * @param {string} path — full path including filename
 * @param {string} content — raw string content
 * @param {string} message — commit message
 * @param {string} branch
 */
export async function uploadFile(owner, repo, path, content, message, branch = 'main') {
    // Base64 encode the content (UTF-8 safe)
    const encoded = btoa(
        new Uint8Array(new TextEncoder().encode(content))
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Check if file already exists (need its SHA for update)
    let existingSha = null;
    try {
        const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
        existingSha = existing.sha;
    } catch (e) {
        // 404 = file doesn't exist, that's fine for create
        if (e.status !== 404) throw e;
    }

    const body = {
        message,
        content: encoded,
        branch
    };

    if (existingSha) {
        body.sha = existingSha;
    }

    const result = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    // Invalidate tree cache so next load gets fresh data
    invalidateTree(owner, repo);

    return result;
}

/**
 * Update an existing file's content.
 * @param {string} sha — current SHA for conflict detection
 */
export async function updateFileContent(owner, repo, path, content, sha, message, branch = 'main') {
    throw new Error('Not implemented — available in Phase 6 (editor)');
}

/**
 * Delete a file.
 * @param {string} sha — current SHA for conflict detection
 */
export async function deleteFile(owner, repo, path, sha, message, branch = 'main') {
    const result = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha, branch })
    });
    invalidateTree(owner, repo);
    return result;
}

/**
 * Rename a file (fetch content at old path → create at new path → delete old).
 */
export async function renameFile(owner, repo, oldPath, newPath, message, branch = 'main') {
    // Fetch the file content + SHA at the old path
    const file = await ghFetch(`/repos/${owner}/${repo}/contents/${oldPath}?ref=${branch}`);

    // Create at new path
    await ghFetch(`/repos/${owner}/${repo}/contents/${newPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            content: file.content.replace(/\n/g, ''),
            branch
        })
    });

    // Delete at old path
    await ghFetch(`/repos/${owner}/${repo}/contents/${oldPath}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Remove old path: ${oldPath}`, sha: file.sha, branch })
    });

    invalidateTree(owner, repo);
}

/**
 * Move a file to a different folder (same as rename, just different path).
 */
export async function moveFile(owner, repo, oldPath, newPath, message, branch = 'main') {
    return renameFile(owner, repo, oldPath, newPath, message, branch);
}

/**
 * Create a folder (via .gitkeep placeholder).
 */
export async function createFolder(owner, repo, path, branch = 'main') {
    const encoded = btoa('');
    const gitkeepPath = `${path}/.gitkeep`;

    // Check if .gitkeep already exists (e.g. from a previous attempt)
    let existingSha = null;
    try {
        const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${gitkeepPath}?ref=${branch}`);
        existingSha = existing.sha;
    } catch (e) {
        if (e.status !== 404) throw e;
    }

    const body = {
        message: `Create folder: ${path} via Clarity`,
        content: encoded,
        branch
    };

    if (existingSha) {
        body.sha = existingSha;
    }

    await ghFetch(`/repos/${owner}/${repo}/contents/${gitkeepPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    invalidateTree(owner, repo);
}

/**
 * Rename a folder (batch via Git Trees API — single commit).
 * Remaps all files under oldPath to newPath in one commit.
 */
export async function renameFolder(owner, repo, oldPath, newPath, message, branch = 'main') {
    const treeChanges = [];

    // Get full tree to find files under oldPath
    const treeData = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    const oldPrefix = oldPath.endsWith('/') ? oldPath : oldPath + '/';
    const newPrefix = newPath.endsWith('/') ? newPath : newPath + '/';

    for (const item of treeData.tree) {
        if (item.type === 'blob' && item.path.startsWith(oldPrefix)) {
            // Remove old path entry
            treeChanges.push({ path: item.path, mode: item.mode, type: 'blob', sha: null });
            // Add new path entry
            const relativePath = item.path.slice(oldPrefix.length);
            treeChanges.push({ path: newPrefix + relativePath, mode: item.mode, type: 'blob', sha: item.sha });
        }
    }

    if (treeChanges.length === 0) return;

    await createTreeCommit(owner, repo, branch, treeChanges, message);
    invalidateTree(owner, repo);
}

/**
 * Delete a folder and all its contents (batch via Git Trees API — single commit).
 */
export async function deleteFolder(owner, repo, path, message, branch = 'main') {
    const treeChanges = [];

    const treeData = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    const prefix = path.endsWith('/') ? path : path + '/';

    for (const item of treeData.tree) {
        if (item.type === 'blob' && item.path.startsWith(prefix)) {
            treeChanges.push({ path: item.path, mode: item.mode, type: 'blob', sha: null });
        }
    }

    if (treeChanges.length === 0) return;

    await createTreeCommit(owner, repo, branch, treeChanges, message);
    invalidateTree(owner, repo);
}

/**
 * Helper: create a tree + commit for batch operations.
 * treeChanges is an array of { path, mode, type, sha } — sha: null means delete.
 */
async function createTreeCommit(owner, repo, branch, treeChanges, message) {
    // 1. Get the current commit SHA for the branch
    const refData = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const currentCommitSha = refData.object.sha;

    // 2. Get the tree SHA from the current commit
    const commitData = await ghFetch(`/repos/${owner}/${repo}/git/commits/${currentCommitSha}`);
    const baseTreeSha = commitData.tree.sha;

    // 3. Build the new tree (entries with sha: null are deletions)
    const treeEntries = treeChanges.map(change => {
        if (change.sha === null) {
            // Deletion: omit sha, set mode to indicate removal
            return { path: change.path, mode: change.mode, type: change.type, sha: null };
        }
        return { path: change.path, mode: change.mode, type: change.type, sha: change.sha };
    });

    const newTree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });

    // 4. Create a new commit pointing to the new tree
    const newCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            tree: newTree.sha,
            parents: [currentCommitSha]
        })
    });

    // 5. Update the branch ref to point to the new commit
    await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha })
    });
}
