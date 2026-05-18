#! /bin/bash

cd "$(dirname "$0")"
mkdir -p ./logs
logfile="./logs/update-server.log" #-$(date +"%Y-%m-%d").log"

touch "$logfile"

echo "$(date +"%Y-%m-%d %H:%M:%S") Running mincraft bedrock server update..." >> "$logfile"
echo "===============================================================" >> "$logfile"
echo "$(date +"%Y-%m-%d %H:%M:%S") Using node version: $(node -v)" >> "$logfile"
node ./update-server.ts >> "$logfile"
echo "===============================================================" >> "$logfile"
echo "" >> "$logfile"

