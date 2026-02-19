// filemanager.js — File/folder CRUD operations + UI (action menus, modals, undo)

import { getRepoSettings } from './settings.js';
import {
    renameFile, moveFile, deleteFile,
    createFolder, renameFolder, deleteFolder,
    fetchRepoTree, getCachedTree, cacheTree
} from './github.js';
import { updateRecentFilePath, removeRecentFile } from './library.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let activeMenu = null;        // currently open action menu DOM node
let undoTimer = null;         // current undo toast timeout
let undoCallback = null;      // undo function for current toast
let refreshCallback = null;   // set by initFileManager — re-renders library

export function initFileManager(onRefresh) {
    refreshCallback = onRefresh;

    // Close action menus on outside click
    document.addEventListener('click', (e) => {
        if (activeMenu && !e.target.closest('.fm-action-menu') && !e.target.closest('.fm-dots-btn')) {
            closeActionMenu();
        }
    });

    // Close action menus on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeActionMenu();
        }
    });
}

// ---------------------------------------------------------------------------
// Toast helper (with optional undo)
// ---------------------------------------------------------------------------

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

function showUndoToast(message, onUndo, duration = 5000) {
    // Remove any existing undo toast
    clearUndoToast();

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-info fm-undo-toast';
    toast.innerHTML = `
        <span>${message}</span>
        <button class="fm-undo-btn">Undo</button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));

    toast.querySelector('.fm-undo-btn').addEventListener('click', () => {
        clearUndoToast();
        onUndo();
    });

    undoCallback = onUndo;
    undoTimer = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
        undoTimer = null;
        undoCallback = null;
    }, duration);
}

function clearUndoToast() {
    if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
    }
    undoCallback = null;
    document.querySelectorAll('.fm-undo-toast').forEach(t => t.remove());
}

// ---------------------------------------------------------------------------
// Optimistic UI framework
// ---------------------------------------------------------------------------

async function optimisticAction({ apply, revert, action, successMsg, undoAction }) {
    // 1. Apply optimistic update
    apply();

    try {
        // 2. Run the API call
        await action();

        // 3. Refresh tree from GitHub
        const settings = getRepoSettings();
        if (settings) {
            const freshTree = await fetchRepoTree(settings.owner, settings.repo, settings.branch);
            if (refreshCallback) refreshCallback(freshTree.files);
        }

        // 4. Show success toast (with undo if applicable)
        if (undoAction) {
            showUndoToast(successMsg, undoAction);
        } else {
            showToast(successMsg, 'success');
        }
    } catch (err) {
        // 5. Revert on failure
        revert();
        showToast(`Failed: ${err.message}`, 'error', 5000);
    }
}

// ---------------------------------------------------------------------------
// Get repo settings helper
// ---------------------------------------------------------------------------

function getSettings() {
    const settings = getRepoSettings();
    if (!settings) throw new Error('No repo configured');
    return settings;
}

function checkOnline() {
    if (!navigator.onLine) {
        showToast('You\'re offline — file operations are disabled', 'error', 3000);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// File Action Menu
// ---------------------------------------------------------------------------

export function openFileActionMenu(e, file, currentCategory) {
    e.preventDefault();
    e.stopPropagation();
    closeActionMenu();
    if (!checkOnline()) return;

    const btn = e.currentTarget;
    const menu = document.createElement('div');
    menu.className = 'fm-action-menu';
    menu.innerHTML = `
        <button class="fm-menu-item" data-action="rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            Rename
        </button>
        <button class="fm-menu-item" data-action="move">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            Move to…
        </button>
        <button class="fm-menu-item fm-menu-item-danger" data-action="delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
        </button>
    `;

    // Position relative to the button
    document.body.appendChild(menu);
    const btnRect = btn.getBoundingClientRect();
    menu.style.top = `${btnRect.bottom + 4}px`;
    menu.style.left = `${btnRect.right - menu.offsetWidth}px`;

    // Keep menu on screen
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.left < 8) menu.style.left = '8px';
    if (menuRect.bottom > window.innerHeight - 8) {
        menu.style.top = `${btnRect.top - menuRect.height - 4}px`;
    }

    requestAnimationFrame(() => menu.classList.add('visible'));

    // Wire up actions
    menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
        closeActionMenu();
        startInlineRename(file, currentCategory);
    });

    menu.querySelector('[data-action="move"]').addEventListener('click', () => {
        closeActionMenu();
        openMoveModal(file, currentCategory);
    });

    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
        closeActionMenu();
        confirmDeleteFile(file, currentCategory);
    });

    activeMenu = menu;
}

function closeActionMenu() {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

// ---------------------------------------------------------------------------
// Folder Action Menu
// ---------------------------------------------------------------------------

export function openFolderActionMenu(e, folderName) {
    e.preventDefault();
    e.stopPropagation();
    closeActionMenu();
    if (!checkOnline()) return;

    const btn = e.currentTarget;
    const menu = document.createElement('div');
    menu.className = 'fm-action-menu';
    menu.innerHTML = `
        <button class="fm-menu-item" data-action="rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            Rename
        </button>
        <button class="fm-menu-item fm-menu-item-danger" data-action="delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
        </button>
    `;

    document.body.appendChild(menu);
    const btnRect = btn.getBoundingClientRect();
    menu.style.top = `${btnRect.bottom + 4}px`;
    menu.style.left = `${btnRect.right - menu.offsetWidth}px`;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.left < 8) menu.style.left = '8px';
    if (menuRect.bottom > window.innerHeight - 8) {
        menu.style.top = `${btnRect.top - menuRect.height - 4}px`;
    }

    requestAnimationFrame(() => menu.classList.add('visible'));

    menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
        closeActionMenu();
        startFolderRename(folderName);
    });

    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
        closeActionMenu();
        confirmDeleteFolder(folderName);
    });

    activeMenu = menu;
}

// ---------------------------------------------------------------------------
// Inline File Rename
// ---------------------------------------------------------------------------

function startInlineRename(file, currentCategory) {
    const filename = file.path.split('/').pop();
    const baseName = filename.replace(/\.(md|markdown)$/i, '');
    const ext = filename.match(/\.(md|markdown)$/i)?.[0] || '.md';

    // Find the file item in the DOM
    const fileItems = document.querySelectorAll('.library-file-item');
    let targetItem = null;
    for (const item of fileItems) {
        if (item.getAttribute('href') === `#/read/${encodeURIComponent(file.path)}`) {
            targetItem = item;
            break;
        }
    }
    if (!targetItem) return;

    const nameEl = targetItem.querySelector('.library-file-name');
    if (!nameEl) return;

    // Replace name with input
    const originalName = nameEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fm-inline-rename';
    input.value = baseName;

    // Prevent the link from navigating
    targetItem.addEventListener('click', preventNav);
    function preventNav(ev) { ev.preventDefault(); }

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    function finish(save) {
        input.replaceWith(nameEl);
        targetItem.removeEventListener('click', preventNav);

        if (!save) return;

        let newName = input.value.trim();
        if (!newName) return;
        if (!newName.match(/\.(md|markdown)$/i)) newName += ext;

        if (newName === filename) return;

        const folderPath = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';
        const newPath = folderPath ? `${folderPath}/${newName}` : newName;

        // Check collision
        const settings = getSettings();
        const tree = getCachedTree(settings.owner, settings.repo);
        if (tree && tree.files.some(f => f.path === newPath)) {
            showToast(`A file named "${newName}" already exists in this folder`, 'error');
            return;
        }

        const oldPath = file.path;
        const displayNew = newName.replace(/\.(md|markdown)$/i, '');

        optimisticAction({
            apply: () => {
                nameEl.textContent = displayNew;
                targetItem.setAttribute('href', `#/read/${encodeURIComponent(newPath)}`);
            },
            revert: () => {
                nameEl.textContent = originalName;
                targetItem.setAttribute('href', `#/read/${encodeURIComponent(oldPath)}`);
            },
            action: async () => {
                await renameFile(settings.owner, settings.repo, oldPath, newPath,
                    `Renamed ${filename} → ${newName} via Clarity`, settings.branch);
                updateRecentFilePath(oldPath, newPath);
            },
            successMsg: `Renamed ${filename} → ${newName}`,
            undoAction: () => {
                optimisticAction({
                    apply: () => {},
                    revert: () => {},
                    action: async () => {
                        await renameFile(settings.owner, settings.repo, newPath, oldPath,
                            `Undo rename: ${newName} → ${filename} via Clarity`, settings.branch);
                        updateRecentFilePath(newPath, oldPath);
                    },
                    successMsg: `Undid rename — restored ${filename}`
                });
            }
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

// ---------------------------------------------------------------------------
// Move To Modal
// ---------------------------------------------------------------------------

function openMoveModal(file, currentCategory) {
    const settings = getSettings();
    const tree = getCachedTree(settings.owner, settings.repo);
    if (!tree) { showToast('No cached tree — please refresh', 'error'); return; }

    // Build folder list from tree (including known empty folders)
    const folders = new Set();
    tree.files.forEach(f => {
        if (f.path.includes('/')) {
            folders.add(f.path.split('/')[0]);
        }
    });
    if (tree.folders) {
        tree.folders.forEach(f => folders.add(f));
    }

    const filename = file.path.split('/').pop();
    const currentFolder = file.path.includes('/') ? file.path.split('/')[0] : '';

    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay visible';
    overlay.innerHTML = `
        <div class="settings-modal">
            <div class="settings-header">
                <h2 class="settings-title">Move: ${filename}</h2>
                <button class="settings-close fm-modal-close" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="settings-body">
                <div class="settings-section">
                    <label class="settings-label">Destination folder</label>
                    <div class="upload-folder-list" id="moveFolderList">
                        <label class="upload-folder-option ${currentFolder === '' ? 'fm-current-folder' : ''}">
                            <input type="radio" name="moveDest" value="" ${currentFolder === '' ? 'disabled' : ''}>
                            <span>/ (root) ${currentFolder === '' ? '(current)' : ''}</span>
                        </label>
                        ${[...folders].sort().map(f => `
                            <label class="upload-folder-option ${currentFolder === f ? 'fm-current-folder' : ''}">
                                <input type="radio" name="moveDest" value="${f}" ${currentFolder === f ? 'disabled' : ''}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <span>${f} ${currentFolder === f ? '(current)' : ''}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="settings-section">
                    <button class="settings-btn settings-btn-primary" id="moveConfirmBtn">Move here</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.fm-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const onKeydown = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeydown); }
    };
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('#moveConfirmBtn').addEventListener('click', () => {
        const selected = overlay.querySelector('input[name="moveDest"]:checked');
        if (!selected) { showToast('Select a destination folder', 'error'); return; }

        const destFolder = selected.value;
        const newPath = destFolder ? `${destFolder}/${filename}` : filename;
        const oldPath = file.path;

        if (newPath === oldPath) { close(); return; }

        close();

        const destLabel = destFolder ? `/${destFolder}` : '/ (root)';

        optimisticAction({
            apply: () => {
                // Optimistically remove from current file list
                const row = document.querySelector(`.library-file-row[data-filepath="${oldPath}"]`);
                if (row) row.style.display = 'none';
            },
            revert: () => {
                const row = document.querySelector(`.library-file-row[data-filepath="${oldPath}"]`);
                if (row) row.style.display = '';
            },
            action: async () => {
                await moveFile(settings.owner, settings.repo, oldPath, newPath,
                    `Moved ${filename} to ${destLabel} via Clarity`, settings.branch);
                updateRecentFilePath(oldPath, newPath);
            },
            successMsg: `Moved ${filename} to ${destLabel}`,
            undoAction: () => {
                optimisticAction({
                    apply: () => {},
                    revert: () => {},
                    action: async () => {
                        await moveFile(settings.owner, settings.repo, newPath, oldPath,
                            `Undo move: ${filename} back to ${currentFolder || 'root'} via Clarity`, settings.branch);
                        updateRecentFilePath(newPath, oldPath);
                    },
                    successMsg: `Undid move — restored ${filename}`
                });
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Delete File Confirmation
// ---------------------------------------------------------------------------

function confirmDeleteFile(file, currentCategory) {
    const filename = file.path.split('/').pop();

    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay visible';
    overlay.innerHTML = `
        <div class="settings-modal fm-confirm-modal">
            <div class="settings-header">
                <h2 class="settings-title">Delete file</h2>
                <button class="settings-close fm-modal-close" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="settings-body">
                <p class="fm-confirm-text">Delete <strong>${filename}</strong>? This will permanently remove it from your GitHub repository. This cannot be undone.</p>
                <div class="fm-confirm-actions">
                    <button class="settings-btn settings-btn-secondary fm-cancel-btn">Cancel</button>
                    <button class="settings-btn fm-delete-btn">Delete</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.fm-modal-close').addEventListener('click', close);
    overlay.querySelector('.fm-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const onKeydown = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeydown); }
    };
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('.fm-delete-btn').addEventListener('click', () => {
        close();
        const settings = getSettings();

        optimisticAction({
            apply: () => {
                const row = document.querySelector(`.library-file-row[data-filepath="${file.path}"]`);
                if (row) row.style.display = 'none';
            },
            revert: () => {
                const row = document.querySelector(`.library-file-row[data-filepath="${file.path}"]`);
                if (row) row.style.display = '';
            },
            action: async () => {
                await deleteFile(settings.owner, settings.repo, file.path, file.sha,
                    `Deleted ${filename} via Clarity`, settings.branch);
                removeRecentFile(file.path);
            },
            successMsg: `Deleted ${filename}`
        });
    });
}

// ---------------------------------------------------------------------------
// Folder Creation (inline input in sidebar)
// ---------------------------------------------------------------------------

export function startNewFolder() {
    if (!checkOnline()) return;
    const categoriesEl = document.getElementById('libraryCategories');
    if (!categoriesEl) return;

    // Check if already showing input
    if (categoriesEl.querySelector('.fm-new-folder-input')) return;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'fm-new-folder-input';
    inputWrapper.innerHTML = `
        <input type="text" class="fm-inline-rename" placeholder="folder-name">
        <button type="button" class="fm-new-folder-confirm" title="Create folder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
    `;
    categoriesEl.appendChild(inputWrapper);

    const input = inputWrapper.querySelector('input');
    const confirmBtn = inputWrapper.querySelector('.fm-new-folder-confirm');
    input.focus();

    let finished = false;

    function finish(save) {
        if (finished) return;
        finished = true;

        inputWrapper.remove();
        if (!save) return;

        const name = input.value.trim().replace(/[\/\\]/g, '');
        if (!name) return;

        // Check if folder already exists (check both file paths and known folders)
        const settings = getSettings();
        const tree = getCachedTree(settings.owner, settings.repo);
        if (tree && (
            tree.files.some(f => f.path.startsWith(name + '/')) ||
            (tree.folders && tree.folders.includes(name))
        )) {
            showToast(`Folder "${name}" already exists`, 'error');
            return;
        }

        optimisticAction({
            apply: () => {
                // Optimistically add folder to sidebar
                const catEl = document.getElementById('libraryCategories');
                if (!catEl) return;
                const newFolderBtn = catEl.querySelector('.fm-new-folder-btn');
                if (!newFolderBtn) return;

                const row = document.createElement('div');
                row.className = 'library-category-row';
                row.setAttribute('data-optimistic-folder', name);
                row.innerHTML = `
                    <a class="library-category-item"
                       href="#/library/${encodeURIComponent(name)}" data-category="${name}">
                        <svg class="library-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span class="library-category-name">${name}</span>
                        <span class="library-category-count">0</span>
                    </a>
                `;
                catEl.insertBefore(row, newFolderBtn);
            },
            revert: () => {
                const row = document.querySelector(`[data-optimistic-folder="${name}"]`);
                if (row) row.remove();
            },
            action: () => createFolder(settings.owner, settings.repo, name, settings.branch),
            successMsg: `Created folder: ${name}`
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { finish(false); }
    });
    input.addEventListener('blur', () => finish(true));

    // Prevent blur race: mousedown on button fires before blur
    confirmBtn.addEventListener('mousedown', (e) => e.preventDefault());
    confirmBtn.addEventListener('click', () => finish(true));
}

// ---------------------------------------------------------------------------
// Folder Rename (inline in sidebar)
// ---------------------------------------------------------------------------

function startFolderRename(folderName) {
    const categoryItems = document.querySelectorAll('.library-category-item');
    let targetItem = null;
    for (const item of categoryItems) {
        if (item.getAttribute('data-category') === folderName) {
            targetItem = item;
            break;
        }
    }
    if (!targetItem) return;

    const nameEl = targetItem.querySelector('.library-category-name');
    if (!nameEl) return;

    const originalName = nameEl.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fm-inline-rename';
    input.value = folderName;

    targetItem.addEventListener('click', preventNav);
    function preventNav(ev) { ev.preventDefault(); }

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    function finish(save) {
        input.replaceWith(nameEl);
        targetItem.removeEventListener('click', preventNav);

        if (!save) return;

        const newName = input.value.trim().replace(/[\/\\]/g, '');
        if (!newName || newName === folderName) return;

        // Check collision
        const settings = getSettings();
        const tree = getCachedTree(settings.owner, settings.repo);
        if (tree && tree.files.some(f => f.path.startsWith(newName + '/')) && newName !== folderName) {
            showToast(`Folder "${newName}" already exists`, 'error');
            return;
        }

        optimisticAction({
            apply: () => {
                nameEl.textContent = newName;
            },
            revert: () => {
                nameEl.textContent = originalName;
            },
            action: () => renameFolder(settings.owner, settings.repo, folderName, newName,
                `Renamed /${folderName} → /${newName} via Clarity`, settings.branch),
            successMsg: `Renamed /${folderName} → /${newName}`,
            undoAction: () => {
                optimisticAction({
                    apply: () => {},
                    revert: () => {},
                    action: () => renameFolder(settings.owner, settings.repo, newName, folderName,
                        `Undo rename: /${newName} → /${folderName} via Clarity`, settings.branch),
                    successMsg: `Undid rename — restored /${folderName}`
                });
            }
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

// ---------------------------------------------------------------------------
// Folder Delete Confirmation
// ---------------------------------------------------------------------------

function confirmDeleteFolder(folderName) {
    const settings = getSettings();
    const tree = getCachedTree(settings.owner, settings.repo);
    const prefix = folderName + '/';
    const affectedFiles = tree ? tree.files.filter(f => f.path.startsWith(prefix)) : [];

    const overlay = document.createElement('div');
    overlay.className = 'settings-modal-overlay visible';
    overlay.innerHTML = `
        <div class="settings-modal fm-confirm-modal">
            <div class="settings-header">
                <h2 class="settings-title">Delete folder</h2>
                <button class="settings-close fm-modal-close" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="settings-body">
                <p class="fm-confirm-text">Delete <strong>/${folderName}</strong> and all <strong>${affectedFiles.length}</strong> file${affectedFiles.length !== 1 ? 's' : ''} inside? This cannot be undone.</p>
                ${affectedFiles.length > 0 ? `
                    <ul class="fm-affected-files">
                        ${affectedFiles.map(f => `<li>${f.path.split('/').pop()}</li>`).join('')}
                    </ul>
                ` : ''}
                <div class="fm-confirm-actions">
                    <button class="settings-btn settings-btn-secondary fm-cancel-btn">Cancel</button>
                    <button class="settings-btn fm-delete-btn">Delete</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.fm-modal-close').addEventListener('click', close);
    overlay.querySelector('.fm-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const onKeydown = (e) => {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKeydown); }
    };
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('.fm-delete-btn').addEventListener('click', () => {
        close();

        optimisticAction({
            apply: () => {
                // Hide the folder in sidebar
                const categoryItems = document.querySelectorAll('.library-category-item');
                for (const item of categoryItems) {
                    if (item.getAttribute('data-category') === folderName) {
                        item.style.display = 'none';
                        break;
                    }
                }
                // Hide files in list
                affectedFiles.forEach(f => {
                    const row = document.querySelector(`.library-file-row[data-filepath="${f.path}"]`);
                    if (row) row.style.display = 'none';
                });
            },
            revert: () => {
                const categoryItems = document.querySelectorAll('.library-category-item');
                for (const item of categoryItems) {
                    if (item.getAttribute('data-category') === folderName) {
                        item.style.display = '';
                        break;
                    }
                }
                affectedFiles.forEach(f => {
                    const row = document.querySelector(`.library-file-row[data-filepath="${f.path}"]`);
                    if (row) row.style.display = '';
                });
            },
            action: () => deleteFolder(settings.owner, settings.repo, folderName,
                `Deleted /${folderName} (${affectedFiles.length} files) via Clarity`, settings.branch),
            successMsg: `Deleted /${folderName} (${affectedFiles.length} file${affectedFiles.length !== 1 ? 's' : ''})`
        });
    });
}
