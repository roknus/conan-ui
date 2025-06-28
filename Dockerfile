# Multi-stage Dockerfile for Conan UI (Frontend + Backend)
FROM node:18-alpine AS frontend-builder

# Set working directory for frontend build
WORKDIR /app/frontend

# Set React environment variables for build time
# Production builds always use /api (nginx proxy)
ENV REACT_APP_API_URL=/api

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copy frontend source and build
COPY frontend/ ./

# Build with environment variable verification
RUN echo "Building with REACT_APP_API_URL: $REACT_APP_API_URL" && npm run build

# Python backend stage
FROM python:3.11-slim AS backend

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r conanui && useradd -r -g conanui conanui

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Install nginx to serve frontend
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Copy nginx configuration template
COPY docker/nginx.conf.template /docker/nginx.conf.template

# Create directories and set permissions
RUN mkdir -p /var/log/nginx /var/lib/nginx /run/nginx /app/.conan2 && \
    chown -R conanui:conanui /app /var/log/nginx /var/lib/nginx /run/nginx /etc/nginx

# Copy startup script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh && chown conanui:conanui /start.sh && \
    sed -i 's/\r$//' /start.sh

# Switch to non-root user
USER conanui

# Environment variables with defaults
ENV CONAN_HOME=/app/.conan2
ENV CUSTOM_REMOTE_NAME=artifactory
ENV CUSTOM_REMOTE_URL=https://your-artifactory.com/artifactory/api/conan/conan-repo
ENV CUSTOM_REMOTE_USER=username
ENV CUSTOM_REMOTE_PASSWORD=password
ENV CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:80,http://127.0.0.1:80
ENV BACKEND_PORT=8000
ENV FRONTEND_PORT=80

# Expose ports - use ARG to make them dynamic
ARG BACKEND_PORT=8000
ARG FRONTEND_PORT=80
EXPOSE $FRONTEND_PORT $BACKEND_PORT

# Health check - use environment variable
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${BACKEND_PORT}/health || exit 1

# Start both services
CMD ["/start.sh"]
