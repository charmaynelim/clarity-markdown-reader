// app.js — Initialization, routing, theme toggle, keyboard shortcuts, view management

import { initReader, renderMarkdown } from './reader.js';
import { isAuthenticated, handleAuthCallback, startAuth } from './auth.js';
import { fetchRepoTree, getCachedTree, fetchFileContent } from './github.js';
import { openSettings, getRepoSettings } from './settings.js';
import { initLibrary, renderLibraryView, showUploadModal } from './library.js';

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
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        if (currentView === 'library' || currentView === 'reader') {
            toggleSidebar();
        }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    }
    if (e.key === 'Escape' && !appShell.classList.contains('outline-collapsed')) {
        appShell.classList.add('outline-collapsed');
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
        uploadBtn.style.display = 'none';
        fileInputWrapper.style.display = 'block';
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
        // Background refresh
        fetchRepoTree(owner, repo, branch).then(freshTree => {
            if (freshTree.sha !== tree.sha) {
                renderLibraryView(freshTree.files, category);
            }
        }).catch(() => {});
    } else {
        // No cache — show loading then fetch
        renderLibraryView([], category, true);
        try {
            tree = await fetchRepoTree(owner, repo, branch);
            renderLibraryView(tree.files, category);
        } catch (err) {
            renderLibraryView([], category, false, err.message);
        }
    }
}

// ---------------------------------------------------------------------------
// GitHub file loading (reader)
// ---------------------------------------------------------------------------

async function loadGitHubFile(filePath) {
    const repoSettings = getRepoSettings();
    if (!repoSettings) return;

    const { owner, repo, branch } = repoSettings;
    const filename = filePath.split('/').pop();

    // Show loading
    welcomeState.style.display = 'none';
    markdownContent.style.display = 'none';
    readerLoading.style.display = 'flex';
    documentTitle.textContent = filename.replace(/\.(md|markdown)$/i, '');
    document.title = `${documentTitle.textContent} — Clarity`;

    try {
        const file = await fetchFileContent(owner, repo, filePath, branch);
        readerLoading.style.display = 'none';
        renderMarkdown(file.content, file.name);
    } catch (err) {
        readerLoading.style.display = 'none';
        markdownContent.style.display = 'block';
        markdownContent.innerHTML = `
            <div class="reader-error">
                <h2>Failed to load document</h2>
                <p>${err.message}</p>
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
// Initialize
// ---------------------------------------------------------------------------

initReader();
initLibrary();

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
}

init();
