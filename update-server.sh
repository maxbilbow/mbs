#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p ./logs
exec >> ./logs/update-server.log 2>&1
exec 9>./logs/update-server.lock
flock -n 9 || { echo "Another update is running"; exit 1; }
echo "$(date +"%Y-%m-%d %H:%M:%S") Updating Minecraft Bedrock ($(node -v))"
node ./update-server.ts
