// api/auth/callback.js — Vercel serverless function for GitHub OAuth token exchange
// Exchanges an authorization code for an access token using the client secret.
// The client secret NEVER leaves this function.

export default async function handler(req, res) {
    // Only accept POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate env vars
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Server misconfigured: missing OAuth credentials' });
    }

    const { code } = req.body || {};

    if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code
        })
    });

    if (!tokenResponse.ok) {
        return res.status(502).json({ error: 'Failed to exchange code with GitHub' });
    }

    const data = await tokenResponse.json();

    if (data.error) {
        return res.status(400).json({ error: data.error_description || data.error });
    }

    // Return only the access token — never expose the client secret
    return res.status(200).json({ access_token: data.access_token });
}
