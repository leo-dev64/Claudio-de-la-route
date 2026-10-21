#!/usr/bin/env bash
# Met à jour claudio.leodev.fr : ./deploy.sh  (depuis Git Bash, clé SSH de leo-dev requise)
# La base des comptes (data/app.db sur le serveur) n'est jamais écrasée.
set -euo pipefail
cd "$(dirname "$0")"
node test.js
tar czf - --exclude='data/app.db*' package.json server.js public data |
  ssh leo-dev@51.91.103.52 'cat > /tmp/claudio.tgz && sudo -n /usr/local/bin/claudio-deploy'
echo "En ligne : https://claudio.leodev.fr"
