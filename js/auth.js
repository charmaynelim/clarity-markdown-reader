// auth.js — GitHub OAuth flow, token management

const STORAGE_KEY_TOKEN = 'clarity-auth-token';
const STORAGE_KEY_USER = 'clarity-auth-user';
const OAUTH_STATE_KEY = 'clarity-oauth-state';

// Client ID is public — set this after creating your GitHub OAuth App
const GITHUB_CLIENT_ID = 'Ov23li6tzlY2ejWdQsBT';
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const CALLBACK_URL = `${window.location.origin}/api/auth/callback`;

/**
 * Start the GitHub OAuth flow.
 * Redirects the browser to GitHub's authorization page.
 */
export function startAuth() {
    const state = crypto.randomUUID();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: window.location.origin + '/',
        scope: 'repo',
        state
    });

    window.location.href = `${GITHUB_OAUTH_URL}?${params.toString()}`;
}

/**
 * Handle the OAuth callback after GitHub redirects back.
 * Validates state, exchanges code for token via serverless function,
 * stores token and fetches user profile.
 * @returns {boolean} true if callback was handled successfully
 */
export async function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return false;

    // Validate state to prevent CSRF
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    if (state !== savedState) {
        console.error('OAuth state mismatch — possible CSRF attempt');
        return false;
    }

    // Exchange code for token via serverless function
    const response = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to exchange auth code');
    }

    const { access_token } = await response.json();

    // Store token
    localStorage.setItem(STORAGE_KEY_TOKEN, access_token);

    // Fetch user profile
    const userResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!userResponse.ok) {
        throw new Error('Failed to fetch user profile');
    }

    const user = await userResponse.json();
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({
        login: user.login,
        avatar_url: user.avatar_url
    }));

    // Clean URL (remove ?code=...&state=...)
    window.history.replaceState({}, '', window.location.pathname);

    return true;
}

/**
 * Check if the user is currently authenticated.
 */
export function isAuthenticated() {
    return !!localStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Get the current auth state.
 * @returns {{ token: string, user: { login: string, avatar_url: string } } | null}
 */
export function getAuth() {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const userJson = localStorage.getItem(STORAGE_KEY_USER);

    if (!token || !userJson) return null;

    try {
        return { token, user: JSON.parse(userJson) };
    } catch {
        return null;
    }
}

/**
 * Sign out — clears token, user info, and all user-namespaced cache.
 */
export function signOut() {
    const auth = getAuth();
    const username = auth?.user?.login;

    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);

    // Clear all clarity-namespaced cache for this user
    if (username) {
        const prefix = `clarity:${username}:`;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}
