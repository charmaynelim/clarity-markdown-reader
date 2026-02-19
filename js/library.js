// library.js — Library view: category sidebar, file list, uploads

import { getRepoSettings } from './settings.js';
import { uploadFile, fetchRepoTree, getCachedTree } from './github.js';
import { openFileActionMenu, openFolderActionMenu, startNewFolder } from './filemanager.js';

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

    const library = buildLibrary(files);

    renderCategories(library, activeCategory);
    renderFileList(library, activeCategory, loading, error);
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
    if (loading) {
        libraryContent.innerHTML = `
            <div class="library-empty">
                <div class="reader-loading-spinner"></div>
                <p>Loading your documents...</p>
            </div>
        `;
        return;
    }

    if (error) {
        libraryContent.innerHTML = `
            <div class="library-empty">
                <p class="library-error">Failed to load: ${error}</p>
            </div>
        `;
        return;
    }

    // Get files for current view
    let files;
    let categoryName;

    if (!activeCategory) {
        files = currentFiles;
        categoryName = 'All Documents';
    } else if (activeCategory === '_uncategorized') {
        files = library.uncategorized;
        categoryName = 'Uncategorized';
    } else {
        const cat = library.categories.find(c => c.path === activeCategory);
        files = cat ? cat.files : [];
        categoryName = activeCategory;
    }

    if (files.length === 0 && currentFiles.length === 0) {
        libraryContent.innerHTML = `
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
        libraryContent.innerHTML = `
            <div class="library-empty">
                <p>No files in this category.</p>
            </div>
        `;
        return;
    }

    // Sort files alphabetically by filename
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
        const showFolder = !activeCategory && folderPath;

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

    // Drag-and-drop upload overlay for library
    html += `
        <div class="library-drop-overlay" id="libraryDropOverlay" style="display: none;">
            <p>Drop to upload</p>
        </div>
    `;

    libraryContent.innerHTML = html;

    // Wire up three-dot action menus on file rows
    libraryContent.querySelectorAll('.fm-dots-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filepath = btn.getAttribute('data-filepath');
            const sha = btn.getAttribute('data-sha');
            openFileActionMenu(e, { path: filepath, sha }, activeCategory);
        });
    });

    // Wire up drag-and-drop upload in library
    setupLibraryDragDrop();
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
