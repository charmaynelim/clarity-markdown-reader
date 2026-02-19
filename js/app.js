// app.js — Initialization, routing, theme toggle, keyboard shortcuts, outline toggle

import { initReader } from './reader.js';
import { isAuthenticated, handleAuthCallback } from './auth.js';
import { fetchRepoTree, getCachedTree } from './github.js';
import { openSettings, getRepoSettings } from './settings.js';

// DOM references
const app = document.getElementById('app');
const toggleOutlineBtn = document.getElementById('toggleOutline');
const mobileOverlay = document.getElementById('mobileOverlay');
const themeToggle = document.getElementById('themeToggle');
const fileInput = document.getElementById('fileInput');
const gearBtn = document.getElementById('gearBtn');

// --- Theme ---

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('clarity-theme', theme); } catch (e) { /* ignore */ }
}

// Load saved theme preference (default dark)
try {
    const saved = localStorage.getItem('clarity-theme');
    if (saved) setTheme(saved);
} catch (e) { /* ignore */ }

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
});

// --- Outline Toggle ---

function toggleOutlinePanel() {
    app.classList.toggle('outline-collapsed');
}

toggleOutlineBtn.addEventListener('click', toggleOutlinePanel);

mobileOverlay.addEventListener('click', () => {
    app.classList.add('outline-collapsed');
});

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleOutlinePanel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    }
    if (e.key === 'Escape' && !app.classList.contains('outline-collapsed')) {
        app.classList.add('outline-collapsed');
    }
});

// --- Settings ---

gearBtn.addEventListener('click', openSettings);

// Listen for auth/repo state changes from settings
window.addEventListener('clarity:signed-out', () => {
    window.location.reload();
});

window.addEventListener('clarity:repo-changed', () => {
    // Future: refresh library view
});

// --- Initialize ---

initReader();

// On load: check for OAuth callback, then check stored auth
async function init() {
    // 1. Check for OAuth callback params (returning from GitHub)
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
        try {
            await handleAuthCallback();
            // After successful auth, open settings to pick a repo
            openSettings();
            return;
        } catch (err) {
            console.error('OAuth callback failed:', err.message);
        }
    }

    // 2. Check for stored auth
    if (isAuthenticated()) {
        const repoSettings = getRepoSettings();

        if (repoSettings) {
            // 3. Auth'd + repo configured → load cached tree, background refresh
            const { owner, repo, branch } = repoSettings;
            const cached = getCachedTree(owner, repo);

            if (cached) {
                // Serve from cache immediately (tree is available for library view in Phase 2)
                // Background refresh
                fetchRepoTree(owner, repo, branch).catch(() => {});
            } else {
                // No cache — fetch fresh
                fetchRepoTree(owner, repo, branch).catch(() => {});
            }
        }
        // If auth'd but no repo → user can click gear to configure
    }
    // If not auth'd → show current welcome state (landing page is Phase 2)
}

init();
