window.Alerts = window.Alerts || {};

(function (global) {
  const API_ORIGIN = 'https://api.github.com';
  const REPO_NAME_RE = /^[A-Za-z0-9_.-]+$/;

  function getToken() {
    return global.auth.getToken();
  }

  function sanitizeRepoName(value, label) {
    const name = String(value ?? '');
    if (!REPO_NAME_RE.test(name)) {
      throw new Error(`Invalid ${label}`);
    }
    return name;
  }

  function sanitizeAlertNumber(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('Invalid alert number');
    }
    return n;
  }

  function repoApiPath(owner, repo, suffix = '') {
    const safeOwner = sanitizeRepoName(owner, 'owner');
    const safeRepo = sanitizeRepoName(repo, 'repository');
    return `/repos/${encodeURIComponent(safeOwner)}/${encodeURIComponent(safeRepo)}${suffix}`;
  }

  async function githubFetch(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    // Keep requests on api.github.com only (blocks host/path redirection).
    const url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN) {
      throw new Error('Invalid API host');
    }
    if (url.pathname.includes('/../') || url.pathname.includes('/..')) {
      throw new Error('Invalid API path');
    }

    const { signal, allowStatuses = [], ...fetchOptions } = options;
    const response = await fetch(url.toString(), {
      ...fetchOptions,
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...fetchOptions.headers,
      },
    });

    if (response.status === 204) return null;
    if (allowStatuses.includes(response.status)) return null;

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.message || response.statusText;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  async function githubFetchAll(path, options = {}) {
    const results = [];
    let page = 1;
    const perPage = 100;
    const url = new URL(path, API_ORIGIN);

    while (true) {
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      const batch = await githubFetch(`${url.pathname}${url.search}`, options);
      if (!batch || !Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      if (page > 20) break;
    }
    return results;
  }

  async function getAllRepos(options = {}) {
    return githubFetchAll(
      '/user/repos?affiliation=owner,collaborator,organization_member&sort=updated',
      options
    );
  }

  async function listDependabotAlerts(owner, repo, options = {}) {
    return githubFetchAll(repoApiPath(owner, repo, '/dependabot/alerts?state=open'), {
      ...options,
      allowStatuses: [403, 404, 422],
    });
  }

  async function listCodeScanningAlerts(owner, repo, options = {}) {
    return githubFetchAll(repoApiPath(owner, repo, '/code-scanning/alerts?state=open'), {
      ...options,
      allowStatuses: [403, 404, 422],
    });
  }

  async function listSecretScanningAlerts(owner, repo, options = {}) {
    return githubFetchAll(repoApiPath(owner, repo, '/secret-scanning/alerts?state=open'), {
      ...options,
      allowStatuses: [403, 404, 422],
    });
  }

  async function getDependabotAlert(owner, repo, number, options = {}) {
    const n = sanitizeAlertNumber(number);
    return githubFetch(repoApiPath(owner, repo, `/dependabot/alerts/${n}`), options);
  }

  async function getCodeScanningAlert(owner, repo, number, options = {}) {
    const n = sanitizeAlertNumber(number);
    return githubFetch(repoApiPath(owner, repo, `/code-scanning/alerts/${n}`), options);
  }

  async function getSecretScanningAlert(owner, repo, number, options = {}) {
    const n = sanitizeAlertNumber(number);
    return githubFetch(repoApiPath(owner, repo, `/secret-scanning/alerts/${n}`), options);
  }

  function getUser(options = {}) {
    return githubFetch('/user', options);
  }

  global.api = {
    getUser,
    getAllRepos,
    listDependabotAlerts,
    listCodeScanningAlerts,
    listSecretScanningAlerts,
    getDependabotAlert,
    getCodeScanningAlert,
    getSecretScanningAlert,
  };
})(window.Alerts);
