// settings.js — Settings modal: repo picker, branch selector, connect/disconnect, sign out

import { isAuthenticated, getAuth, signOut as authSignOut } from './auth.js';
import { listUserRepos, fetchRepoTree, clearUserCache } from './github.js';

const STORAGE_KEY_REPO = 'clarity-repo';

let modalEl = null;

// ---------------------------------------------------------------------------
// Repo settings persistence
// ---------------------------------------------------------------------------

export function getRepoSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_REPO);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveRepoSettings(settings) {
    localStorage.setItem(STORAGE_KEY_REPO, JSON.stringify(settings));
}

function clearRepoSettings() {
    localStorage.removeItem(STORAGE_KEY_REPO);
}

// ---------------------------------------------------------------------------
// Modal creation
// ---------------------------------------------------------------------------

function createModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'settings-modal-overlay';
    modalEl.innerHTML = `
        <div class="settings-modal">
            <div class="settings-header">
                <h2 class="settings-title">Settings</h2>
                <button class="settings-close" id="settingsClose" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div class="settings-body" id="settingsBody">
                <!-- Content injected dynamically -->
            </div>
        </div>
    `;

    document.body.appendChild(modalEl);

    // Close on overlay click
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeSettings();
    });

    // Close button
    modalEl.querySelector('#settingsClose').addEventListener('click', closeSettings);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalEl.classList.contains('visible')) {
            closeSettings();
        }
    });

    return modalEl;
}

// ---------------------------------------------------------------------------
// Render states
// ---------------------------------------------------------------------------

function renderUnauthenticated(body) {
    body.innerHTML = `
        <div class="settings-section">
            <p class="settings-text">Sign in with GitHub to connect a repository and browse your markdown documents.</p>
        </div>
    `;
}

function renderRepoForm(body) {
    const auth = getAuth();
    const existing = getRepoSettings();

    body.innerHTML = `
        <div class="settings-section">
            <div class="settings-user">
                <img class="settings-avatar" src="${auth.user.avatar_url}" alt="${auth.user.login}" width="32" height="32">
                <span class="settings-username">${auth.user.login}</span>
            </div>
        </div>

        ${existing ? renderConnectedState(existing) : renderRepoPickerForm()}

        <div class="settings-section settings-actions">
            ${existing ? '<button class="settings-btn settings-btn-secondary" id="disconnectRepo">Disconnect repo</button>' : ''}
            <button class="settings-btn settings-btn-danger" id="signOutBtn">Sign out</button>
        </div>
    `;

    // Wire up event handlers
    if (!existing) {
        wireRepoPickerEvents(body);
    }

    if (existing) {
        body.querySelector('#disconnectRepo')?.addEventListener('click', () => {
            const repo = getRepoSettings();
            if (repo) {
                clearRepoSettings();
            }
            renderRepoForm(body);
            window.dispatchEvent(new CustomEvent('clarity:repo-changed'));
        });
    }

    body.querySelector('#signOutBtn').addEventListener('click', () => {
        authSignOut();
        clearRepoSettings();
        closeSettings();
        window.dispatchEvent(new CustomEvent('clarity:signed-out'));
    });
}

function renderConnectedState(settings) {
    return `
        <div class="settings-section">
            <label class="settings-label">Connected repository</label>
            <div class="settings-connected-repo">
                <span class="settings-repo-name">${settings.owner}/${settings.repo}</span>
                <span class="settings-repo-branch">${settings.branch}</span>
            </div>
            ${settings.fileCount != null ? `<p class="settings-hint">${settings.fileCount} markdown file${settings.fileCount !== 1 ? 's' : ''} found</p>` : ''}
        </div>
    `;
}

function renderRepoPickerForm() {
    return `
        <div class="settings-section">
            <label class="settings-label" for="repoSelect">Repository</label>
            <select class="settings-select" id="repoSelect">
                <option value="">Loading repos...</option>
            </select>
            <p class="settings-hint">Or enter manually:</p>
            <input class="settings-input" id="repoManual" type="text" placeholder="owner/repo">
        </div>

        <div class="settings-section">
            <label class="settings-label" for="branchInput">Branch</label>
            <input class="settings-input" id="branchInput" type="text" value="main" placeholder="main">
        </div>

        <div class="settings-section">
            <button class="settings-btn settings-btn-primary" id="connectBtn">Connect</button>
            <p class="settings-status" id="connectStatus"></p>
        </div>
    `;
}

async function wireRepoPickerEvents(body) {
    const repoSelect = body.querySelector('#repoSelect');
    const repoManual = body.querySelector('#repoManual');
    const branchInput = body.querySelector('#branchInput');
    const connectBtn = body.querySelector('#connectBtn');
    const connectStatus = body.querySelector('#connectStatus');

    // Load repos into dropdown
    try {
        const repos = await listUserRepos();
        repoSelect.innerHTML = '<option value="">Select a repository...</option>';
        repos.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.full_name;
            opt.textContent = `${r.full_name}${r.private ? ' (private)' : ''}`;
            opt.dataset.branch = r.default_branch;
            repoSelect.appendChild(opt);
        });
    } catch (err) {
        repoSelect.innerHTML = '<option value="">Failed to load repos</option>';
    }

    // Auto-fill branch when selecting a repo
    repoSelect.addEventListener('change', () => {
        const selected = repoSelect.selectedOptions[0];
        if (selected?.dataset.branch) {
            branchInput.value = selected.dataset.branch;
        }
        repoManual.value = '';
    });

    // Connect button
    connectBtn.addEventListener('click', async () => {
        const repoFullName = repoManual.value.trim() || repoSelect.value;
        const branch = branchInput.value.trim() || 'main';

        if (!repoFullName || !repoFullName.includes('/')) {
            connectStatus.textContent = 'Please select or enter a valid owner/repo.';
            connectStatus.className = 'settings-status error';
            return;
        }

        const [owner, repo] = repoFullName.split('/');

        connectBtn.disabled = true;
        connectStatus.textContent = 'Connecting...';
        connectStatus.className = 'settings-status';

        try {
            const tree = await fetchRepoTree(owner, repo, branch);
            const fileCount = tree.files.length;

            saveRepoSettings({ owner, repo, branch, fileCount });

            connectStatus.textContent = `Connected! ${fileCount} markdown file${fileCount !== 1 ? 's' : ''} found.`;
            connectStatus.className = 'settings-status success';

            // Re-render to show connected state
            setTimeout(() => {
                renderRepoForm(body);
                window.dispatchEvent(new CustomEvent('clarity:repo-changed'));
            }, 800);
        } catch (err) {
            connectStatus.textContent = `Failed: ${err.message}`;
            connectStatus.className = 'settings-status error';
            connectBtn.disabled = false;
        }
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openSettings() {
    const modal = createModal();
    const body = modal.querySelector('#settingsBody');

    if (!isAuthenticated()) {
        renderUnauthenticated(body);
    } else {
        renderRepoForm(body);
    }

    modal.classList.add('visible');
}

export function closeSettings() {
    if (modalEl) {
        modalEl.classList.remove('visible');
    }
}
