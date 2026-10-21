#!/usr/bin/env bash
# Met à jour claudio.leodev.fr : ./deploy.sh  (depuis Git Bash, clé SSH de leo-dev requise)
# La base des comptes (data/app.db sur le serveur) n'est jamais écrasée.
set -euo pipefail
cd "$(dirname "$0")"
node test.js
tar czf - --exclude='data/app.db*' package.json server.js public data |
  ssh leo-dev@51.91.103.52 'cat > /tmp/claudio.tgz &&
    sudo tar xzf /tmp/claudio.tgz -C /opt/claudio && rm /tmp/claudio.tgz &&
    sudo chown -R root:root /opt/claudio && sudo chown -R claudio:claudio /opt/claudio/data &&
    sudo systemctl restart claudio && sleep 2 && systemctl is-active claudio'
echo "En ligne : https://claudio.leodev.fr"
