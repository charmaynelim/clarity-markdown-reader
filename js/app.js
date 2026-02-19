// app.js — Initialization, routing, theme toggle, keyboard shortcuts, view management

import { initReader, renderMarkdown } from './reader.js';
import { isAuthenticated, handleAuthCallback, startAuth } from './auth.js';
import { fetchRepoTree, getCachedTree, fetchFileContent } from './github.js';
import { openSettings, getRepoSettings } from './settings.js';
import { initLibrary, renderLibraryView, showUploadModal, focusSearch, clearSearch, trackRecentFile, handleLibraryKeyNav, resetKeyboardFocus } from './library.js';
import { initFileManager } from './filemanager.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const viewLanding = document.getElementById('viewLanding');
const appShell = document.getElementById('app');
const viewLibrary = document.getElementById('viewLibrary');
const viewReader = document.getElementById('viewReader');
const librarySidebar = document.getElementById('librarySidebar');
const readerSidebar = document.getElementById('readerSidebar');

const toggleOutlineBtn = document.getElementById('toggleOutline');
const mobileOverlay = document.getElementById('mobileOverlay');
const themeToggle = document.getElementById('themeToggle');
const landingThemeToggle = document.getElementById('landingThemeToggle');
const fileInput = document.getElementById('fileInput');
const gearBtn = document.getElementById('gearBtn');
const backBtn = document.getElementById('backBtn');
const uploadBtn = document.getElementById('uploadBtn');
const refreshBtn = document.getElementById('refreshBtn');
const fileInputWrapper = document.getElementById('fileInputWrapper');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const documentTitle = document.getElementById('documentTitle');
const readerLoading = document.getElementById('readerLoading');
const welcomeState = document.getElementById('welcomeState');
const markdownContent = document.getElementById('markdownContent');

// Landing page elements
const landingSignIn = document.getElementById('landingSignIn');
const landingCta = document.getElementById('landingCta');
const landingDropZone = document.getElementById('landingDropZone');
const landingFileInput = document.getElementById('landingFileInput');

let currentView = null;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('clarity-theme', theme); } catch (e) { /* ignore */ }
    // Update theme-color meta tag for PWA status bar
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', theme === 'dark' ? '#1A1A1A' : '#EBE9E4');
    }
}

// Load saved theme preference (default dark)
try {
    const saved = localStorage.getItem('clarity-theme');
    if (saved) setTheme(saved);
} catch (e) { /* ignore */ }

function handleThemeToggle() {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
}

themeToggle.addEventListener('click', handleThemeToggle);
landingThemeToggle.addEventListener('click', handleThemeToggle);

// ---------------------------------------------------------------------------
// Sidebar Toggle
// ---------------------------------------------------------------------------

function toggleSidebar() {
    appShell.classList.toggle('outline-collapsed');
}

toggleOutlineBtn.addEventListener('click', toggleSidebar);

mobileOverlay.addEventListener('click', () => {
    appShell.classList.add('outline-collapsed');
});

// ---------------------------------------------------------------------------
// Touch gestures — swipe from left edge to open sidebar
// ---------------------------------------------------------------------------

(function initTouchGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;
    const EDGE_ZONE = 30;       // px from left edge
    const SWIPE_THRESHOLD = 60; // px to trigger

    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (touch.clientX < EDGE_ZONE && appShell.classList.contains('outline-collapsed')) {
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        // passive — no preventDefault needed
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = Math.abs(touch.clientY - touchStartY);

        // Swipe right from left edge — open sidebar (only if mostly horizontal)
        if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY * 1.5) {
            appShell.classList.remove('outline-collapsed');
        }
    }, { passive: true });
})();

// ---------------------------------------------------------------------------
// Pull to refresh in library
// ---------------------------------------------------------------------------

