"""
Conan API Backend for Conan UI

This backend uses the Conan API directly to interact with Conan packages,
both from local cache and configured remotes. This provides a clean
and reliable approach for package management.

Conan references follow the format: name/version@user/channel
Where user and channel are optional (None represents no user/channel)

App assembly only — configuration lives in `config`, the Conan API lifecycle and
remote helpers in `conan_client`, request/response models in `schemas`, and the
endpoints in the `routers` package.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import conan_client
from routers import meta, packages, cleanup

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage FastAPI lifespan events"""
    # Startup
    logger.info("Starting up - initializing Conan API...")
    conan_client.initialize_conan_api()
    if conan_client.get_optional_api():
        logger.info("Conan API initialized successfully")
    else:
        logger.error("Failed to initialize Conan API")

    yield  # App runs here

    # Shutdown
    logger.info("Shutting down...")
    # Add any cleanup if needed


app = FastAPI(
    title="Conan UI API",
    description="API for browsing Conan packages using Conan API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(meta.router)
app.include_router(packages.router)
app.include_router(cleanup.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.BACKEND_HOST,
        port=config.BACKEND_PORT,
        reload=True,
        log_level="info",
    )
