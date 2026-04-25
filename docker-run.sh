#!/bin/bash

# Build and run medisServer in Docker
# Run this on the remote Mac after Docker is set up

set -e

# Ensure docker-machine env is loaded
if command -v docker-machine &>/dev/null; then
    eval "$(docker-machine env default 2>/dev/null)" || true
fi

cd ~/medisServer

echo "=== Building medisServer Docker image ==="
docker build -t medis-server .

echo ""
echo "=== Starting medisServer ==="
docker rm -f medis-server 2>/dev/null || true

docker run -d \
    --name medis-server \
    --restart unless-stopped \
    -p 3000:3000 \
    -v "$HOME/Downloads:/media:ro" \
    -v "$HOME/medisServer/data:/app/data" \
    medis-server

echo ""
echo "=== medisServer is running ==="
DOCKER_IP=$(docker-machine ip default 2>/dev/null || echo "localhost")
echo "Access at: http://${DOCKER_IP}:3000"
echo ""
echo "Useful commands:"
echo "  docker logs -f medis-server    # view logs"
echo "  docker stop medis-server       # stop"
echo "  docker start medis-server      # start again"
