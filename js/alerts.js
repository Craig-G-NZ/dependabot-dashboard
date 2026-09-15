window.Alerts = window.Alerts || {};

(function (global) {
  const SEVERITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    error: 1,
    warning: 2,
    note: 3,
    unknown: 4,
  };

  function mapSeverity(raw) {
    if (!raw) return 'unknown';
    const s = String(raw).toLowerCase();
    if (s === 'error') return 'high';
    if (s === 'warning') return 'medium';
    if (s === 'note') return 'low';
    if (SEVERITY_RANK[s] !== undefined) return s;
    return 'unknown';
  }

  function normalizeDependabot(raw, repo) {
    const sev =
      raw.security_vulnerability?.severity ||
      raw.security_advisory?.severity ||
      'unknown';
    const pkg = raw.dependency?.package?.name || raw.security_vulnerability?.package?.name || 'unknown';
    const ecosystem =
      raw.dependency?.package?.ecosystem ||
      raw.security_vulnerability?.package?.ecosystem ||
      '';
    return {
      id: `dependabot:${repo.full_name}:${raw.number}`,
      type: 'dependabot',
      number: raw.number,
      repo: repo.full_name,
      owner: repo.owner?.login || repo.full_name.split('/')[0],
      name: repo.name,
      severity: mapSeverity(sev),
      state: raw.state,
      title: raw.security_advisory?.summary || `${pkg} vulnerability`,
      subtitle: [ecosystem, pkg].filter(Boolean).join(' · '),
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      html_url: raw.html_url,
      raw,
    };
  }

  function normalizeCodeScanning(raw, repo) {
    const sev = raw.rule?.security_severity_level || raw.rule?.severity || 'unknown';
    const loc = raw.most_recent_instance?.location;
    const path = loc ? `${loc.path}:${loc.start_line}` : '';
    return {
      id: `code_scanning:${repo.full_name}:${raw.number}`,
      type: 'code_scanning',
      number: raw.number,
      repo: repo.full_name,
      owner: repo.owner?.login || repo.full_name.split('/')[0],
      name: repo.name,
      severity: mapSeverity(sev),
      state: raw.state,
      title: raw.rule?.description || raw.rule?.name || raw.rule?.id || 'Code scanning alert',
      subtitle: [raw.tool?.name, path].filter(Boolean).join(' · '),
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      html_url: raw.html_url,
      raw,
    };
  }

  function normalizeSecretScanning(raw, repo) {
    return {
      id: `secret_scanning:${repo.full_name}:${raw.number}`,
      type: 'secret_scanning',
      number: raw.number,
      repo: repo.full_name,
      owner: repo.owner?.login || repo.full_name.split('/')[0],
      name: repo.name,
      severity: 'high',
      state: raw.state,
      title: raw.secret_type_display_name || raw.secret_type || 'Secret detected',
      subtitle: raw.validity ? `Validity: ${raw.validity}` : 'Secret scanning',
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      html_url: raw.html_url,
      raw,
    };
  }

  async function mapPool(items, concurrency, mapper, onProgress) {
    const results = [];
    let index = 0;
    let completed = 0;

    async function worker() {
      while (index < items.length) {
        const current = index++;
        const item = items[current];
        try {
          results[current] = await mapper(item);
        } catch (err) {
          results[current] = { error: err, item };
        }
        completed += 1;
        if (onProgress) onProgress(completed, items.length, item);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  async function collectAllAlerts(options = {}) {
    const { onProgress, signal } = options;
    const repos = await global.api.getAllRepos({ signal });
    const alerts = [];
    let processed = 0;

    await mapPool(
      repos,
      4,
      async (repo) => {
        const [dep, code, secret] = await Promise.all([
          global.api.listDependabotAlerts(repo.owner.login, repo.name, { signal }).catch(() => []),
          global.api.listCodeScanningAlerts(repo.owner.login, repo.name, { signal }).catch(() => []),
          global.api.listSecretScanningAlerts(repo.owner.login, repo.name, { signal }).catch(() => []),
        ]);

        for (const a of dep || []) alerts.push(normalizeDependabot(a, repo));
        for (const a of code || []) alerts.push(normalizeCodeScanning(a, repo));
        for (const a of secret || []) alerts.push(normalizeSecretScanning(a, repo));
        return true;
      },
      () => {
        processed += 1;
        if (onProgress) {
          onProgress({
            phase: 'repos',
            processed,
            total: repos.length,
            alertCount: alerts.length,
          });
        }
      }
    );

    alerts.sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity] ?? 9;
      const sb = SEVERITY_RANK[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });

    return { repos, alerts, refreshedAt: new Date().toISOString() };
  }

  function summarize(alerts) {
    const byType = { dependabot: 0, code_scanning: 0, secret_scanning: 0 };
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    const byRepo = {};

    for (const a of alerts) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
      byRepo[a.repo] = (byRepo[a.repo] || 0) + 1;
    }

    return { total: alerts.length, byType, bySeverity, byRepo };
  }

  async function fetchAlertDetail(type, owner, name, number, options = {}) {
    if (type === 'dependabot') {
      const raw = await global.api.getDependabotAlert(owner, name, number, options);
      return normalizeDependabot(raw, { full_name: `${owner}/${name}`, owner: { login: owner }, name });
    }
    if (type === 'code_scanning') {
      const raw = await global.api.getCodeScanningAlert(owner, name, number, options);
      return normalizeCodeScanning(raw, {
        full_name: `${owner}/${name}`,
        owner: { login: owner },
        name,
      });
    }
    if (type === 'secret_scanning') {
      const raw = await global.api.getSecretScanningAlert(owner, name, number, options);
      return normalizeSecretScanning(raw, {
        full_name: `${owner}/${name}`,
        owner: { login: owner },
        name,
      });
    }
    throw new Error(`Unknown alert type: ${type}`);
  }

  function parseRoute(hash) {
    const h = (hash || '#/').replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);

    if (parts.length === 0) return { view: 'home' };

    if (parts[0] === 'repo' && parts.length >= 3) {
      return { view: 'repo', owner: parts[1], name: parts[2], repo: `${parts[1]}/${parts[2]}` };
    }

    if (parts[0] === 'alert' && parts.length >= 5) {
      return {
        view: 'alert',
        type: parts[1],
        owner: parts[2],
        name: parts[3],
        number: parts[4],
        repo: `${parts[2]}/${parts[3]}`,
      };
    }

    return { view: 'home' };
  }

  function routeHome() {
    return '#/';
  }

  function routeRepo(owner, name) {
    return `#/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }

  function routeAlert(type, owner, name, number) {
    return `#/alert/${encodeURIComponent(type)}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeURIComponent(number)}`;
  }

  global.data = {
    SEVERITY_RANK,
    mapSeverity,
    collectAllAlerts,
    summarize,
    fetchAlertDetail,
    parseRoute,
    routeHome,
    routeRepo,
    routeAlert,
  };
})(window.Alerts);
