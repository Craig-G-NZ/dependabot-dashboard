window.Alerts = window.Alerts || {};

(function (global) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function typeLabel(type) {
    if (type === 'dependabot') return 'Dependabot';
    if (type === 'code_scanning') return 'Code scanning';
    if (type === 'secret_scanning') return 'Secret scanning';
    return type;
  }

  function severityChip(severity) {
    return `<span class="chip chip--${escapeHtml(severity)}">${escapeHtml(severity)}</span>`;
  }

  function typeChip(type) {
    const safe = ['dependabot', 'code_scanning', 'secret_scanning'].includes(type)
      ? type
      : 'dependabot';
    return `<span class="chip chip--${safe}">${escapeHtml(typeLabel(type))}</span>`;
  }

  function renderSummary(summary, { scoped = false } = {}) {
    const s = summary || { total: 0, byType: {}, bySeverity: {} };
    return `
      <section class="summary" aria-label="${scoped ? 'Repo' : 'Overall'} alert summary">
        <div class="summary__total">
          <span class="summary__total-num">${s.total}</span>
          <span class="summary__total-label">open alert${s.total === 1 ? '' : 's'}</span>
        </div>
        <div class="summary__grid">
          <div class="stat">
            <span class="stat__value">${s.byType.dependabot || 0}</span>
            <span class="stat__label">Dependabot</span>
          </div>
          <div class="stat">
            <span class="stat__value">${s.byType.code_scanning || 0}</span>
            <span class="stat__label">Code scanning</span>
          </div>
          <div class="stat">
            <span class="stat__value">${s.byType.secret_scanning || 0}</span>
            <span class="stat__label">Secret scanning</span>
          </div>
        </div>
        <div class="severity-row" role="list">
          ${['critical', 'high', 'medium', 'low', 'unknown']
            .map(
              (sev) => `
            <button type="button" class="severity-filter" data-severity="${sev}" role="listitem">
              ${severityChip(sev)}
              <span class="severity-filter__count">${s.bySeverity[sev] || 0}</span>
            </button>`
            )
            .join('')}
        </div>
      </section>
    `;
  }

  function renderFilters(active) {
    const types = [
      ['', 'All types'],
      ['dependabot', 'Dependabot'],
      ['code_scanning', 'Code scanning'],
      ['secret_scanning', 'Secret scanning'],
    ];
    return `
      <div class="filters">
        <label class="filters__field">
          <span class="filters__label">Type</span>
          <select id="filter-type">
            ${types
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${active.type === value ? 'selected' : ''}>${label}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="filters__field filters__search">
          <span class="filters__label">Search</span>
          <input id="filter-search" type="search" placeholder="Repo, package, rule…" value="${escapeHtml(active.search || '')}" />
        </label>
      </div>
    `;
  }

  function renderAlertRow(alert) {
    return `
      <article class="alert-row" data-alert-id="${escapeHtml(alert.id)}" tabindex="0" role="link">
        <div class="alert-row__meta">
          ${severityChip(alert.severity)}
          ${typeChip(alert.type)}
        </div>
        <div class="alert-row__body">
          <h3 class="alert-row__title">${escapeHtml(alert.title)}</h3>
          <p class="alert-row__sub">${escapeHtml(alert.subtitle || '')}</p>
        </div>
        <div class="alert-row__aside">
          <button type="button" class="repo-link" data-repo="${escapeHtml(alert.repo)}" data-owner="${escapeHtml(alert.owner)}" data-name="${escapeHtml(alert.name)}">${escapeHtml(alert.repo)}</button>
          <time datetime="${escapeHtml(alert.updated_at || '')}">${escapeHtml(formatWhen(alert.updated_at))}</time>
        </div>
      </article>
    `;
  }

  function renderAlertList(alerts) {
    if (!alerts.length) {
      return `<div class="empty-state"><p>No open alerts match these filters.</p></div>`;
    }
    return `<div class="alert-list">${alerts.map(renderAlertRow).join('')}</div>`;
  }

  function renderSignedOutMain() {
    return `<p class="empty-state empty-state--center">Connect GitHub to load security alerts across your repositories.</p>`;
  }

  function renderSignedOutSidebar(oauthInfo) {
    const callback = oauthInfo?.redirectUri || '';
    const hint = oauthInfo?.clientIdHint || '(not set)';
    const configured = Boolean(oauthInfo?.clientId && oauthInfo.clientId !== 'YOUR_GITHUB_OAUTH_CLIENT_ID');
    return `
      <p class="empty-state">Connect GitHub to see repositories.</p>
      <div class="oauth-panel panel-inset">
        <p class="text-emphasis">GitHub OAuth setup</p>
        <p class="text-meta">Authorization callback URL must match exactly:</p>
        <code>${escapeHtml(callback)}</code>
        <p class="text-meta">Client ID: <span class="text-emphasis">${escapeHtml(hint)}</span></p>
        <p class="text-meta">${configured ? 'OAuth config OK.' : 'Set GITHUB_CLIENT_ID in wrangler.toml and redeploy.'}</p>
      </div>
    `;
  }

  function renderRepoSidebar(summary, activeRepo) {
    const entries = Object.entries(summary.byRepo || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!entries.length) {
      return `<p class="empty-state">No open alerts in any repository.</p>`;
    }
    return `
      <a class="repo-nav-item ${activeRepo ? '' : 'is-active'}" href="${global.data.routeHome()}">
        <span>All repositories</span>
        <span class="repo-nav-count">${summary.total}</span>
      </a>
      <div class="repo-nav-list">
        ${entries
          .map(([repo, count]) => {
            const [owner, name] = repo.split('/');
            const href = global.data.routeRepo(owner, name);
            const active = activeRepo === repo ? 'is-active' : '';
            return `<a class="repo-nav-item ${active}" href="${href}" title="${escapeHtml(repo)}"><span class="repo-nav-name">${escapeHtml(repo)}</span><span class="repo-nav-count">${count}</span></a>`;
          })
          .join('')}
      </div>
    `;
  }

  function renderLoading(progress) {
    const pct =
      progress?.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    return `
      <section class="loading-panel">
        <p class="page-title">Scanning repositories…</p>
        <p class="page-lead">${progress?.processed || 0} / ${progress?.total || '…'} repos · ${progress?.alertCount || 0} alerts found</p>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress__bar" style="width:${pct}%"></div>
        </div>
      </section>
    `;
  }

  function renderSignedOut() {
    return renderSignedOutMain();
  }

  function renderDependabotDetail(alert) {
    const raw = alert.raw || {};
    const adv = raw.security_advisory || {};
    const vuln = raw.security_vulnerability || {};
    const dep = raw.dependency || {};
    const patched = vuln.first_patched_version?.identifier || '—';
    const range = vuln.vulnerable_version_range || '—';
    const cvss =
      adv.cvss_severities?.cvss_v4?.score ||
      adv.cvss_severities?.cvss_v3?.score ||
      adv.cvss?.score ||
      '—';
    return `
      <dl class="detail-grid">
        <div><dt>Package</dt><dd>${escapeHtml(dep.package?.name || vuln.package?.name || '—')}</dd></div>
        <div><dt>Ecosystem</dt><dd>${escapeHtml(dep.package?.ecosystem || vuln.package?.ecosystem || '—')}</dd></div>
        <div><dt>Manifest</dt><dd><code>${escapeHtml(dep.manifest_path || '—')}</code></dd></div>
        <div><dt>Vulnerable range</dt><dd><code>${escapeHtml(range)}</code></dd></div>
        <div><dt>Patched version</dt><dd><code>${escapeHtml(patched)}</code></dd></div>
        <div><dt>CVSS</dt><dd>${escapeHtml(String(cvss))}</dd></div>
        <div><dt>GHSA / CVE</dt><dd>${escapeHtml([adv.ghsa_id, adv.cve_id].filter(Boolean).join(' · ') || '—')}</dd></div>
      </dl>
      <div class="detail-prose">
        <h3>Advisory</h3>
        <p>${escapeHtml(adv.summary || alert.title)}</p>
        <pre class="detail-desc">${escapeHtml((adv.description || '').slice(0, 4000))}</pre>
      </div>
    `;
  }

  function formatCodeLocation(loc) {
    if (!loc) return '—';
    let lineRange = String(loc.start_line);
    if (loc.end_line && loc.end_line !== loc.start_line) {
      lineRange = loc.start_line + '-' + loc.end_line;
    }
    return loc.path + ':' + lineRange;
  }

  function formatToolLabel(tool) {
    if (!tool?.name) return '—';
    if (!tool.version) return tool.name;
    return `${tool.name} · ${tool.version}`;
  }

  function renderCodeScanningDetail(alert) {
    const raw = alert.raw || {};
    const rule = raw.rule || {};
    const loc = raw.most_recent_instance?.location;
    const path = formatCodeLocation(loc);
    const message = raw.most_recent_instance?.message?.text || '';
    let helpBlock = '';
    if (rule.help) {
      helpBlock =
        '<pre class="detail-desc">' + escapeHtml(String(rule.help).slice(0, 4000)) + '</pre>';
    }
    return `
      <dl class="detail-grid">
        <div><dt>Rule</dt><dd><code>${escapeHtml(rule.id || rule.name || '—')}</code></dd></div>
        <div><dt>Tool</dt><dd>${escapeHtml(formatToolLabel(raw.tool))}</dd></div>
        <div><dt>Location</dt><dd><code>${escapeHtml(path)}</code></dd></div>
        <div><dt>Severity</dt><dd>${severityChip(alert.severity)}</dd></div>
      </dl>
      <div class="detail-prose">
        <h3>Finding</h3>
        <p>${escapeHtml(message || rule.full_description || rule.description || alert.title)}</p>
        ${helpBlock}
      </div>
    `;
  }

  function renderLocationItem(loc) {
    const d = loc.details || loc;
    const path = d.path || d.location?.path || JSON.stringify(d);
    return '<li><code>' + escapeHtml(path) + '</code></li>';
  }

  function renderLocationList(locations) {
    if (!locations.length) {
      return '<p class="text-muted">No location details in this response. Open on GitHub for full context.</p>';
    }
    return '<ul class="location-list">' + locations.map(renderLocationItem).join('') + '</ul>';
  }

  function renderSecretScanningDetail(alert) {
    const raw = alert.raw || {};
    const locations = Array.isArray(raw.locations) ? raw.locations : [];
    return `
      <dl class="detail-grid">
        <div><dt>Secret type</dt><dd>${escapeHtml(raw.secret_type_display_name || raw.secret_type || '—')}</dd></div>
        <div><dt>Validity</dt><dd>${escapeHtml(raw.validity || 'unknown')}</dd></div>
        <div><dt>Push protection bypassed</dt><dd>${raw.push_protection_bypassed ? 'Yes' : 'No'}</dd></div>
        <div><dt>Resolved</dt><dd>${escapeHtml(raw.resolution || raw.state || '—')}</dd></div>
      </dl>
      <div class="detail-prose">
        <h3>Locations</h3>
        ${renderLocationList(locations)}
      </div>
    `;
  }

  function renderAlertDetail(alert) {
    let body = '';
    if (alert.type === 'dependabot') body = renderDependabotDetail(alert);
    else if (alert.type === 'code_scanning') body = renderCodeScanningDetail(alert);
    else if (alert.type === 'secret_scanning') body = renderSecretScanningDetail(alert);

    return `
      <section class="detail-view">
        <nav class="crumb">
          <a href="${global.data.routeHome()}">All alerts</a>
          <span aria-hidden="true">/</span>
          <a href="${global.data.routeRepo(alert.owner, alert.name)}">${escapeHtml(alert.repo)}</a>
          <span aria-hidden="true">/</span>
          <span>${escapeHtml(typeLabel(alert.type))} #${escapeHtml(alert.number)}</span>
        </nav>
        <header class="detail-header">
          <div class="detail-header__chips">
            ${severityChip(alert.severity)}
            ${typeChip(alert.type)}
          </div>
          <h1>${escapeHtml(alert.title)}</h1>
          <p class="lede">${escapeHtml(alert.subtitle || '')}</p>
          <div class="detail-actions">
            <a class="btn btn-primary" href="${escapeHtml(alert.html_url)}" target="_blank" rel="noopener noreferrer">Open on GitHub</a>
            <button type="button" class="btn btn-ghost repo-link" data-owner="${escapeHtml(alert.owner)}" data-name="${escapeHtml(alert.name)}" data-repo="${escapeHtml(alert.repo)}">View repo alerts</button>
          </div>
          <p class="meta-line">Created ${escapeHtml(formatWhen(alert.created_at))} · Updated ${escapeHtml(formatWhen(alert.updated_at))} · State ${escapeHtml(alert.state)}</p>
        </header>
        ${body}
      </section>
    `;
  }

  function renderRepoView(repo, alerts, summary) {
    return `
      <section class="repo-view">
        <nav class="crumb">
          <a href="${global.data.routeHome()}">All alerts</a>
          <span aria-hidden="true">/</span>
          <span>${escapeHtml(repo)}</span>
        </nav>
        <header class="detail-header">
          <p class="brand-mark">Repository</p>
          <h1>${escapeHtml(repo)}</h1>
          <p class="lede"><a href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noopener noreferrer">Open repository on GitHub</a></p>
        </header>
        ${renderSummary(summary, { scoped: true })}
        ${renderFilters({ type: '', search: '' })}
        <div id="alert-list-root">${renderAlertList(alerts)}</div>
      </section>
    `;
  }

  function renderHome(alerts, summary, filters) {
    return `
      <section class="home-view">
        ${renderSummary(summary)}
        ${renderFilters(filters)}
        <div id="alert-list-root">${renderAlertList(alerts)}</div>
      </section>
    `;
  }

  global.render = {
    escapeHtml,
    formatWhen,
    typeLabel,
    renderSummary,
    renderFilters,
    renderAlertList,
    renderSignedOut,
    renderSignedOutMain,
    renderSignedOutSidebar,
    renderRepoSidebar,
    renderLoading,
    renderAlertDetail,
    renderRepoView,
    renderHome,
  };
})(window.Alerts);
