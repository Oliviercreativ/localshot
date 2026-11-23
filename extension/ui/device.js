// Affichage des captures : ordinateur (normal), tablette ou mobile.
// Tablette et mobile simulent l'appareil dans l'onglet (taille, densité de pixels, tactile, navigateur mobile)
// grâce à l'autorisation facultative « debugger », demandée seulement quand vous choisissez Tablette ou Mobile,
// rendue quand vous revenez à Ordinateur. La simulation ne dure que le temps de la capture.
const IOS = '18_0';
export const DEVICES = {
  desktop: { label: 'Ordinateur' },
  tablet: { label: 'Tablette', width: 820, height: 1180, dpr: 2, platform: 'iPad',
    ua: `Mozilla/5.0 (iPad; CPU OS ${IOS} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1` },
  mobile: { label: 'Mobile', width: 390, height: 844, dpr: 3, platform: 'iPhone',
    ua: `Mozilla/5.0 (iPhone; CPU iPhone OS ${IOS} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1` },
};
export const DBG = { permissions: ['debugger'] };

// Affichage choisi ; « desktop » si l'autorisation a été retirée entre-temps.
export async function getDevice() {
  const { device = 'desktop' } = await chrome.storage.local.get('device').catch(() => ({}));
  if (!DEVICES[device] || device === 'desktop') return 'desktop';
  return (await chrome.permissions.contains(DBG).catch(() => false)) ? device : 'desktop';
}

/** Simule l'appareil dans l'onglet. Renvoie { send, detach } ; detach() rend l'onglet normal. */
export async function emulate(tabId, device) {
  const d = DEVICES[device];
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  const send = (method, params = {}) => chrome.debugger.sendCommand(target, method, params);
  const detach = () => chrome.debugger.detach(target).catch(() => {});
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: true, screenWidth: d.width, screenHeight: d.height });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: d.ua, platform: d.platform });
    await send('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {}); // pas de barre de défilement d'ordinateur
  } catch (e) {
    await detach();
    throw e;
  }
  return { send, detach, device: d };
}

// Image PNG de ce que montre l'onglet simulé ; full : toute la page (hauteur limitée pour rester lisible).
export async function emulatedShot(session, { full = false } = {}) {
  const params = { format: 'png' };
  if (full) {
    const m = await session.send('Page.getLayoutMetrics');
    const w = m.cssLayoutViewport?.clientWidth || session.device.width;
    const h = Math.min(m.cssContentSize?.height || session.device.height, Math.floor(32000 / session.device.dpr));
    Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  }
  const { data } = await session.send('Page.captureScreenshot', params);
  return (await fetch(`data:image/png;base64,${data}`)).blob();
}

/**
 * Sélecteur Ordinateur / Tablette / Mobile dans `box` (popup, panneau latéral, enregistreur).
 * L'autorisation est demandée au clic, comme Chrome l'exige.
 */
export function mountDevicePicker(box, { onError = () => {}, onChange = () => {} } = {}) {
  box.classList.add('seg', 'device-seg');
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', 'Affichage');
  const btns = Object.entries(DEVICES).map(([id, d]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.device = id;
    b.setAttribute('role', 'radio');
    b.textContent = d.label;
    if (d.width) b.title = `${d.label} : ${d.width} × ${d.height}`;
    box.append(b);
    return b;
  });
  const sync = (cur) => { for (const b of btns) { const on = b.dataset.device === cur; b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-pressed', String(on)); } };
  getDevice().then(sync);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-device]');
    if (!b) return;
    const id = b.dataset.device;
    const set = () => chrome.storage.local.set({ device: id }).then(() => { sync(id); onChange(id); });
    if (id === 'desktop') {
      // Plus besoin de simuler un appareil : on rend l'autorisation à Chrome.
      chrome.permissions.remove(DBG).catch(() => {});
      return set();
    }
    chrome.permissions.request(DBG).then((ok) => {
      if (!ok) return onError('Sans l\'autorisation de Chrome, LocalShot ne peut pas afficher la page en tablette ou en mobile.');
      set();
    }, (err) => onError(err.message));
  });
}
