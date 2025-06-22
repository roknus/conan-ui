#!/bin/bash
set -e

echo "Starting Conan UI Application..."

# Start FastAPI backend in background
echo "Starting FastAPI backend..."
cd /app/backend
python main.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 5

# Start nginx in foreground
echo "Starting nginx frontend server..."
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
