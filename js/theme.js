window.Alerts = window.Alerts || {};

(function (global) {
  const STORAGE_KEY = 'alerts_theme';

  function getPreferredTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* private browsing */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070a0f' : '#0b1220');
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
  }

  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';

    const syncLabel = () => {
      const isDark = document.documentElement.dataset.theme === 'dark';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    };

    syncLabel();
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      syncLabel();
    });
  }

  applyTheme(getPreferredTheme());

  global.theme = {
    STORAGE_KEY,
    getPreferredTheme,
    applyTheme,
    setTheme,
    initThemeToggle,
  };
})(window.Alerts);