(function initPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const PULL_THRESHOLD = 80;

    const libraryEl = document.getElementById('viewLibrary');

    document.addEventListener('touchstart', (e) => {
        if (currentView !== 'library') return;
        if (window.scrollY > 5) return; // only when at top
        startY = e.touches[0].clientY;
        isPulling = true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isPulling) return;
        isPulling = false;

        const deltaY = e.changedTouches[0].clientY - startY;
        if (deltaY > PULL_THRESHOLD && currentView === 'library' && window.scrollY <= 5) {
            manualRefresh();
        }
    }, { passive: true });
})();

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
    // ⌘/ — Toggle sidebar
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        if (currentView === 'library' || currentView === 'reader') {
            toggleSidebar();
        }
        return;
    }
    // ⌘O — Open local file
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
        return;
    }
    // ⌘K — Focus search in library
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (currentView === 'library') {
            focusSearch();
            resetKeyboardFocus();
        }
        return;
    }
    // ⌘[ — Back to library from reader
    if ((e.metaKey || e.ctrlKey) && e.key === '[' && currentView === 'reader') {
        e.preventDefault();
        navigateTo('#/library');
        return;
    }
    // / — Focus search in library (only when not in input)
    if (e.key === '/' && currentView === 'library' &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        focusSearch();
        resetKeyboardFocus();
        return;
    }
    // Escape — Close sidebar, clear search, or go back from reader
    if (e.key === 'Escape') {
        // Close sidebar if open
        if (!appShell.classList.contains('outline-collapsed')) {
            appShell.classList.add('outline-collapsed');
            return;
        }
        // In library: clear search and reset keyboard focus
        if (currentView === 'library') {
            clearSearch();
            resetKeyboardFocus();
        }
        // In reader: go back to library
        if (currentView === 'reader' && isAuthenticated() && getRepoSettings()) {
            navigateTo('#/library');
        }
        return;
    }
    // Backspace — Back to library from reader (when not in input)
    if (e.key === 'Backspace' && currentView === 'reader' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (isAuthenticated() && getRepoSettings()) {
            navigateTo('#/library');
        }
        return;
    }
    // Library keyboard navigation (↑, ↓, Enter, Delete)
    if (currentView === 'library') {
        handleLibraryKeyNav(e);
    }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

gearBtn.addEventListener('click', openSettings);

window.addEventListener('clarity:signed-out', () => {
    navigateTo('#/');
});

