// Commentaires horodatés d'une capture partagée (« à 1:23, changer ce bouton »).
// Copie identique dans extension/ui/ et server/public/ (vérifié par npm test).
// request(path, opts) appelle le serveur ; owner = vue du propriétaire (suppression possible).
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const NAME_KEY = 'localshot-comment-name';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

/**
 * box : conteneur ; c : capture (avec c.comments) ; player : lecteur vidéo ou null (image).
 * canPost : le formulaire est affiché ; notify(msg, kind).
 */
export function renderComments(box, c, { request, player = null, owner = false, canPost = true, notify = () => {} }) {
  let list = Array.isArray(c.comments) ? c.comments : [];
  const items = el('div', { class: 'cm-list' });
  const count = el('span', { class: 'muted' });

  function paint() {
    count.textContent = list.length ? `${list.length}` : '';
    player?.setMarkers?.(list.filter((x) => Number.isFinite(x.t)).map((x) => x.t));
    items.replaceChildren(...list.map((m) => {
      const head = el('div', { class: 'cm-head' }, el('b', {}, m.name || 'Anonyme'),
        el('span', { class: 'muted' }, new Date(m.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      if (Number.isFinite(m.t) && player) {
        const at = el('button', { type: 'button', class: 'cm-time' }, fmt(m.t));
        at.addEventListener('click', () => { player.seekTo(m.t); player.video.pause(); });
        head.prepend(at);
      }
      if (owner) {
        const del = el('button', { type: 'button', class: 'cm-del', title: 'Supprimer ce commentaire', 'aria-label': 'Supprimer ce commentaire' }, '✕');
        del.addEventListener('click', async () => {
          if (!confirm('Supprimer ce commentaire ?')) return;
          const r = await request(`/api/captures/${encodeURIComponent(c.id)}/comments/${encodeURIComponent(m.id)}`, { method: 'DELETE' }).catch(() => null);
          if (!r?.ok) return notify('Suppression impossible', 'error');
          list = list.filter((x) => x.id !== m.id);
          paint();
        });
        head.append(del);
      }
      return el('div', { class: 'cm-item' }, head, el('p', {}, m.text));
    }));
    if (!list.length) items.append(el('p', { class: 'muted cm-empty' }, owner ? 'Aucun commentaire pour l\'instant.' : 'Soyez le premier à commenter.'));
  }

  const parts = [el('div', { class: 'cm-title' }, el('b', {}, 'Commentaires'), count), items];
  if (canPost) {
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* stockage indisponible */ }
    const nameIn = el('input', { class: 'cm-name', placeholder: 'Votre nom', maxlength: '60', autocomplete: 'name', 'aria-label': 'Votre nom' });
    nameIn.value = name;
    const text = el('textarea', { class: 'cm-text', rows: '2', maxlength: '1000', placeholder: player ? 'Votre remarque sur ce moment de la vidéo…' : 'Votre remarque…', 'aria-label': 'Commentaire' });
    const at = el('label', { class: 'cm-at' });
    const atBox = el('input', { type: 'checkbox' });
    atBox.checked = !!player;
    const atLabel = el('span');
    at.append(atBox, atLabel);
    at.hidden = !player;
    const syncAt = () => (atLabel.textContent = `à ${fmt(player?.video.currentTime || 0)}`);
    if (player) { player.video.addEventListener('timeupdate', syncAt); syncAt(); }
    text.addEventListener('focus', () => player?.video.pause());
    const send = el('button', { type: 'submit', class: 'btn primary' }, 'Envoyer');
    const form = el('form', { class: 'cm-form' }, text, el('div', { class: 'cm-row' }, nameIn, at, send));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { text: text.value.trim(), name: nameIn.value.trim() };
      if (!body.text) return text.focus();
      if (player && atBox.checked) body.t = Math.round(player.video.currentTime * 10) / 10;
      send.disabled = true;
      try {
        const r = await request(`/api/captures/${encodeURIComponent(c.id)}/comments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erreur ${r.status}`);
        list = [...list, await r.json()];
        text.value = '';
        try { localStorage.setItem(NAME_KEY, body.name); } catch { /* stockage indisponible */ }
        paint();
        notify('Commentaire envoyé');
      } catch (err) {
        notify(`Commentaire non envoyé : ${err.message}`, 'error');
      } finally {
        send.disabled = false;
      }
    });
    parts.push(form);
  }
  box.replaceChildren(...parts);
  box.hidden = false;
  paint();
}
