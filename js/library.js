// library.js — Library view: category sidebar, file list, uploads

import { getRepoSettings } from './settings.js';
import { uploadFile, fetchRepoTree, getCachedTree } from './github.js';
import { openFileActionMenu, openFolderActionMenu, startNewFolder } from './filemanager.js';

// ---------------------------------------------------------------------------
// Recently opened files (localStorage, per user namespace)
// ---------------------------------------------------------------------------

const MAX_RECENT = 10;

function getRecentKey() {
    try {
        const auth = JSON.parse(localStorage.getItem('clarity-auth') || '{}');
        const username = auth?.user?.login || '_anonymous';
        return `clarity:${username}:recent`;
    } catch {
        return 'clarity:_anonymous:recent';
    }
}

export function getRecentFiles() {
    try {
        return JSON.parse(localStorage.getItem(getRecentKey()) || '[]');
    } catch {
        return [];
    }
}

function saveRecentFiles(recents) {
    try {
        localStorage.setItem(getRecentKey(), JSON.stringify(recents));
    } catch { /* ignore */ }
}

/**
 * Record a file as recently opened. Called from app.js when a GitHub file is loaded.
 */
export function trackRecentFile(filePath) {
    const recents = getRecentFiles();
    // Remove existing entry for this path
    const filtered = recents.filter(r => r.path !== filePath);
    // Add to front
    filtered.unshift({ path: filePath, openedAt: Date.now() });
    // Trim to max
    saveRecentFiles(filtered.slice(0, MAX_RECENT));
}

/**
 * Update recent files list when a file is renamed/moved.
 */
export function updateRecentFilePath(oldPath, newPath) {
    const recents = getRecentFiles();
    let changed = false;
    recents.forEach(r => {
        if (r.path === oldPath) {
            r.path = newPath;
            changed = true;
        }
    });
    if (changed) saveRecentFiles(recents);
}

/**
 * Remove a file from recents (when deleted).
 */
export function removeRecentFile(filePath) {
    const recents = getRecentFiles();
    const filtered = recents.filter(r => r.path !== filePath);
    if (filtered.length !== recents.length) saveRecentFiles(filtered);
}

// Utilities (inline to avoid circular dependency with app.js)
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// DOM references
let libraryCategories;
let libraryContent;
let currentFiles = [];
let currentCategory = null;
let searchQuery = '';
let searchInput = null;
let focusedFileIndex = -1;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initLibrary() {
    libraryCategories = document.getElementById('libraryCategories');
    libraryContent = document.getElementById('libraryContent');
}

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------

/**
 * Build a structured library from the flat file list.
 * Groups files by top-level folder. Root-level files go to "Uncategorized".
 */
