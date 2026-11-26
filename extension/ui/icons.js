// Icônes de l'interface (SVG, trait de 2 px, couleur du texte). Aucun emoji dans LocalShot.
// Dans une page : <button data-icon="record"><span>Démarrer</span></button>, l'icône est ajoutée au chargement.
// En JavaScript : setIcon(bouton, 'pause', 'Pause') ou svg('x').
const FILL = 'fill="currentColor" stroke="none"';
const P = {
  record: `<circle cx="12" cy="12" r="7" ${FILL}/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2" ${FILL}/>`,
  pause: `<rect x="6" y="5" width="4" height="14" rx="1" ${FILL}/><rect x="14" y="5" width="4" height="14" rx="1" ${FILL}/>`,
  play: `<path d="M7 4.6v14.8a1 1 0 0 0 1.5.9l11.8-7.4a1 1 0 0 0 0-1.8L8.5 3.7A1 1 0 0 0 7 4.6z" ${FILL}/>`,
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  dock: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  zoom: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  laser: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" ${FILL}/>`,
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  step: '<circle cx="12" cy="12" r="9"/><path d="M10.5 9.5 12.5 8v8"/>',
  mark: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  eraser: '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  next: '<path d="m12 5 7 7-7 7M5 12h14"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  download: '<path d="M12 15V3M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  gallery: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
  video: '<path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  speaker: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.8"/>',
  click: '<path d="M14 4.1 12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2 8 5.1"/><path d="M9 9.5a.5.5 0 0 1 .7-.5l11 4.5a.5.5 0 0 1 0 .9l-4.2 1.3a1 1 0 0 0-.6.6l-1.3 4.2a.5.5 0 0 1-.9 0z"/>',
};

// Le style .ico est dans les feuilles de style (app.css, popup.css, sidepanel.css, barre flottante).

/** Élément <svg> de l'icône `name`, créé dans `doc` (la fenêtre flottante a son propre document). */
export function svg(name, doc = document) {
  const t = doc.createElement('template');
  t.innerHTML = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
  return t.content.firstChild;
}

/** Remplace le contenu de `el` par l'icône suivie du texte (le texte reste traduisible). */
export function setIcon(el, name, text) {
  const doc = el.ownerDocument;
  const parts = [svg(name, doc)];
  if (text) parts.push(Object.assign(doc.createElement('span'), { textContent: text }));
  el.replaceChildren(...parts);
}

/** Ajoute l'icône des éléments [data-icon] qui n'en ont pas encore. */
export function hydrate(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.firstElementChild?.classList?.contains('ico')) continue;
    el.prepend(svg(el.dataset.icon, el.ownerDocument));
  }
}

if (typeof document !== 'undefined') hydrate();
