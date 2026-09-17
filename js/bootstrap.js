/** Load OAuth client ID from Worker env (/api/config), then load app scripts. */
(function () {
  const VERSION = '6';
  const scripts = window.ALERTS_SCRIPTS || [
    'theme.js',
    'auth.js',
    'github-api.js',
    'alerts.js',
    'render.js',
    'app.js',
  ];

  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

  function shouldUseCanonicalHost(canonicalHost) {
    if (!canonicalHost) return false;
    const host = location.hostname.toLowerCase();
    return !LOCAL_HOSTS.has(host) && host !== canonicalHost;
  }

  function redirectToCanonical(canonicalHost) {
    const target = `https://${canonicalHost}${location.pathname}${location.search}${location.hash}`;
    location.replace(target);
  }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = `/js/${file}?v=${VERSION}`;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${file}`));
      document.body.appendChild(el);
    });
  }

  async function start() {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Could not load /api/config (HTTP ${res.status})`);
    }
    const data = await res.json();

    if (data.canonicalHost && shouldUseCanonicalHost(data.canonicalHost)) {
      redirectToCanonical(data.canonicalHost);
      return;
    }

    window.ALERTS_CONFIG = {
      clientId: data.clientId || '',
      canonicalHost: data.canonicalHost || '',
      siteUrl: data.siteUrl || '',
    };

    for (const file of scripts) {
      await loadScript(file);
    }
    document.dispatchEvent(new Event('alerts-ready'));
  }

  start().catch((err) => {
    console.error(err);
    const banner = document.getElementById('app-error');
    if (banner) {
      banner.textContent =
        err.message +
        ' — Set GITHUB_CLIENT_ID and CANONICAL_HOST in wrangler.toml, then redeploy.';
      banner.classList.remove('hidden');
    }
  });
})();