function buildLibrary(files) {
    const categories = {};
    const uncategorized = [];

    files.forEach(file => {
        const parts = file.path.split('/');
        if (parts.length === 1) {
            uncategorized.push(file);
        } else {
            const folder = parts[0];
            if (!categories[folder]) {
                categories[folder] = [];
            }
            categories[folder].push(file);
        }
    });

    // Sort category names alphabetically
    const sortedCategories = Object.keys(categories)
        .sort()
        .map(name => ({
            name,
            path: name,
            fileCount: categories[name].length,
            files: categories[name]
        }));

    return { categories: sortedCategories, uncategorized };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the full library view (sidebar + file list).
 * Called by app.js when navigating to the library.
 */
export function renderLibraryView(files, activeCategory = null, loading = false, error = null) {
    currentFiles = files;
    currentCategory = activeCategory;
    // Reset search when category changes
    searchQuery = '';

    const library = buildLibrary(files);

    renderCategories(library, activeCategory);
    renderFileList(library, activeCategory, loading, error);
}

/**
 * Focus the search input. Called from app.js on ⌘K or /.
 */
export function focusSearch() {
    const input = libraryContent?.querySelector('.search-input');
    if (input) {
        input.focus();
        input.select();
    }
}

/**
 * Clear search and restore category view.
 */
export function clearSearch() {
    searchQuery = '';
    const input = libraryContent?.querySelector('.search-input');
    if (input) input.value = '';
    // Re-render current view without filter
    const library = buildLibrary(currentFiles);
    renderFileListContent(library, currentCategory);
}

/**
 * Apply search filter to the file list.
 */
function applySearchFilter(query) {
    searchQuery = query;
    const q = query.trim().toLowerCase();

    if (!q) {
        // Restore unfiltered view
        const library = buildLibrary(currentFiles);
        renderFileListContent(library, currentCategory);
        return;
    }

    // Filter across ALL files (ignore current category when searching)
    const filtered = currentFiles.filter(file => {
        const filename = file.path.split('/').pop().toLowerCase();
        const folderPath = file.path.toLowerCase();
        return filename.includes(q) || folderPath.includes(q);
    });

    renderSearchResults(filtered, q);
}

function renderCategories(library, activeCategory) {
    const allCount = currentFiles.length;

    let html = `
        <a class="library-category-item ${!activeCategory ? 'active' : ''}"
           href="#/library" data-category="">
            <span class="library-category-name">All Documents</span>
            <span class="library-category-count">${allCount}</span>
        </a>
    `;

    library.categories.forEach(cat => {
        const isActive = activeCategory === cat.path;
        html += `
            <div class="library-category-row">
                <a class="library-category-item ${isActive ? 'active' : ''}"
                   href="#/library/${encodeURIComponent(cat.path)}" data-category="${cat.path}">
                    <svg class="library-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="library-category-name">${cat.name}</span>
                    <span class="library-category-count">${cat.fileCount}</span>
                </a>
                <button class="fm-dots-btn fm-folder-dots" data-folder="${cat.path}" title="Folder actions">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
            </div>
        `;
    });

    if (library.uncategorized.length > 0) {
        const isActive = activeCategory === '_uncategorized';
        html += `
            <a class="library-category-item ${isActive ? 'active' : ''}"
               href="#/library/_uncategorized" data-category="_uncategorized">
                <span class="library-category-name">Uncategorized</span>
                <span class="library-category-count">${library.uncategorized.length}</span>
            </a>
        `;
    }

    // Add "New folder" button at bottom
    html += `
        <button class="fm-new-folder-btn" id="newFolderBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New folder
        </button>
    `;

    libraryCategories.innerHTML = html;

    // Wire up "New folder" button
    const newFolderBtn = libraryCategories.querySelector('#newFolderBtn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            startNewFolder();
        });
    }

    // Wire up folder action menus
    libraryCategories.querySelectorAll('.fm-folder-dots').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const folder = btn.getAttribute('data-folder');
            openFolderActionMenu(e, folder);
        });
    });

    // On mobile, clicking a category auto-closes sidebar
    libraryCategories.querySelectorAll('.library-category-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                document.getElementById('app').classList.add('outline-collapsed');
            }
        });
    });
}

function renderFileList(library, activeCategory, loading = false, error = null) {
    // Always render search bar at top, then content below
    const searchBarHtml = `
        <div class="search-bar">
            <svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" class="search-input" placeholder="Search documents…" aria-label="Search documents">
            <button class="search-clear-btn" style="display: none;" title="Clear search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <kbd class="search-shortcut">⌘K</kbd>
        </div>
        <div class="library-file-area" id="libraryFileArea"></div>
        <div class="library-drop-overlay" id="libraryDropOverlay" style="display: none;">
            <p>Drop to upload</p>
        </div>
    `;

    libraryContent.innerHTML = searchBarHtml;

    // Wire up search input
    const input = libraryContent.querySelector('.search-input');
    const clearBtn = libraryContent.querySelector('.search-clear-btn');
    const shortcutHint = libraryContent.querySelector('.search-shortcut');
    searchInput = input;

    input.addEventListener('input', () => {
        const q = input.value;
        clearBtn.style.display = q ? 'flex' : 'none';
        shortcutHint.style.display = q ? 'none' : '';
        applySearchFilter(q);
    });

    input.addEventListener('focus', () => {
        shortcutHint.style.display = 'none';
    });

    input.addEventListener('blur', () => {
        if (!input.value) shortcutHint.style.display = '';
    });

    clearBtn.addEventListener('click', () => {
        clearSearch();
        input.focus();
    });

    // Render file content into the file area
    renderFileListContent(library, activeCategory, loading, error);

    // Wire up drag-and-drop upload in library
    setupLibraryDragDrop();
}

/**
 * Render the file list content (below the search bar).
 */
