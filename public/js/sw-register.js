if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let alreadyReloaded = false;
  navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Reload once when a new service worker takes control, so users on an
  // older cached shell (e.g. gwn-v2) get the fresh assets immediately.
  // Only reload if there was already a controller — skip on first install.
  // sessionStorage is wrapped in try/catch because it can throw in some
  // browser modes (private browsing, storage disabled).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || alreadyReloaded) return;
    try {
      if (sessionStorage.getItem('gwn-sw-reloaded')) return;
      sessionStorage.setItem('gwn-sw-reloaded', '1');
    } catch {
      // Storage unavailable — fall through, in-memory flag prevents loops
    }
    alreadyReloaded = true;
    window.location.reload();
  });
}
