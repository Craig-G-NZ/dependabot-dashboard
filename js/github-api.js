window.Alerts = window.Alerts || {};

(function (global) {
  const API_BASE = 'https://api.github.com';

  function getToken() {
    return global.auth.getToken();
  }

  async function githubFetch(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const { signal, allowStatuses = [], ...fetchOptions } = options;
    const response = await fetch(`${API_BASE}${path}`, {
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
    const joiner = path.includes('?') ? '&' : '?';

    while (true) {
      const batch = await githubFetch(`${path}${joiner}per_page=${perPage}&page=${page}`, options);
      if (!batch || !Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      if (page > 20) break;
    }
    return results;
  }

  async function getAllRepos(options = {}) {
    return githubFetchAll('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated', options);
  }

  async function listDependabotAlerts(owner, repo, options = {}) {
    return githubFetchAll(
      `/repos/${owner}/${repo}/dependabot/alerts?state=open`,
      { ...options, allowStatuses: [403, 404, 422] }
    );
  }

  async function listCodeScanningAlerts(owner, repo, options = {}) {
    return githubFetchAll(
      `/repos/${owner}/${repo}/code-scanning/alerts?state=open`,
      { ...options, allowStatuses: [403, 404, 422] }
    );
  }

  async function listSecretScanningAlerts(owner, repo, options = {}) {
    return githubFetchAll(
      `/repos/${owner}/${repo}/secret-scanning/alerts?state=open`,
      { ...options, allowStatuses: [403, 404, 422] }
    );
  }

  async function getDependabotAlert(owner, repo, number, options = {}) {
    return githubFetch(`/repos/${owner}/${repo}/dependabot/alerts/${number}`, options);
  }

  async function getCodeScanningAlert(owner, repo, number, options = {}) {
    return githubFetch(`/repos/${owner}/${repo}/code-scanning/alerts/${number}`, options);
  }

  async function getSecretScanningAlert(owner, repo, number, options = {}) {
    return githubFetch(`/repos/${owner}/${repo}/secret-scanning/alerts/${number}`, options);
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
