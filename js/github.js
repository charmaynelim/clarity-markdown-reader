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
        throw Object.assign(new Error('Not found'), { status: 404 });
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
export function cacheTree(owner, repo, tree, treeSha) {
    const key = `clarity:${getUsername()}:tree:${owner}/${repo}`;
    localStorage.setItem(key, JSON.stringify({ sha: treeSha, files: tree, cachedAt: Date.now() }));
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

    // Cache the tree
    cacheTree(owner, repo, files, data.sha);

    return { sha: data.sha, files };
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
    throw new Error('Not implemented — available in Phase 2');
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
    throw new Error('Not implemented — available in Phase 3');
}

/**
 * Rename a file (delete at old path + create at new path).
 */
export async function renameFile(owner, repo, oldPath, newPath, message, branch = 'main') {
    throw new Error('Not implemented — available in Phase 3');
}

/**
 * Move a file to a different folder.
 */
export async function moveFile(owner, repo, oldPath, newPath, message, branch = 'main') {
    throw new Error('Not implemented — available in Phase 3');
}

/**
 * Create a folder (via .gitkeep placeholder).
 */
export async function createFolder(owner, repo, path, branch = 'main') {
    throw new Error('Not implemented — available in Phase 3');
}

/**
 * Rename a folder (batch via Git Trees API — single commit).
 */
export async function renameFolder(owner, repo, oldPath, newPath, message, branch = 'main') {
    throw new Error('Not implemented — available in Phase 3');
}

/**
 * Delete a folder and all its contents (batch via Git Trees API — single commit).
 */
export async function deleteFolder(owner, repo, path, message, branch = 'main') {
    throw new Error('Not implemented — available in Phase 3');
}
