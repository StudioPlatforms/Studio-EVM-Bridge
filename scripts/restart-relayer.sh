#!/bin/bash

# Configuration
SERVER="root@173.249.16.253"

echo "Restarting relayer on server..."

ssh $SERVER << EOF
  echo "Restarting with PM2..."
  pm2 restart bridge-relayer
  
  echo ""
  echo "Restarting systemd service as a backup..."
  systemctl restart bridge-relayer.service
  
  echo ""
  echo "Checking status after restart:"
  echo "PM2 Status:"
  pm2 list | grep bridge-relayer
  
  echo ""
  echo "Systemd Service Status:"
  systemctl status bridge-relayer.service | head -n 10
EOF

echo "Restart completed!"
