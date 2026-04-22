if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Reload once when a new service worker takes control, so users on an
  // older cached shell (e.g. gwn-v2) get the fresh assets immediately.
  // Only reload if there was already a controller — skip on first install.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !sessionStorage.getItem('gwn-sw-reloaded')) {
      sessionStorage.setItem('gwn-sw-reloaded', '1');
      window.location.reload();
    }
  });
}
