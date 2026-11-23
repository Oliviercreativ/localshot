// Ouverture / pilotage de la fenêtre d'enregistrement vidéo (utilisé par le popup et le service worker).
const URL_REC = (win) => chrome.runtime.getURL(`ui/recorder.html${win ? `?win=${win}` : ''}`);

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

// État de l'enregistreur s'il est ouvert, sinon null (sans jamais bloquer).
export async function recorderStatus() {
  try { return (await withTimeout(chrome.runtime.sendMessage({ type: 'rec-status' }), 400)) || null; } catch { return null; }
}

export async function openRecorder() {
  const st = await recorderStatus();
  if (st) return chrome.runtime.sendMessage({ type: 'rec-focus' }).catch(() => {});

  const W = 380, H = 640;
  const cur = await chrome.windows.getLastFocused().catch(() => null);
  // Chrome en plein écran (macOS) : une fenêtre séparée s'ouvrirait dans un autre bureau → on ouvre un onglet.
  if (cur?.state === 'fullscreen') return chrome.tabs.create({ url: URL_REC(cur.id), windowId: cur.id });

  const pos = cur?.width ? { left: Math.max(0, cur.left + cur.width - W - 24), top: Math.max(0, cur.top + 80) } : {};
  try {
    await chrome.windows.create({ url: URL_REC(cur?.type === 'normal' ? cur.id : 0), type: 'popup', width: W, height: H, focused: true, ...pos });
  } catch (e) {
    console.warn('LocalShot: fenêtre positionnée impossible, nouvel essai.', e);
    try { await chrome.windows.create({ url: URL_REC(), type: 'popup', width: W, height: H, focused: true }); }
    catch (e2) {
      console.warn('LocalShot: fenêtre impossible, ouverture dans un onglet.', e2);
      await chrome.tabs.create({ url: URL_REC() });
    }
  }
}

export async function toggleRecorder() {
  const st = await recorderStatus();
  if (st && ['recording', 'paused'].includes(st.state)) return chrome.runtime.sendMessage({ type: 'rec-stop' }).catch(() => {});
  if (st?.state === 'ready') return chrome.runtime.sendMessage({ type: 'rec-start' }).catch(() => {});
  return openRecorder();
}
