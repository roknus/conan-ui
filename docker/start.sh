#!/bin/bash
set -e

echo "Starting Conan UI Application..."

# Use environment variables with defaults
export BACKEND_PORT=${BACKEND_PORT:-8000}
export FRONTEND_PORT=${FRONTEND_PORT:-80}

# Generate nginx configuration from template using envsubst
echo "Generating nginx configuration from template..."
envsubst '${BACKEND_PORT},${FRONTEND_PORT}' < /docker/nginx.conf.template > /etc/nginx/nginx.conf

# Start FastAPI backend in background
echo "Starting FastAPI backend on port ${BACKEND_PORT}..."
cd /app/backend
python main.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 5

# Start nginx in foreground
echo "Starting nginx frontend server on port ${FRONTEND_PORT}..."
exec nginx -g "daemon off;" &
NGINX_PID=$!

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $NGINX_PID 2>/dev/null || true
    exit
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Wait for any process to exit
wait
