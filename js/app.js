window.Alerts = window.Alerts || {};

(function (global) {
  const state = {
    user: null,
    alerts: [],
    repos: [],
    refreshedAt: null,
    loading: false,
    progress: null,
    error: null,
    filters: { type: '', severity: '', search: '' },
    detail: null,
  };

  let abortController = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setAuthChrome(loggedIn) {
    $('login-btn')?.classList.toggle('hidden', loggedIn);
    $('btn-logout')?.classList.toggle('hidden', !loggedIn);
    $('btn-refresh')?.classList.toggle('hidden', !loggedIn);
    const userLabel = $('user-label');
    if (userLabel) {
      userLabel.classList.toggle('hidden', !loggedIn || !state.user);
      if (state.user) userLabel.textContent = state.user.login;
    }
  }

  function applyFilters(alerts) {
    const q = (state.filters.search || '').trim().toLowerCase();
    return alerts.filter((a) => {
      if (state.filters.type && a.type !== state.filters.type) return false;
      if (state.filters.severity && a.severity !== state.filters.severity) return false;
      if (!q) return true;
      const hay = `${a.repo} ${a.title} ${a.subtitle} ${a.type}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function paintSidebar(route) {
    const el = $('sidebar-content');
    const title = $('sidebar-title');
    if (!el) return;

    if (!global.auth.isLoggedIn()) {
      if (title) title.textContent = 'Repositories';
      const info = global.auth.getOAuthSetupInfo?.() || {};
      // ensure config-loaded client id
      if (window.ALERTS_CONFIG) {
        info.clientId = window.ALERTS_CONFIG.clientId || info.clientId;
        info.redirectUri =
          info.redirectUri ||
          `https://${window.ALERTS_CONFIG.canonicalHost || location.host}/auth/callback`;
        info.clientIdHint = info.clientId
          ? `${info.clientId.slice(0, 6)}...${info.clientId.slice(-4)}`
          : '(not set)';
      }
      el.innerHTML = global.render.renderSignedOutSidebar(info);
      return;
    }

    if (title) title.textContent = 'Repositories';
    if (state.loading) {
      el.innerHTML = `<p class="empty-state">Loading…</p>`;
      return;
    }

    const summary = global.data.summarize(state.alerts);
    const activeRepo = route.view === 'repo' || route.view === 'alert' ? route.repo : '';
    el.innerHTML = global.render.renderRepoSidebar(summary, activeRepo);
  }

  function wireListInteractions(root) {
    root.querySelectorAll('.alert-row').forEach((row) => {
      const open = () => {
        const id = row.getAttribute('data-alert-id');
        const alert = state.alerts.find((a) => a.id === id);
        if (!alert) return;
        location.hash = global.data.routeAlert(alert.type, alert.owner, alert.name, alert.number);
      };
      row.addEventListener('click', (e) => {
        if (e.target.closest('.repo-link')) return;
        open();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    root.querySelectorAll('.repo-link').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const owner = btn.getAttribute('data-owner');
        const name = btn.getAttribute('data-name');
        location.hash = global.data.routeRepo(owner, name);
      });
    });

    const typeSelect = root.querySelector('#filter-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        state.filters.type = typeSelect.value;
        paint();
      });
    }

    const search = root.querySelector('#filter-search');
    if (search) {
      search.addEventListener('input', () => {
        state.filters.search = search.value;
        paintListOnly(root);
      });
    }

    root.querySelectorAll('.severity-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sev = btn.getAttribute('data-severity');
        state.filters.severity = state.filters.severity === sev ? '' : sev;
        paint();
      });
    });
  }

  function paintListOnly(root) {
    const route = global.data.parseRoute(location.hash);
    let alerts = state.alerts;
    if (route.view === 'repo') {
      alerts = alerts.filter((a) => a.repo === route.repo);
    }
    alerts = applyFilters(alerts);
    const listRoot = root.querySelector('#alert-list-root') || $('alert-list-root');
    if (listRoot) {
      listRoot.innerHTML = global.render.renderAlertList(alerts);
      wireListInteractions(listRoot.parentElement || root);
    }
  }

  async function paint() {
    const main = $('main');
    if (!main) return;
    const route = global.data.parseRoute(location.hash);

    if (!global.auth.isLoggedIn()) {
      setAuthChrome(false);
      paintSidebar(route);
      main.innerHTML = global.render.renderSignedOutMain();
      return;
    }

    setAuthChrome(true);
    paintSidebar(route);

    if (state.loading) {
      main.innerHTML = global.render.renderLoading(state.progress);
      return;
    }

    if (state.error && !state.alerts.length) {
      main.innerHTML = `<section class="empty-state"><p class="text-danger">${global.render.escapeHtml(state.error)}</p><button type="button" class="btn btn-primary" id="retry-load">Retry</button></section>`;
      $('retry-load')?.addEventListener('click', () => loadAlerts());
      return;
    }

    if (route.view === 'alert') {
      main.innerHTML = `<p class="empty-state">Loading alert…</p>`;
      try {
        const cacheKey = `${route.type}:${route.owner}/${route.name}:${route.number}`;
        let detail = state.detail?._cacheKey === cacheKey ? state.detail : null;
        if (!detail) {
          const listed = state.alerts.find(
            (a) =>
              a.type === route.type &&
              a.owner === route.owner &&
              a.name === route.name &&
              String(a.number) === String(route.number)
          );
          detail = await global.data.fetchAlertDetail(
            route.type,
            route.owner,
            route.name,
            route.number
          );
          if (listed && !detail.html_url) detail.html_url = listed.html_url;
        }
        detail._cacheKey = cacheKey;
        state.detail = detail;
        main.innerHTML = global.render.renderAlertDetail(detail);
        wireListInteractions(main);
      } catch (err) {
        main.innerHTML = `<section class="empty-state"><p class="text-danger">${global.render.escapeHtml(err.message)}</p><a class="btn btn-ghost" href="${global.data.routeHome()}">Back</a></section>`;
      }
      updateStatus();
      return;
    }

    if (route.view === 'repo') {
      const alerts = state.alerts.filter((a) => a.repo === route.repo);
      const summary = global.data.summarize(alerts);
      const filtered = applyFilters(alerts);
      main.innerHTML = global.render.renderRepoView(route.repo, filtered, summary);
    } else {
      const summary = global.data.summarize(state.alerts);
      const filtered = applyFilters(state.alerts);
      main.innerHTML = global.render.renderHome(filtered, summary, state.filters);
    }

    main.querySelectorAll('.severity-filter').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-severity') === state.filters.severity);
    });

    wireListInteractions(main);
    updateStatus();
  }

  function updateStatus() {
    const el = $('refresh-status');
    // status lives only if we add it; optional — use user label title
    if (!state.refreshedAt) return;
    const btn = $('btn-refresh');
    if (btn) {
      btn.title = `Updated ${global.render.formatWhen(state.refreshedAt)} · ${state.alerts.length} open`;
    }
  }

  function showError(message) {
    const banner = $('app-error');
    if (!banner) return;
    banner.textContent = message;
    banner.classList.remove('hidden');
  }

  async function loadAlerts() {
    if (!global.auth.isLoggedIn()) {
      paint();
      return;
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    state.loading = true;
    state.error = null;
    state.progress = { processed: 0, total: 0, alertCount: 0 };
    paint();

    try {
      if (!state.user) {
        state.user = await global.api.getUser({ signal: abortController.signal });
      }
      const result = await global.data.collectAllAlerts({
        signal: abortController.signal,
        onProgress: (p) => {
          state.progress = p;
          paint();
        },
      });
      state.alerts = result.alerts;
      state.repos = result.repos;
      state.refreshedAt = result.refreshedAt;
      state.loading = false;
      paint();
    } catch (err) {
      if (err.name === 'AbortError') return;
      state.loading = false;
      state.error = err.message || String(err);
      paint();
    }
  }

  function wireChrome() {
    global.theme.initThemeToggle();

    $('login-btn')?.addEventListener('click', async () => {
      try {
        await global.auth.startLogin();
      } catch (err) {
        showError(err.message);
      }
    });

    $('btn-refresh')?.addEventListener('click', () => loadAlerts());
    $('btn-logout')?.addEventListener('click', () => {
      global.auth.logout();
      state.user = null;
      state.alerts = [];
      state.detail = null;
      location.hash = global.data.routeHome();
      paint();
    });

    $('sidebar-toggle')?.addEventListener('click', () => {
      const layout = $('app-layout');
      if (!layout) return;
      const collapsed = layout.classList.toggle('sidebar-collapsed');
      const btn = $('sidebar-toggle');
      if (btn) {
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      }
    });

    window.addEventListener('hashchange', () => paint());
  }

  async function boot() {
    wireChrome();

    const params = new URLSearchParams(location.search);
    if (params.get('auth_error')) {
      showError(params.get('auth_error'));
    }

    if (!location.hash) location.hash = '#/';
    await loadAlerts();
  }

  document.addEventListener('alerts-ready', () => {
    boot().catch((err) => {
      console.error(err);
      showError(err.message);
    });
  });
})(window.Alerts);
