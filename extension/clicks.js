// Effet visuel des clics pendant un enregistrement vidéo LocalShot.
// Injecté seulement pendant l'enregistrement ; ne lit rien et n'envoie rien.
(() => {
  if (window.__lsClicks) return;
  const host = document.createElement('localshot-clicks');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;contain:strict;';
  const root = host.attachShadow({ mode: 'closed' });

  function onDown(e) {
    if (!e.isPrimary && e.pointerType !== 'mouse') return;
    if (!host.isConnected) (document.documentElement || document).append(host);
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;` +
      'background:rgba(249,115,22,.35);border:3px solid rgba(249,115,22,.95);box-sizing:border-box;pointer-events:none;';
    root.append(dot);
    dot.animate(
      [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }],
      { duration: 550, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).onfinish = () => dot.remove();
  }

  addEventListener('pointerdown', onDown, { capture: true, passive: true });

  function off() {
    removeEventListener('pointerdown', onDown, { capture: true });
    host.remove();
    delete window.__lsClicks;
  }
  window.__lsClicks = off;
  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'ls-clicks-off') off(); });
})();
