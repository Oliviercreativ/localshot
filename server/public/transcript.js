// Transcription affichée sous la vidéo : clic sur une phrase = saut à ce moment.
// Copie identique dans extension/ui/ et server/public/ (vérifié par npm test).
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * box : conteneur ; caps : [{start,end,text}] ; player : lecteur (createPlayer).
 * onEdit(caps) : si fourni, le texte est modifiable et chaque correction est renvoyée.
 */
export function renderTranscript(box, caps, player, { onEdit } = {}) {
  const lines = caps.map((c, i) => {
    const time = document.createElement('button');
    time.type = 'button';
    time.className = 'tr-time';
    time.textContent = fmt(c.start);
    time.addEventListener('click', () => { player.seekTo(c.start); player.video.play().catch(() => {}); });
    const text = document.createElement('span');
    text.className = 'tr-text';
    text.textContent = c.text;
    if (onEdit) {
      text.contentEditable = 'plaintext-only';
      text.spellcheck = true;
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
      text.addEventListener('blur', () => {
        const v = text.textContent.replace(/\s+/g, ' ').trim();
        if (v === caps[i].text) return;
        caps[i] = { ...caps[i], text: v };
        onEdit(caps.filter((x) => x.text));
      });
    } else {
      text.addEventListener('click', () => time.click());
    }
    const row = document.createElement('div');
    row.className = 'tr-line';
    row.append(time, text);
    return row;
  });
  const list = document.createElement('div');
  list.className = 'tr-list';
  list.append(...lines);
  box.replaceChildren(list);
  box.hidden = !caps.length;

  let last = -1;
  box.trOff?.(); // un seul suivi actif si la liste est redessinée
  const follow = () => {
    const t = player.video.currentTime;
    const i = caps.findIndex((c) => t >= c.start && t < c.end);
    if (i === last) return;
    lines[last]?.classList.remove('is-now');
    lines[i]?.classList.add('is-now');
    last = i;
  };
  player.video.addEventListener('timeupdate', follow);
  box.trOff = () => player.video.removeEventListener('timeupdate', follow);
}