function renderFileListContent(library, activeCategory, loading = false, error = null) {
    const fileArea = libraryContent.querySelector('#libraryFileArea');
    if (!fileArea) return;

    if (loading) {
        fileArea.innerHTML = `
            <div class="skeleton-list">
                ${Array(6).fill('').map(() => `
                    <div class="skeleton-file-row">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-text-group">
                            <div class="skeleton-text skeleton-text-name"></div>
                            <div class="skeleton-text skeleton-text-path"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }

    if (error) {
        fileArea.innerHTML = `
            <div class="library-empty">
                <div class="library-empty-icon library-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <p class="library-error">${error}</p>
            </div>
        `;
        return;
    }

    // Get files for current view
    let files;

    if (!activeCategory) {
        files = currentFiles;
    } else if (activeCategory === '_uncategorized') {
        files = library.uncategorized;
    } else {
        const cat = library.categories.find(c => c.path === activeCategory);
        files = cat ? cat.files : [];
    }

    if (files.length === 0 && currentFiles.length === 0) {
        fileArea.innerHTML = `
            <div class="library-empty">
                <div class="library-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <h3>No documents yet</h3>
                <p>Upload markdown files to get started, or connect a repo with .md files in Settings.</p>
            </div>
        `;
        return;
    }

    if (files.length === 0) {
        fileArea.innerHTML = `
            <div class="library-empty">
                <p>No files in this category.</p>
            </div>
        `;
        return;
    }

    // Build recent section + file list
    let html = '';

    // Show "Recent" section only on "All Documents" view (no active category)
    if (!activeCategory) {
        const recents = getRecentFiles();
        // Filter to files that still exist in the tree
        const validRecents = recents.filter(r => currentFiles.some(f => f.path === r.path));

        if (validRecents.length > 0) {
            // "Continue reading" prompt for most recent file
            const mostRecent = validRecents[0];
            const mostRecentName = mostRecent.path.split('/').pop().replace(/\.(md|markdown)$/i, '');

            html += `
                <a class="continue-reading" href="#/read/${encodeURIComponent(mostRecent.path)}">
                    <span class="continue-reading-label">Continue reading</span>
                    <span class="continue-reading-name">${escapeHtml(mostRecentName)}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </a>
            `;

            // Show up to 5 recent files as a compact list
            if (validRecents.length > 1) {
                html += `<div class="recent-section">`;
                html += `<div class="recent-section-header">Recently opened</div>`;
                html += `<div class="recent-list">`;
                validRecents.slice(0, 5).forEach(r => {
                    const name = r.path.split('/').pop().replace(/\.(md|markdown)$/i, '');
                    const folder = r.path.includes('/') ? r.path.split('/').slice(0, -1).join('/') : null;
                    html += `
                        <a class="recent-item" href="#/read/${encodeURIComponent(r.path)}">
                            <span class="recent-item-name">${escapeHtml(name)}</span>
                            ${folder ? `<span class="recent-item-path">${escapeHtml(folder)}</span>` : ''}
                        </a>
                    `;
                });
                html += `</div></div>`;
            }
        }
    }

    html += buildFileListHtml(files, activeCategory);
    fileArea.innerHTML = html;
    wireUpFileActions(fileArea, activeCategory);
}

/**
 * Render search results grouped by category.
 */
function renderSearchResults(filtered, query) {
    const fileArea = libraryContent.querySelector('#libraryFileArea');
    if (!fileArea) return;

    if (filtered.length === 0) {
        fileArea.innerHTML = `
            <div class="library-empty">
                <p>No documents matching "<strong>${escapeHtml(query)}</strong>"</p>
            </div>
        `;
        return;
    }

    // Group results by folder
    const library = buildLibrary(filtered);
    let html = '';

    // Show results with category headers when searching across all
    if (library.uncategorized.length > 0) {
        html += `<div class="search-results-group">
            <div class="search-results-header">Uncategorized</div>
            ${buildFileListHtml(library.uncategorized, null, true)}
        </div>`;
    }

    library.categories.forEach(cat => {
        html += `<div class="search-results-group">
            <div class="search-results-header">${escapeHtml(cat.name)}</div>
            ${buildFileListHtml(cat.files, cat.path, true)}
        </div>`;
    });

    fileArea.innerHTML = html;
    wireUpFileActions(fileArea, currentCategory);
}

/**
 * Build file list HTML (shared between normal and search views).
 */
