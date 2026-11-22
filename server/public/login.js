const $ = (id) => document.getElementById(id);
const health = await fetch('/api/health').then((r) => r.json()).catch(() => ({}));
if (health.auth) {
  $('noauth').hidden = true;
  $('login').hidden = false;
  $('key').focus();
  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('err').hidden = true;
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: $('key').value }) });
    if (r.ok) return location.reload();
    $('err').textContent = r.status === 401 ? 'Clé incorrecte.' : 'Connexion impossible.';
    $('err').hidden = false;
  });
}
