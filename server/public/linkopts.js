// Options d'un lien de partage : vues, expiration, mot de passe, téléchargement.
// Copie identique dans extension/ui/ et server/public/ (vérifié par npm test).
// request(path, opts) appelle le serveur avec les droits du propriétaire (clé ou session).
const DAY = 24 * 3600 * 1000;
const CHOICES = [['', 'Jamais'], ['1', '24 heures'], ['7', '7 jours'], ['30', '30 jours']];

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}
const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Affiche les options dans `box` pour la capture `c` (vue propriétaire renvoyée par le serveur).
 * notify(message, kind) affiche un message ; onChange(c) reçoit la capture mise à jour.
 */
export function linkOptions(box, c, { request, notify = () => {}, onChange = () => {} }) {
  async function patch(body) {
    try {
      const r = await request(`/api/captures/${encodeURIComponent(c.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erreur ${r.status}`);
      c = await r.json();
      onChange(c);
      render();
      return true;
    } catch (e) {
      notify(`Réglage non enregistré : ${e.message}`, 'error');
      return false;
    }
  }

  function render() {
    const views = c.views || 0;
    const viewsEl = el('div', { class: 'lo-views' }, el('b', {}, String(views)), ` vue${views > 1 ? 's' : ''}`);

    // Expiration
    const sel = el('select', { 'aria-label': 'Expiration du lien' });
    for (const [v, label] of CHOICES) sel.append(el('option', { value: v }, label));
    const expired = c.expiresAt && Date.parse(c.expiresAt) <= Date.now();
    if (c.expiresAt) {
      sel.prepend(el('option', { value: 'keep' }, `${expired ? 'Expiré le' : 'Jusqu\'au'} ${fmt(c.expiresAt)}`));
      sel.value = 'keep';
    }
    sel.addEventListener('change', async () => {
      if (sel.value === 'keep') return;
      const ok = await patch({ expiresAt: sel.value ? new Date(Date.now() + Number(sel.value) * DAY).toISOString() : null });
      if (ok) notify(sel.value ? 'Expiration enregistrée' : 'Le lien n\'expire plus');
    });
    const expEl = el('label', { class: 'lo-field' }, el('span', {}, 'Expire'), sel);

    // Mot de passe
    let pwEl;
    if (c.hasPassword) {
      const rm = el('button', { type: 'button', class: 'btn' }, 'Retirer');
      rm.addEventListener('click', async () => { if (await patch({ password: null })) notify('Mot de passe retiré'); });
      pwEl = el('div', { class: 'lo-field' }, el('span', {}, 'Mot de passe'), el('span', { class: 'lo-on' }, '🔒 Activé'), rm);
    } else {
      const input = el('input', { type: 'password', placeholder: 'Aucun', autocomplete: 'new-password', 'aria-label': 'Mot de passe du lien', maxlength: '200' });
      const set = el('button', { type: 'button', class: 'btn' }, 'Définir');
      const go = async () => {
        if (!input.value) return input.focus();
        if (await patch({ password: input.value })) notify('Mot de passe défini : communiquez-le séparément du lien');
      };
      set.addEventListener('click', go);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), go()));
      pwEl = el('div', { class: 'lo-field' }, el('span', {}, 'Mot de passe'), input, set);
    }

    // Téléchargement
    const dl = el('input', { type: 'checkbox' });
    dl.checked = c.allowDownload !== false;
    dl.addEventListener('change', async () => {
      if (await patch({ allowDownload: dl.checked })) notify(dl.checked ? 'Téléchargement autorisé' : 'Bouton de téléchargement masqué');
    });
    const dlEl = el('label', { class: 'lo-check' }, dl, 'Autoriser le téléchargement');

    // Commentaires des visiteurs
    const cm = el('input', { type: 'checkbox' });
    cm.checked = c.allowComments !== false;
    cm.addEventListener('change', async () => {
      if (await patch({ allowComments: cm.checked })) notify(cm.checked ? 'Commentaires autorisés' : 'Commentaires désactivés');
    });
    const cmEl = el('label', { class: 'lo-check' }, cm, 'Autoriser les commentaires');

    box.replaceChildren(el('div', { class: 'lo-head' }, el('span', {}, 'Options du lien'), viewsEl), expEl, pwEl, dlEl, cmEl);
    box.hidden = false;
  }

  render();
}
