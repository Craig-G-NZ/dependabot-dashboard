(function () {
  const k = 'alerts_theme';
  let t;
  try {
    t = localStorage.getItem(k);
  } catch (e) {
    /* private browsing */
  }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
})();
