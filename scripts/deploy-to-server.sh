#!/bin/bash

# Configuration
SERVER="root@173.249.16.253"
REMOTE_DIR="/root/bridge-relayer"
LOCAL_DIR="."

echo "Packaging files for deployment..."

# Create a temporary directory for the files to be deployed
TEMP_DIR=$(mktemp -d)
mkdir -p $TEMP_DIR/dist
mkdir -p $TEMP_DIR/contracts

# Copy necessary files
cp package.json package-lock.json tsconfig.json $TEMP_DIR/
cp .env $TEMP_DIR/
cp ecosystem.config.js $TEMP_DIR/
cp studio-deployment.json bsc-deployment.json $TEMP_DIR/
cp multichain.config.ts $TEMP_DIR/
cp -r dist/* $TEMP_DIR/dist/
cp scripts/bridge-relayer.service $TEMP_DIR/

echo "Creating remote directory..."
ssh $SERVER "mkdir -p $REMOTE_DIR"

echo "Uploading files to server..."
scp -r $TEMP_DIR/* $SERVER:$REMOTE_DIR/

echo "Setting up the server..."
ssh $SERVER << EOF
  cd $REMOTE_DIR
  
  # Install Node.js and npm if not already installed
  if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  fi
  
  # Install PM2 globally if not already installed
  if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
  fi
  
  # Install dependencies
  echo "Installing dependencies..."
  npm ci
  
  # Set up PM2 to start on boot
  echo "Setting up PM2 to start on boot..."
  pm2 startup
  
  # Start the relayer
  echo "Starting the relayer..."
  pm2 start ecosystem.config.js
  
  # Save the PM2 configuration
  echo "Saving PM2 configuration..."
  pm2 save
  
  # Set up systemd service as a backup
  echo "Setting up systemd service as a backup..."
  cp bridge-relayer.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable bridge-relayer.service
  
  echo "Deployment completed successfully!"
  echo "The relayer is now running with PM2 and will start automatically on system boot."
  echo "Additionally, a systemd service has been set up as a backup."
EOF

# Clean up
rm -rf $TEMP_DIR

echo "Deployment script completed!"
