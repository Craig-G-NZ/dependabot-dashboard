window.Alerts = window.Alerts || {};
(function (global) {
  const CONFIG = window.ALERTS_CONFIG || {};
  const TOKEN_KEY = 'github_token';
  const VERIFIER_KEY = 'oauth_code_verifier';

  function getSiteOrigin() {
    if (CONFIG.redirectUri) {
      try {
        return new URL(CONFIG.redirectUri).origin;
      } catch {
        /* fall through */
      }
    }
    if (CONFIG.siteUrl) return CONFIG.siteUrl.replace(/\/$/, '');
    if (CONFIG.canonicalHost) return `https://${CONFIG.canonicalHost}`;
    return window.location.origin;
  }

  function getRedirectUri() {
    if (CONFIG.redirectUri) return CONFIG.redirectUri;
    return `${getSiteOrigin()}/auth/callback`;
  }

  function getOAuthSetupInfo() {
    const clientId = CONFIG.clientId || '';
    return {
      redirectUri: getRedirectUri(),
      clientId,
      clientIdHint: clientId ? `${clientId.slice(0, 6)}...${clientId.slice(-4)}` : '(not set)',
    };
  }

  async function ensureConfig() {
    if (CONFIG.clientId && CONFIG.clientId !== 'YOUR_GITHUB_OAUTH_CLIENT_ID') {
      return;
    }
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.clientId) {
        CONFIG.clientId = data.clientId;
        CONFIG.canonicalHost = data.canonicalHost || CONFIG.canonicalHost;
        CONFIG.siteUrl = data.siteUrl || CONFIG.siteUrl;
        window.ALERTS_CONFIG = {
          ...window.ALERTS_CONFIG,
          clientId: data.clientId,
          canonicalHost: CONFIG.canonicalHost,
          siteUrl: CONFIG.siteUrl,
        };
      }
    } catch {
      /* offline or no Worker */
    }
  }

  function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  async function sha256Base64Url(plain) {
    const data = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashBytes = new Uint8Array(hash);
    let binary = '';
    for (const byte of hashBytes) {
      binary += String.fromCodePoint(byte);
    }
    const b64 = btoa(binary);
    const urlSafe = b64.replaceAll('+', '-').replaceAll('/', '_');
    const padIndex = urlSafe.indexOf('=');
    return padIndex === -1 ? urlSafe : urlSafe.slice(0, padIndex);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
  }

  async function startLogin() {
    if (location.protocol === 'file:') {
      throw new Error('GitHub login requires HTTPS. Deploy this app to Cloudflare Workers.');
    }

    await ensureConfig();

    if (!CONFIG.clientId || CONFIG.clientId === 'YOUR_GITHUB_OAUTH_CLIENT_ID') {
      throw new Error(
        'GitHub OAuth client ID is not set. Set GITHUB_CLIENT_ID in wrangler.toml and redeploy. Open /api/config to verify.'
      );
    }

    const redirectUri = getRedirectUri();
    const verifier = randomString(64);
    const challenge = await sha256Base64Url(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
      client_id: CONFIG.clientId,
      redirect_uri: redirectUri,
      scope: 'repo security_events',
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  }

  async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;

    await ensureConfig();

    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) {
      throw new Error('Missing OAuth verifier - try signing in again.');
    }

    let response;
    try {
      response = await fetch('/api/oauth-token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CONFIG.clientId,
          code,
          redirect_uri: getRedirectUri(),
          code_verifier: verifier,
        }),
      });
    } catch {
      throw new Error('Could not reach /api/oauth-token. Redeploy the Worker and try again.');
    }

    if (response.status === 404) {
      throw new Error('OAuth proxy not found (/api/oauth-token). Check that the Worker is deployed.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data.error_description || data.message || `Token exchange failed (HTTP ${response.status})`
      );
    }
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    if (!data.access_token) {
      throw new Error(
        'No access token from GitHub. Confirm GITHUB_CLIENT_SECRET is set on the Worker, then hard-refresh (Ctrl+Shift+R).'
      );
    }

    sessionStorage.setItem(TOKEN_KEY, data.access_token);
    sessionStorage.removeItem(VERIFIER_KEY);
    window.history.replaceState({}, document.title, getRedirectUri());
    return true;
  }

  global.auth = {
    getToken,
    isLoggedIn,
    logout,
    ensureConfig,
    startLogin,
    handleOAuthCallback,
    getRedirectUri,
    getOAuthSetupInfo,
  };
})(window.Alerts);
