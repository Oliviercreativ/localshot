// Application installable (PWA) : enregistre le service worker et propose « Installer l'application ».
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  const btn = document.getElementById('install');
  if (!btn) return;
  btn.hidden = false;
  btn.onclick = async () => {
    btn.hidden = true;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
  };
});
