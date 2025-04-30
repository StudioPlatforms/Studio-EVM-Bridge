#!/bin/bash

# Configuration
SERVER="root@173.249.16.253"

echo "Checking relayer status on server..."

ssh $SERVER << EOF
  echo "PM2 Status:"
  pm2 list | grep bridge-relayer
  
  echo ""
  echo "Systemd Service Status:"
  systemctl status bridge-relayer.service | head -n 10
  
  echo ""
  echo "Checking logs:"
  echo "PM2 Logs (last 10 lines):"
  pm2 logs bridge-relayer --lines 10 --nostream
  
  echo ""
  echo "Systemd Logs (last 10 lines):"
  journalctl -u bridge-relayer.service -n 10
EOF

echo "Monitoring completed!"
