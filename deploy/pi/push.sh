#!/usr/bin/env bash
# Depuis le Mac : envoie LocalShot sur le Pi et lance l'installation.
#   bash deploy/pi/push.sh [hôte-ssh] [dossier-des-données]
# Par défaut l'hôte est « pi » (nom Tailscale du Pi, ou entrée de ~/.ssh/config).
set -euo pipefail
HOST="${1:-pi}"
DATA="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rsync -az --delete --exclude data --exclude '.claude-flow' --exclude '.swarm' --exclude node_modules \
  "$ROOT/server" "$ROOT/package.json" "$ROOT/deploy" "$HOST:localshot/"
ssh -t "$HOST" "sudo bash localshot/deploy/pi/install.sh $DATA"
