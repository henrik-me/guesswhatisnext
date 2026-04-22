if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Reload once when a new service worker takes control, so users on an
  // older cached shell (e.g. gwn-v2) get the fresh assets immediately.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!sessionStorage.getItem('gwn-sw-reloaded')) {
      sessionStorage.setItem('gwn-sw-reloaded', '1');
      window.location.reload();
    }
  });
}
