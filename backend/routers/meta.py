"""Service metadata endpoints: root, health, repositories."""

import logging

from fastapi import APIRouter, HTTPException, Depends
from conan.api.conan_api import ConanAPI

import config
from conan_client import get_conan_api, get_optional_api, get_supported_remotes

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def root():
    """Root endpoint - doesn't require Conan API to be available"""
    conan_api = get_optional_api()
    try:
        # Try to get configured remotes if API is available
        configured_remotes = 0
        if conan_api:
            configured_remotes = len([r for r in get_supported_remotes(conan_api) if r["available"]])
    except Exception:
        configured_remotes = 0

    return {
        "message": "Conan UI API",
        "version": "1.0.0",
        "conan_api_available": bool(conan_api),
        "available_remotes": config.AVAILABLE_REMOTES,
        "default_remote": config.DEFAULT_REMOTE,
        "configured_remotes": configured_remotes,
    }


@router.get("/health")
async def health_check(conan_api: ConanAPI = Depends(get_conan_api)):
    """Health check endpoint"""
    try:
        # Test basic API functionality using the injected conan_api
        remotes = conan_api.remotes.list()
        return {
            "status": "healthy",
            "conan_api": "available",
            "remotes": len(remotes),
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@router.get("/repositories")
async def list_repositories(conan_api: ConanAPI = Depends(get_conan_api)):
    """List available Conan remotes"""
    try:
        supported_remotes = get_supported_remotes(conan_api)
        repos = []

        for remote_info in supported_remotes:
            repos.append({
                "name": remote_info["name"],
                "url": remote_info["url"] or "Not configured",
                "available": remote_info["available"],
                "description": f"Conan remote: {remote_info['name']}" + ("" if remote_info["available"] else " (Not configured)"),
                "is_default": remote_info["name"] == config.DEFAULT_REMOTE,
            })

        return {
            "repositories": repos,
            "default": config.DEFAULT_REMOTE,
        }
    except Exception as e:
        logger.error(f"Repositories error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list repositories: {str(e)}")