function buildFileListHtml(files, activeCategory, showFolderAlways = false) {
    const sorted = [...files].sort((a, b) => {
        const nameA = a.path.split('/').pop().toLowerCase();
        const nameB = b.path.split('/').pop().toLowerCase();
        return nameA.localeCompare(nameB);
    });

    let html = '<div class="library-file-list">';

    sorted.forEach(file => {
        const filename = file.path.split('/').pop();
        const displayName = filename.replace(/\.(md|markdown)$/i, '');
        const folderPath = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : null;
        const showFolder = (showFolderAlways || !activeCategory) && folderPath;

        html += `
            <div class="library-file-row" data-filepath="${file.path}" data-sha="${file.sha}">
                <a class="library-file-item" href="#/read/${encodeURIComponent(file.path)}">
                    <div class="library-file-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                    <div class="library-file-info">
                        <span class="library-file-name">${displayName}</span>
                        ${showFolder ? `<span class="library-file-path">${folderPath}</span>` : ''}
                    </div>
                </a>
                <button class="fm-dots-btn" title="Actions" data-filepath="${file.path}" data-sha="${file.sha}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

/**
 * Wire up action menus on file rows within a container.
 */
function wireUpFileActions(container, activeCategory) {
    container.querySelectorAll('.fm-dots-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filepath = btn.getAttribute('data-filepath');
            const sha = btn.getAttribute('data-sha');
            openFileActionMenu(e, { path: filepath, sha }, activeCategory);
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

function getFileRows() {
    const fileArea = libraryContent?.querySelector('#libraryFileArea');
    if (!fileArea) return [];
    return [...fileArea.querySelectorAll('.library-file-row')];
}

function setFocusedFile(index) {
    const rows = getFileRows();
    // Clear previous focus
    rows.forEach(r => r.classList.remove('kb-focused'));
    focusedFileIndex = index;

    if (index >= 0 && index < rows.length) {
        rows[index].classList.add('kb-focused');
        rows[index].scrollIntoView({ block: 'nearest' });
    }
}

/**
 * Handle keyboard navigation in library view. Called from app.js keydown handler.
 * Returns true if the event was handled.
 */
export function handleLibraryKeyNav(e) {
    const rows = getFileRows();
    if (rows.length === 0) return false;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = focusedFileIndex < rows.length - 1 ? focusedFileIndex + 1 : 0;
        setFocusedFile(next);
        // Blur search so arrow keys don't move cursor
        if (document.activeElement?.classList.contains('search-input')) {
            document.activeElement.blur();
        }
        return true;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = focusedFileIndex > 0 ? focusedFileIndex - 1 : rows.length - 1;
        setFocusedFile(prev);
        if (document.activeElement?.classList.contains('search-input')) {
            document.activeElement.blur();
        }
        return true;
    }

    if (e.key === 'Enter' && focusedFileIndex >= 0) {
        // Don't handle if user is typing in search
        if (document.activeElement?.classList.contains('search-input')) return false;
        e.preventDefault();
        const link = rows[focusedFileIndex]?.querySelector('.library-file-item');
        if (link) {
            window.location.hash = link.getAttribute('href');
        }
        return true;
    }

    if ((e.key === 'Delete' || (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))) && focusedFileIndex >= 0) {
        // Desktop only — open delete confirmation for focused file
        if (document.activeElement?.classList.contains('search-input')) return false;
        e.preventDefault();
        const row = rows[focusedFileIndex];
        const filepath = row?.getAttribute('data-filepath');
        const sha = row?.getAttribute('data-sha');
        if (filepath && sha) {
            const dotsBtn = row.querySelector('.fm-dots-btn');
            if (dotsBtn) {
                // Simulate clicking the delete action directly
                openFileActionMenu({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: dotsBtn }, { path: filepath, sha }, currentCategory);
            }
        }
        return true;
    }

    return false;
}

/**
 * Reset keyboard focus (e.g., when view changes).
 */
export function resetKeyboardFocus() {
    focusedFileIndex = -1;
    getFileRows().forEach(r => r.classList.remove('kb-focused'));
}

// ---------------------------------------------------------------------------
// Library drag-and-drop upload
// ---------------------------------------------------------------------------

function setupLibraryDragDrop() {
    const container = libraryContent;
    const overlay = document.getElementById('libraryDropOverlay');
    if (!overlay) return;

    let dragCounter = 0;

    container.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.style.display = 'flex';
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    container.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.style.display = 'none';
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        overlay.style.display = 'none';

        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt'))) {
            handleUploadFile(file, currentCategory);
        }
    });
}

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------

/**
 * Show upload modal with destination picker.
 */
export function showUploadModal() {
    // Create file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            showDestinationPicker(file);
        }
    });
    input.click();
}

function showDestinationPicker(file) {
    const library = buildLibrary(currentFiles);

    // Build folder list
    const folders = library.categories.map(c => c.path);

    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay visible';
    overlay.innerHTML = `
        <div class="settings-modal">
            <div class="settings-header">
                <h2 class="settings-title">Upload: ${file.name}</h2>
                <button class="settings-close" id="uploadModalClose" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="settings-body">
                <div class="settings-section">
                    <label class="settings-label">Destination folder</label>
                    <div class="upload-folder-list" id="uploadFolderList">
                        <label class="upload-folder-option">
                            <input type="radio" name="uploadDest" value="" ${!currentCategory ? 'checked' : ''}>
                            <span>/ (root)</span>
                        </label>
                        ${folders.map(f => `
                            <label class="upload-folder-option">
                                <input type="radio" name="uploadDest" value="${f}" ${currentCategory === f ? 'checked' : ''}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <span>${f}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="upload-new-folder" id="uploadNewFolder">
                        <button class="upload-new-folder-btn" id="newFolderBtn">+ New folder</button>
                        <div class="upload-new-folder-input" id="newFolderInput" style="display: none;">
                            <input type="text" class="settings-input" id="newFolderName" placeholder="folder-name">
                            <button class="settings-btn settings-btn-primary" id="newFolderConfirm">Add</button>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <button class="settings-btn settings-btn-primary" id="uploadConfirmBtn">Upload</button>
                    <span class="settings-status" id="uploadStatus"></span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close
    const close = () => { overlay.remove(); };
    overlay.querySelector('#uploadModalClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // New folder
    overlay.querySelector('#newFolderBtn').addEventListener('click', () => {
        overlay.querySelector('#newFolderBtn').style.display = 'none';
        overlay.querySelector('#newFolderInput').style.display = 'flex';
        overlay.querySelector('#newFolderName').focus();
    });

    overlay.querySelector('#newFolderConfirm').addEventListener('click', () => {
        const name = overlay.querySelector('#newFolderName').value.trim();
        if (!name) return;

        // Add to folder list
        const folderList = overlay.querySelector('#uploadFolderList');
        const label = document.createElement('label');
        label.className = 'upload-folder-option';
        label.innerHTML = `
            <input type="radio" name="uploadDest" value="${name}" checked>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${name}</span>
        `;
        folderList.appendChild(label);

        // Reset input
        overlay.querySelector('#newFolderBtn').style.display = 'block';
        overlay.querySelector('#newFolderInput').style.display = 'none';
        overlay.querySelector('#newFolderName').value = '';
    });

    // Upload confirm
    overlay.querySelector('#uploadConfirmBtn').addEventListener('click', async () => {
        const selected = overlay.querySelector('input[name="uploadDest"]:checked');
        const folder = selected ? selected.value : '';
        const status = overlay.querySelector('#uploadStatus');
        const btn = overlay.querySelector('#uploadConfirmBtn');

        btn.disabled = true;
        status.textContent = 'Uploading...';
        status.className = 'settings-status';

        try {
            await handleUploadFile(file, folder || null);
            close();
        } catch (err) {
            status.textContent = `Failed: ${err.message}`;
            status.className = 'settings-status error';
            btn.disabled = false;
        }
    });

    // Escape to close
    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', onKeydown);
        }
    };
    document.addEventListener('keydown', onKeydown);
}

/**
 * Handle uploading a file to GitHub.
 */
async function handleUploadFile(file, folder) {
    const repoSettings = getRepoSettings();
    if (!repoSettings) throw new Error('No repo configured');

    const { owner, repo, branch } = repoSettings;

    // Read file content
    const content = await readFileAsText(file);

    // Build path
    const path = folder ? `${folder}/${file.name}` : file.name;

    // Check for collision
    const tree = getCachedTree(owner, repo);
    if (tree) {
        const existing = tree.files.find(f => f.path === path);
        if (existing) {
            const confirmed = confirm(`A file named "${file.name}" already exists in ${folder ? '/' + folder : 'root'}. Replace it?`);
            if (!confirmed) return;
        }
    }

    // Upload
    await uploadFile(owner, repo, path, content, `Upload: ${file.name} via Clarity`, branch);

    // Refresh tree
    const freshTree = await fetchRepoTree(owner, repo, branch);
    showToast(`Uploaded ${file.name} to ${folder ? '/' + folder : 'root'}`, 'success');

    // Re-render library
    renderLibraryView(freshTree.files, currentCategory);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
