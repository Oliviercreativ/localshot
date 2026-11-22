#!/usr/bin/env bash
# Installation de LocalShot sur le Raspberry Pi (à lancer SUR le Pi, avec sudo).
#   sudo bash install.sh [dossier-des-données]
# Exemple avec un SSD monté sur /mnt/ssd :  sudo bash install.sh /mnt/ssd/localshot
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"
APP=/opt/localshot
DATA="${1:-/var/lib/localshot}"
ENV=/etc/localshot.env
PORT=4777
# Réinstallation sans argument : on garde le dossier de données déjà configuré.
if [ -z "${1:-}" ] && [ -f "$ENV" ]; then DATA="$(sed -n 's/^LOCALSHOT_DATA=//p' "$ENV")"; DATA="${DATA:-/var/lib/localshot}"; fi

[ "$(id -u)" = 0 ] || { echo "✖ Lancez avec sudo."; exit 1; }
say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }

say "Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get update -qq && apt-get install -y -qq nodejs
fi
node -v

say "Tailscale"
command -v tailscale >/dev/null || { echo "✖ Tailscale n'est pas installé : curl -fsSL https://tailscale.com/install.sh | sh"; exit 1; }
tailscale status >/dev/null 2>&1 || { echo "✖ Tailscale n'est pas connecté : sudo tailscale up --ssh"; exit 1; }
TS_NAME="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')"
[ -n "$TS_NAME" ] || { echo "✖ Nom Tailscale introuvable (MagicDNS activé ?)"; exit 1; }
echo "Adresse : https://$TS_NAME"

say "Utilisateur système et fichiers"
id localshot >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin localshot
mkdir -p "$APP" "$DATA"
rm -rf "$APP/server"
cp -r "$SRC/server" "$SRC/package.json" "$APP/"
find "$APP" -name '.claude-flow' -o -name '.swarm' | xargs rm -rf
chown -R root:root "$APP"; chmod -R a+rX "$APP"
chown -R localshot:localshot "$DATA"; chmod 700 "$DATA"

say "Clé d'accès"
if [ ! -f "$ENV" ]; then
  KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
  umask 077
  cat > "$ENV" <<CONF
LOCALSHOT_TOKEN=$KEY
LOCALSHOT_PUBLIC_URL=https://$TS_NAME
LOCALSHOT_DATA=$DATA
PORT=$PORT
CONF
  NEW_KEY=1
fi
sed -i -e "s#^LOCALSHOT_PUBLIC_URL=.*#LOCALSHOT_PUBLIC_URL=https://$TS_NAME#" -e "s#^LOCALSHOT_DATA=.*#LOCALSHOT_DATA=$DATA#" "$ENV"
chmod 600 "$ENV"

say "Service systemd"
install -m 644 "$SRC/deploy/pi/localshot.service" /etc/systemd/system/localshot.service
# Dossier de données (SSD par exemple) : seul chemin où le service a le droit d'écrire.
mkdir -p /etc/systemd/system/localshot.service.d
printf '[Service]\nReadWritePaths=%s\n' "$DATA" > /etc/systemd/system/localshot.service.d/data.conf
systemctl daemon-reload
systemctl enable --now localshot
systemctl restart localshot
sleep 1
systemctl is-active --quiet localshot || { journalctl -u localshot -n 30 --no-pager; exit 1; }

say "HTTPS via Tailscale (réseau privé uniquement, pas Internet)"
tailscale serve --bg --https=443 "http://127.0.0.1:$PORT"

say "Mises à jour de sécurité automatiques"
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
  apt-get install -y -qq unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades || true
fi

echo
echo "✔ LocalShot tourne sur https://$TS_NAME"
if [ "${NEW_KEY:-}" = 1 ]; then
  echo
  echo "  Clé d'accès (à coller dans l'extension, bouton « Serveur ») :"
  echo "  $KEY"
  echo "  Elle est aussi rangée dans $ENV (lisible par root uniquement)."
else
  echo "  Clé d'accès inchangée : sudo grep TOKEN $ENV"
fi