window.addEventListener('clarity:repo-changed', () => {
    if (currentView === 'library') {
        navigateTo('#/library');
    }
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function parseRoute() {
    const hash = window.location.hash || '#/';

    if (hash === '#/' || hash === '#' || hash === '') {
        if (isAuthenticated()) {
            return { view: 'library', category: null };
        }
        return { view: 'landing' };
    }

    if (hash.startsWith('#/library')) {
        if (!isAuthenticated()) return { view: 'landing' };
        const category = hash.replace('#/library', '').replace(/^\//, '') || null;
        return { view: 'library', category };
    }

    if (hash.startsWith('#/read/')) {
        if (!isAuthenticated()) return { view: 'landing' };
        const filePath = decodeURIComponent(hash.replace('#/read/', ''));
        return { view: 'reader', filePath };
    }

    return { view: 'landing' };
}

function showView(route) {
    // Hide everything
    viewLanding.style.display = 'none';
    appShell.style.display = 'none';
    viewLibrary.style.display = 'none';
    viewReader.style.display = 'none';
    librarySidebar.style.display = 'none';
    readerSidebar.style.display = 'none';

    if (route.view === 'landing') {
        viewLanding.style.display = 'flex';
        currentView = 'landing';
        document.title = 'Clarity — Markdown Reader';

    } else if (route.view === 'library') {
        appShell.style.display = 'grid';
        viewLibrary.style.display = 'block';
        librarySidebar.style.display = 'block';
        readerSidebar.style.display = 'none';
        currentView = 'library';

        // Top bar adjustments for library
        backBtn.style.display = 'none';
        refreshBtn.style.display = 'flex';
        uploadBtn.style.display = 'flex';
        fileInputWrapper.style.display = 'none';
        exportPdfBtn.style.display = 'none';
        documentTitle.textContent = route.category
            ? route.category.charAt(0).toUpperCase() + route.category.slice(1)
            : 'All Documents';
        document.title = 'Library — Clarity';

        // Load library
        loadLibrary(route.category);

    } else if (route.view === 'reader') {
        appShell.style.display = 'grid';
        viewReader.style.display = 'block';
        readerSidebar.style.display = 'block';
        librarySidebar.style.display = 'none';
        currentView = 'reader';

        // Top bar adjustments for reader
        const hasRepo = isAuthenticated() && getRepoSettings();
        backBtn.style.display = hasRepo ? 'flex' : 'none';
        refreshBtn.style.display = 'none';
        uploadBtn.style.display = 'none';
        // Hide Open File button when reading a GitHub-sourced file
        fileInputWrapper.style.display = route.filePath ? 'none' : 'block';
        // exportPdfBtn shown by renderMarkdown when content loads

        if (route.filePath) {
            loadGitHubFile(route.filePath);
        }
    }
}

export function navigateTo(hash) {
    window.location.hash = hash;
}

function handleRouteChange() {
    const route = parseRoute();
    showView(route);
}

window.addEventListener('hashchange', handleRouteChange);

// ---------------------------------------------------------------------------
// Library loading
// ---------------------------------------------------------------------------

async function loadLibrary(category) {
    const repoSettings = getRepoSettings();
    if (!repoSettings) {
        openSettings();
        return;
    }

    const { owner, repo, branch } = repoSettings;

    // Try cache first
    let tree = getCachedTree(owner, repo);
    if (tree) {
        renderLibraryView(tree.files, category);
        updateSyncStatus(tree.cachedAt);

        // Background refresh
        backgroundSync(owner, repo, branch, tree, category);
    } else {
        // No cache — show loading then fetch
        renderLibraryView([], category, true);
        try {
            tree = await fetchRepoTree(owner, repo, branch);
            renderLibraryView(tree.files, category);
            updateSyncStatus(Date.now());
        } catch (err) {
            if (!navigator.onLine) {
                renderLibraryView([], category, false, 'You appear to be offline. Connect to the internet and try again.');
            } else {
                renderLibraryView([], category, false, err.message);
            }
        }
    }
}

async function backgroundSync(owner, repo, branch, cachedTree, category) {
    try {
        const freshTree = await fetchRepoTree(owner, repo, branch);
        updateSyncStatus(Date.now());

        if (freshTree.sha !== cachedTree.sha) {
            // Count changes
            const oldPaths = new Set(cachedTree.files.map(f => f.path));
            const newPaths = new Set(freshTree.files.map(f => f.path));
            const added = freshTree.files.filter(f => !oldPaths.has(f.path)).length;
            const removed = cachedTree.files.filter(f => !newPaths.has(f.path)).length;
            const modified = freshTree.files.filter(f => {
                const old = cachedTree.files.find(o => o.path === f.path);
                return old && old.sha !== f.sha;
            }).length;

            const parts = [];
            if (added) parts.push(`${added} added`);
            if (removed) parts.push(`${removed} removed`);
            if (modified) parts.push(`${modified} modified`);
            const summary = parts.length ? parts.join(', ') : 'changes detected';

            // Re-render with fresh data
            const route = parseRoute();
            if (route.view === 'library') {
                renderLibraryView(freshTree.files, route.category);
            }
            showToast(`Library updated — ${summary}`, 'info', 4000);
        }
    } catch (err) {
        if (!navigator.onLine) {
            showToast('Offline — showing cached library', 'info', 4000);
        }
        // Silently fail on other errors — cached data is still shown
    }
}

function updateSyncStatus(timestamp) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    if (!timestamp) {
        el.textContent = '';
        return;
    }
    const update = () => {
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) {
            el.textContent = 'Last synced: just now';
        } else if (mins === 1) {
            el.textContent = 'Last synced: 1 minute ago';
        } else if (mins < 60) {
            el.textContent = `Last synced: ${mins} minutes ago`;
        } else {
            el.textContent = `Last synced: ${new Date(timestamp).toLocaleTimeString()}`;
        }
    };
    update();
    // Update every 30 seconds
    clearInterval(window._syncInterval);
    window._syncInterval = setInterval(update, 30000);
}

function manualRefresh() {
    const repoSettings = getRepoSettings();
    if (!repoSettings) return;

    const { owner, repo, branch } = repoSettings;
    const route = parseRoute();

    showToast('Refreshing...', 'info', 1500);
    fetchRepoTree(owner, repo, branch).then(freshTree => {
        updateSyncStatus(Date.now());
        if (route.view === 'library') {
            renderLibraryView(freshTree.files, route.category);
        }
        showToast('Library refreshed', 'success', 2000);
    }).catch(err => {
        showToast(`Refresh failed: ${err.message}`, 'error', 4000);
    });
}

// ---------------------------------------------------------------------------
// GitHub file loading (reader)
// ---------------------------------------------------------------------------

async function loadGitHubFile(filePath) {
    const repoSettings = getRepoSettings();
    if (!repoSettings) return;

    const { owner, repo, branch } = repoSettings;
    const filename = filePath.split('/').pop();

    // Show loading bar
    welcomeState.style.display = 'none';
    markdownContent.style.display = 'none';
    readerLoading.style.display = 'none';
    documentTitle.textContent = filename.replace(/\.(md|markdown)$/i, '');
    document.title = `${documentTitle.textContent} — Clarity`;

    // Add loading bar at top
    let loadingBar = document.querySelector('.reader-loading-bar');
    if (!loadingBar) {
        loadingBar = document.createElement('div');
        loadingBar.className = 'reader-loading-bar';
        document.body.appendChild(loadingBar);
    }
    loadingBar.style.display = 'block';

    try {
        const file = await fetchFileContent(owner, repo, filePath, branch);
        loadingBar.style.display = 'none';
        trackRecentFile(filePath);
        renderMarkdown(file.content, file.name);
    } catch (err) {
        loadingBar.style.display = 'none';

        // Specific error messages based on status code
        let title = 'Failed to load document';
        let message = err.message;
        let showRetry = false;

        if (err.status === 401) {
            title = 'Session expired';
            message = 'Your authentication has expired. Please sign in again.';
        } else if (err.status === 404) {
            title = 'File not found';
            message = 'This file is no longer in the repository. It may have been moved or deleted.';
        } else if (err.status === 403) {
            title = 'Access denied';
            message = err.message; // Includes rate limit info if applicable
        } else if (!navigator.onLine) {
            title = "Can't reach GitHub";
            message = 'You appear to be offline. Check your connection and try again.';
            showRetry = true;
        } else if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed')) {
            title = "Can't reach GitHub";
            message = 'Network error — check your connection and try again.';
            showRetry = true;
        }

        markdownContent.style.display = 'block';
        markdownContent.innerHTML = `
            <div class="reader-error">
                <h2>${title}</h2>
                <p>${message}</p>
                ${showRetry ? `<button class="back-to-library-btn" onclick="window.location.reload()">Retry</button>` : ''}
                <button class="back-to-library-btn" onclick="window.location.hash='#/library'">Back to Library</button>
            </div>
        `;
    }
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

backBtn.addEventListener('click', () => {
    navigateTo('#/library');
});

// ---------------------------------------------------------------------------
// Landing page interactions
// ---------------------------------------------------------------------------

function handleSignIn() {
    startAuth();
}

landingSignIn.addEventListener('click', handleSignIn);
landingCta.addEventListener('click', handleSignIn);

// Landing page file drop
landingDropZone.addEventListener('click', () => landingFileInput.click());

landingDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    landingDropZone.classList.add('drag-over');
});

landingDropZone.addEventListener('dragleave', () => {
    landingDropZone.classList.remove('drag-over');
});

landingDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    landingDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) openLocalFile(file);
});

landingFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) openLocalFile(file);
});

// ---------------------------------------------------------------------------
// Local file handling
// ---------------------------------------------------------------------------

function openLocalFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        // Switch to reader view for local file
        showView({ view: 'reader' });
        window.history.replaceState({}, '', window.location.pathname + '#/');
        renderMarkdown(e.target.result, file.name);
        documentTitle.textContent = `Local: ${file.name.replace(/\.(md|markdown|txt)$/i, '')}`;
        document.title = `${file.name.replace(/\.(md|markdown|txt)$/i, '')} — Clarity`;
    };
    reader.readAsText(file);
}

// Global drag and drop (works on all views)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    // Don't handle if landing drop zone or upload flow handles it
    if (e.target.closest('.landing-drop-zone') || e.target.closest('.library-drop-overlay')) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt'))) {
        openLocalFile(file);
    }
});

// ---------------------------------------------------------------------------
// Upload button
// ---------------------------------------------------------------------------

uploadBtn.addEventListener('click', () => {
    showUploadModal();
});

refreshBtn.addEventListener('click', () => {
    manualRefresh();
});

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ---------------------------------------------------------------------------
// Offline / Online detection
// ---------------------------------------------------------------------------

function showOfflineBanner() {
    if (document.getElementById('offlineBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.className = 'offline-banner';
    banner.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
        You're offline — cached content only
    `;
    document.body.prepend(banner);
}

function hideOfflineBanner() {
    document.getElementById('offlineBanner')?.remove();
}

window.addEventListener('offline', () => {
    showOfflineBanner();
});

window.addEventListener('online', () => {
    hideOfflineBanner();
    showToast('Back online', 'success', 2000);
    // Auto-refresh library if currently viewing it
    if (currentView === 'library') {
        const repoSettings = getRepoSettings();
        if (repoSettings) {
            const { owner, repo, branch } = repoSettings;
            fetchRepoTree(owner, repo, branch).then(freshTree => {
                updateSyncStatus(Date.now());
                const route = parseRoute();
                renderLibraryView(freshTree.files, route.category);
            }).catch(() => {});
        }
    }
});

// Show banner on load if offline
if (!navigator.onLine) {
    showOfflineBanner();
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

initReader();
initLibrary();
initFileManager((freshFiles) => {
    // Refresh library view with fresh data after file management operations
    const route = parseRoute();
    if (route.view === 'library') {
        renderLibraryView(freshFiles, route.category);
    }
});

async function init() {
    // 1. Check for OAuth callback params (returning from GitHub)
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
        try {
            await handleAuthCallback();
            // Clean URL and go to library or settings
            if (getRepoSettings()) {
                window.history.replaceState({}, '', window.location.pathname + '#/library');
            } else {
                window.history.replaceState({}, '', window.location.pathname + '#/');
                openSettings();
            }
        } catch (err) {
            console.error('OAuth callback failed:', err.message);
        }
    }

    // 2. Route to the correct view
    handleRouteChange();

    // 3. Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

init();
