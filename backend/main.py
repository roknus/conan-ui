"""
Conan API Backend for Conan UI

This backend uses the Conan API directly to interact with Conan packages,
both from local cache and configured remotes. This provides a clean
and reliable approach for package management.

Conan references follow the format: name/version@user/channel
Where user and channel are optional (None represents no user/channel)
"""

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
import logging
from conan.api.conan_api import ConanAPI
from conan.api.model import ListPattern, RecipeReference, PkgReference, Remote
from conan.errors import ConanException
from conan.internal.errors import NotFoundException

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CONAN_HOME = os.getenv("CONAN_HOME")  # Optional: specify custom Conan home

# Server configuration
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
# Backend always binds to all interfaces in container for nginx proxy access
BACKEND_HOST = "0.0.0.0"

# Custom remote configuration
CUSTOM_REMOTE_NAME = os.getenv("CUSTOM_REMOTE_NAME")
CUSTOM_REMOTE_URL = os.getenv("CUSTOM_REMOTE_URL")
CUSTOM_REMOTE_USER = os.getenv("CUSTOM_REMOTE_USER")
CUSTOM_REMOTE_PASSWORD = os.getenv("CUSTOM_REMOTE_PASSWORD")

# CORS origins configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# Available remotes: custom remote only
AVAILABLE_REMOTES = [CUSTOM_REMOTE_NAME]
DEFAULT_REMOTE = CUSTOM_REMOTE_NAME  # Default to custom remote

# Global Conan API instance
conan_api = None

# Helper functions
def get_remote_by_name(conan_api: ConanAPI, name: str):
    """Get a remote by name"""
    try:
        return conan_api.remotes.get(name)
    except:
        return None

def initialize_conan_api():
    """Initialize Conan API and configure custom remote"""
    global conan_api
    
    try:
        conan_api = ConanAPI(cache_folder=CONAN_HOME)
        logger.info("Conan API initialized successfully")
        
        # Configure custom remote if credentials are provided
        if CUSTOM_REMOTE_URL and CUSTOM_REMOTE_USER and CUSTOM_REMOTE_PASSWORD:
            try:
                
                # Check if remote already exists
                existing_remote = get_remote_by_name(conan_api, CUSTOM_REMOTE_NAME)
                if not existing_remote:
                    # Add the remote - create Remote object first
                    remote = Remote(CUSTOM_REMOTE_NAME, CUSTOM_REMOTE_URL)
                    conan_api.remotes.add(remote)
                    logger.info(f"Added remote '{CUSTOM_REMOTE_NAME}' at {CUSTOM_REMOTE_URL}")
                elif existing_remote.url != CUSTOM_REMOTE_URL:
                    # Update URL if different
                    conan_api.remotes.update(CUSTOM_REMOTE_NAME, url=CUSTOM_REMOTE_URL)
                    logger.info(f"Updated remote '{CUSTOM_REMOTE_NAME}' URL to {CUSTOM_REMOTE_URL}")
                
                # Set authentication - get the remote object for authentication
                remote_for_auth = get_remote_by_name(conan_api, CUSTOM_REMOTE_NAME)
                if remote_for_auth:
                    try:
                        conan_api.remotes.user_login(remote_for_auth, CUSTOM_REMOTE_USER, CUSTOM_REMOTE_PASSWORD)
                        logger.info(f"Configured authentication for remote '{CUSTOM_REMOTE_NAME}'")
                    except AttributeError:
                        # Try alternative authentication method
                        logger.warning(f"Authentication method not available for remote '{CUSTOM_REMOTE_NAME}' - manual configuration may be required")
                    except Exception as auth_error:
                        logger.warning(f"Failed to set authentication for remote '{CUSTOM_REMOTE_NAME}': {auth_error}")
                else:
                    logger.warning(f"Could not retrieve remote '{CUSTOM_REMOTE_NAME}' for authentication")
                
            except Exception as e:
                logger.warning(f"Failed to configure custom remote: {e}")
        else:
            logger.warning("Custom remote credentials not fully configured - some features may not work")
            
    except Exception as e:
        logger.error(f"Failed to initialize Conan API: {e}")
        conan_api = None

# FastAPI dependency to get Conan API instance
def get_conan_api() -> ConanAPI:
    """FastAPI dependency to get the Conan API instance"""
    if conan_api is None:
        raise HTTPException(
            status_code=503, 
            detail="Conan API not available - service starting up"
        )
    return conan_api

# FastAPI lifespan manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage FastAPI lifespan events"""
    global conan_api
    
    # Startup
    logger.info("Starting up - initializing Conan API...")
    initialize_conan_api()
    if conan_api:
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
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ConanPackageVariant(BaseModel):
    """Represents a specific user/channel variant of a package version"""
    user: Optional[str] = None
    channel: Optional[str] = None
    path: str
    created: Optional[float] = None
    size: Optional[int] = None

class ConanPackageBinary(BaseModel):
    """Represents a specific binary package with all metadata"""
    package_id: str
    user: Optional[str] = None
    channel: Optional[str] = None
    revision: Optional[str] = None
    recipe_revision: Optional[str] = None
    settings: Dict[str, Any] = {}
    options: Dict[str, Any] = {}
    requires: List[str] = []
    created: Optional[float] = None
    path: str

class ConanRevisionInfo(BaseModel):
    """Information about available revisions, users, and channels"""
    recipe_revisions: List[str]
    users: List[str]
    channels: List[str]
    latest_revision: Optional[str] = None

class ConanPackageVersion(BaseModel):
    """Represents a version with all its user/channel variants"""
    version: str
    variants: List[ConanPackageVariant]
    total_variants: int

class ConanPackageInfo(BaseModel):
    """Represents a package with basic info"""
    name: str
    latest_version: Optional[str] = None
    total_versions: int
    created: Optional[float] = None

class ConanPackageDetail(BaseModel):
    """Detailed information about a specific package variant"""
    name: str
    version: str
    user: Optional[str] = None
    channel: Optional[str] = None
    description: Optional[str] = None
    homepage: Optional[str] = None
    license: Optional[str] = None
    author: Optional[str] = None
    settings: Dict[str, Any] = {}
    options: Dict[str, Any] = {}
    requires: List[str] = []
    created: Optional[float] = None
    path: str

class PackagesListResponse(BaseModel):
    """Response for listing packages grouped by name"""
    packages: List[ConanPackageInfo]
    total: int
    page: int
    per_page: int

class PackageVersionsResponse(BaseModel):
    """Response for listing versions of a specific package"""
    package_name: str
    versions: List[ConanPackageVersion]
    total_versions: int

class PackageBinariesResponse(BaseModel):
    """Response for listing package binaries with filtering options"""
    package_name: str
    version: str
    binaries: List[ConanPackageBinary]
    revision_info: ConanRevisionInfo
    total_binaries: int
    filtered_by: Dict[str, Optional[str]]

class PackageFilterOptionsResponse(BaseModel):
    """Response for available filter options for a package version"""
    package_name: str
    version: str
    filter_options: Dict[str, List[str]]
    compiler_versions: Dict[str, List[str]]  # compiler -> list of versions

# Helper functions
def recipe_to_dict(ref: RecipeReference) -> Dict[str, str]:
    """Convert a RecipeReference to a dictionary"""
    return {
        "name": ref.name,
        "version": ref.version,
        "user": ref.user,
        "channel": ref.channel,
        "revision": ref.revision
    }

def package_to_dict(pref: PkgReference, config: Dict = None) -> Dict[str, Any]:
    """Convert a PkgReference to a dictionary"""
    result = {
        "package_id": pref.package_id,
        "revision": pref.revision,
        "ref": recipe_to_dict(pref.ref)
    }
    if config:
        result.update({
            "settings": config.get("settings", {}),
            "options": config.get("options", {}),
            "requires": config.get("requires", [])
        })
    return result

def validate_remote_name(conan_api: ConanAPI, remote_name: str) -> str:
    """Validate and return a supported remote name"""
    if not remote_name:
        raise HTTPException(status_code=400, detail="Remote name is required")
    
    if remote_name not in AVAILABLE_REMOTES:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported remote '{remote_name}'. Available remotes: {', '.join(AVAILABLE_REMOTES)}"
        )
    
    remote = get_remote_by_name(conan_api, remote_name)
    if not remote:
        raise HTTPException(status_code=404, detail=f"Remote '{remote_name}' not found in Conan configuration")
    
    return remote_name

def get_all_remotes(conan_api: ConanAPI):
    """Get all configured remotes"""
    try:
        return conan_api.remotes.list()
    except:
        return []

def get_supported_remotes(conan_api: ConanAPI):
    """Get list of supported remotes with their configuration"""
    remotes = []
    for remote_name in AVAILABLE_REMOTES:
        remote = get_remote_by_name(conan_api, remote_name)
        if remote:
            remotes.append({
                "name": remote.name,
                "url": remote.url,
                "available": True
            })
        else:
            remotes.append({
                "name": remote_name,
                "url": None,
                "available": False
            })
    return remotes

# API endpoints
@app.get("/")
async def root():
    """Root endpoint - doesn't require Conan API to be available"""
    try:
        # Try to get configured remotes if API is available
        configured_remotes = 0
        if conan_api:
            configured_remotes = len([r for r in get_supported_remotes(conan_api) if r["available"]])
    except:
        configured_remotes = 0
        
    return {
        "message": "Conan UI API", 
        "version": "1.0.0",
        "conan_api_available": bool(conan_api),
        "available_remotes": AVAILABLE_REMOTES,
        "default_remote": DEFAULT_REMOTE,
        "configured_remotes": configured_remotes
    }

@app.get("/health")
async def health_check(conan_api: ConanAPI = Depends(get_conan_api)):
    """Health check endpoint"""
    try:
        # Test basic API functionality using the injected conan_api
        remotes = conan_api.remotes.list()
        return {
            "status": "healthy", 
            "conan_api": "available",
            "remotes": len(remotes)
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.get("/repositories")
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
                "is_default": remote_info["name"] == DEFAULT_REMOTE
            })
        
        return {
            "repositories": repos,
            "default": DEFAULT_REMOTE
        }
    except Exception as e:
        logger.error(f"Repositories error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list repositories: {str(e)}")
    
@app.get("/packages", response_model=PackagesListResponse)
async def list_packages(
    remote_name: str = Query(..., description="Remote name to search"),
    q: str = Query("", description="Search query for package names"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """List Conan packages grouped by name
    
    Uses Conan API to search for packages in the specified remote.
    """
    
    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)
        
        # Create search pattern - use * to get all packages, or add query filter
        search_pattern = f"*{q}*:*" if q else "*:*"
        pattern = ListPattern(search_pattern, rrev=None, prev=None)
          # Get package list using Conan API
        package_list = conan_api.list.select(pattern, remote=remote)
        
        # Group packages by name and collect metadata
        packages_dict = {}
        for ref, recipe_bundle in package_list.refs().items():
            #ref = RecipeReference.loads(ref_str)
            name = ref.name
            
            if name not in packages_dict:
                # Count versions for this package
                version_count = len([r_version for r_version, _ in package_list.refs().items() 
                                   if r_version.name == name])
                
                packages_dict[name] = ConanPackageInfo(
                    name=name,
                    latest_version=str(ref.version),  # This will be the most recent one found
                    total_versions=version_count,
                    created=ref.timestamp
                )
            else:
                # Update with potentially newer version
                existing = packages_dict[name]
                if ref.version > existing.latest_version:
                    existing.latest_version = ref.version
        
        # Apply search filter if specified
        if q:
            packages_dict = {name: pkg for name, pkg in packages_dict.items() 
                           if q.lower() in name.lower()}
        
        # Convert to list and sort
        packages_list = list(packages_dict.values())
        packages_list.sort(key=lambda p: p.name.lower())
        
        # Paginate results
        total = len(packages_list)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_packages = packages_list[start_idx:end_idx]
        
        return PackagesListResponse(
            packages=paginated_packages,
            total=total,
            page=page,
            per_page=per_page
        )
        
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"List packages error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list packages: {str(e)}")

@app.get("/packages/{package_name}", response_model=PackageVersionsResponse)
async def get_package_versions(
    package_name: str, 
    remote_name: str = Query(..., description="Remote name"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Get all versions of a specific package with their user/channel variants"""
    
    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)
        
        # Create search pattern for this specific package
        pattern = ListPattern(f"{package_name}/*:*", rrev=None, prev=None)
          # Get package list using Conan API
        package_list = conan_api.list.select(pattern, remote=remote)
        
        # Group by version, then collect variants
        versions_dict = {}
        for ref, recipe_bundle in package_list.refs().items():
            #ref = RecipeReference.loads(ref_str)
            if ref.name == package_name:
                version = ref.version
                
                if version not in versions_dict:
                    versions_dict[version] = []
                
                # Get package variants (binaries) for this reference
                packages_info = package_list.prefs(ref, recipe_bundle)
                for pref, pref_bundle in packages_info.items():
                    variant = ConanPackageVariant(
                        user=ref.user,
                        channel=ref.channel,
                        path=str(ref),
                        created=ref.timestamp,
                        size=None  # Size not easily available through Conan API
                    )
                    versions_dict[version].append(variant)
                
                # If no packages, create a variant for the recipe itself
                if not packages_info:
                    variant = ConanPackageVariant(
                        user=ref.user,
                        channel=ref.channel,
                        path=str(ref),
                        created=ref.timestamp,
                        size=None
                    )
                    versions_dict[version].append(variant)
        
        # Convert to response format
        versions_list = []
        for version, variants in versions_dict.items():
            versions_list.append(ConanPackageVersion(
                version=str(version),
                variants=variants,
                total_variants=len(variants)
            ))
        
        # Sort versions (simple string sort, could be improved with proper version sorting)
        versions_list.sort(key=lambda v: v.version, reverse=True)
        
        return PackageVersionsResponse(
            package_name=package_name,
            versions=versions_list,
            total_versions=len(versions_list)
        )
        
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Package versions error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get package versions: {str(e)}")

@app.get("/packages/{package_name}/{version}/configuration", response_model=ConanPackageDetail)
async def get_package_configuration(
    package_name: str, 
    version: str, 
    remote_name: str = Query(..., description="Remote name"),
    user: Optional[str] = Query(None, description="User name"),
    channel: Optional[str] = Query(None, description="Channel name"),
    package_id: Optional[str] = Query(None, description="Package ID for specific binary"),
    recipe_revision: Optional[str] = Query(None, description="Recipe revision"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Get configuration information about a specific package version variant or binary"""
    
    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)
        
        # Create reference
        ref = RecipeReference(package_name, version, user, channel)
        
        # If recipe_revision is provided, use it; otherwise get latest
        if recipe_revision:
            ref = RecipeReference(package_name, version, user, channel, recipe_revision)
        else:
            # Try to get latest revision if not specified
            try:
                ref_with_rev = conan_api.list.latest_recipe_revision(ref, remote=remote)
                if not ref_with_rev:
                    raise NotFoundException(f"Package {ref} not found")
                ref = ref_with_rev
            except NotFoundException:
                raise HTTPException(status_code=404, detail=f"Package {ref} not found")      
            
        # Build detail response
        detail = ConanPackageDetail(
            name=package_name,
            version=version,
            user=user,
            channel=channel,
            path=str(ref)
        )
        
        # This endpoint is only for actual binary packages with package IDs
        if not package_id:
            raise HTTPException(status_code=400, detail="package_id parameter is required for package configuration")
        
        # Get all package configurations for this recipe
        try:
            pkg_configs = conan_api.list.packages_configurations(ref, remote=remote)
              # Find the configuration for our specific package_id
            target_pref = None
            target_config = None
            
            for pref, config in pkg_configs.items():
                if pref.package_id == package_id:
                    target_pref = pref
                    target_config = config
                    break
            
            if target_config:
                detail.settings = target_config.get("settings", {})
                detail.options = target_config.get("options", {})
                detail.requires = target_config.get("requires", [])
                detail.created = pref.timestamp

                if target_pref:
                    detail.path = str(target_pref)
            else:
                raise HTTPException(status_code=404, detail=f"Package binary with ID '{package_id}' not found")
                
        except HTTPException:
            raise  # Re-raise HTTP exceptions
        except Exception as e:
            logger.warning(f"Could not get package configurations for {ref}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get package configuration: {str(e)}")
        
        return detail
        
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Package configuration error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get package configuration: {str(e)}")

@app.get("/packages/{package_name}/{version}/filter-options", response_model=PackageFilterOptionsResponse)
async def get_package_filter_options(
    package_name: str, 
    version: str,
    remote_name: str = Query(..., description="Remote name"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Get all available filter options for a package version (unfiltered)"""
    
    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)
        
        # Create search pattern to get ALL binaries for this package version
        base_pattern = f"{package_name}/{version}@*:*#*"
        pattern = ListPattern(base_pattern, rrev=None, prev=None)
        
        # Get all matching references
        package_list = conan_api.list.select(pattern, remote=remote)
        # Extract all available filter options
        os_set = set()
        arch_set = set()
        compiler_set = set()
        build_type_set = set()
        compiler_versions_map = {}
        
        for ref, recipe_bundle in package_list.refs().items():
            if ref.name == package_name and ref.version == version:
                # Get package configurations for this recipe to get settings
                try:
                    pkg_configs = conan_api.list.packages_configurations(ref, remote=remote)
                    
                    for config_pref, config in pkg_configs.items():
                        settings = config.get("settings", {})
                        
                        if settings.get("os"):
                            os_set.add(settings["os"])
                        if settings.get("arch"):
                            arch_set.add(settings["arch"])
                        if settings.get("compiler"):
                            compiler = settings["compiler"]
                            compiler_set.add(compiler)
                            
                            # Track compiler versions
                            if settings.get("compiler.version"):
                                if compiler not in compiler_versions_map:
                                    compiler_versions_map[compiler] = set()
                                compiler_versions_map[compiler].add(settings["compiler.version"])
                        if settings.get("build_type"):
                            build_type_set.add(settings["build_type"])
                            
                except Exception as e:
                    logger.warning(f"Could not get package configurations for {ref}: {e}")
                    continue
        
        # Convert sets to sorted lists
        filter_options = {
            "os": sorted(list(os_set)),
            "arch": sorted(list(arch_set)),
            "compiler": sorted(list(compiler_set)),
            "build_type": sorted(list(build_type_set))
        }
        
        # Convert compiler versions to sorted lists
        compiler_versions = {}
        for compiler, versions in compiler_versions_map.items():
            compiler_versions[compiler] = sorted(list(versions))
        
        return PackageFilterOptionsResponse(
            package_name=package_name,
            version=version,
            filter_options=filter_options,
            compiler_versions=compiler_versions
        )
        
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Filter options error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get filter options: {str(e)}")

@app.get("/packages/{package_name}/{version}/binaries", response_model=PackageBinariesResponse)
async def get_package_binaries(
    package_name: str, 
    version: str,
    remote_name: str = Query(..., description="Remote name"),
    recipe_revision: Optional[str] = Query(None, description="Recipe revision (latest if not specified)"),
    user: Optional[str] = Query(None, description="User filter (all if not specified)"),
    channel: Optional[str] = Query(None, description="Channel filter (all if not specified)"),
    os: Optional[str] = Query(None, description="Operating system filter"),
    arch: Optional[str] = Query(None, description="Architecture filter"),
    compiler: Optional[str] = Query(None, description="Compiler filter"),
    compiler_version: Optional[str] = Query(None, description="Compiler version filter"),
    build_type: Optional[str] = Query(None, description="Build type filter"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Get all package binaries for a specific package version with filtering options"""
    
    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)
        
        # Create search pattern - search broadly first to get all revisions/users/channels
        base_pattern = f"{package_name}/{version}@*:*#*"
        pattern = ListPattern(base_pattern, rrev=None, prev=None)
        
        # Get all matching references
        package_list = conan_api.list.select(pattern, remote=remote)
          # Collect all available revisions, users, and channels
        all_revisions = set()
        all_users = set()
        all_channels = set()
        all_refs = []
        
        for ref, recipe_bundle in package_list.refs().items():
            if ref.name == package_name and ref.version == version:
                all_refs.append((ref, recipe_bundle))
                if ref.revision:
                    all_revisions.add(ref.revision)
                if ref.user:
                    all_users.add(ref.user)
                if ref.channel:
                    all_channels.add(ref.channel)
        
        if not all_refs:
            return PackageBinariesResponse(
                package_name=package_name,
                version=version,
                binaries=[],
                revision_info=ConanRevisionInfo(
                    recipe_revisions=[],
                    users=[],
                    channels=[],
                    latest_revision=None
                ),
                total_binaries=0,
                filtered_by={
                    "recipe_revision": recipe_revision,
                    "user": user,
                    "channel": channel,
                    "os": os,
                    "arch": arch,
                    "compiler": compiler,
                    "compiler_version": compiler_version,
                    "build_type": build_type
                }
            )
        
        # Sort revisions to find latest (simple string sort for now)
        sorted_revisions = sorted(all_revisions, reverse=True)
        latest_revision = sorted_revisions[0] if sorted_revisions else None
        
        # Use latest revision if not specified
        target_revision = recipe_revision or latest_revision
        
        # Filter references based on criteria
        filtered_refs = []
        for ref, recipe_bundle in all_refs:
            # Filter by revision
            if target_revision and ref.revision != target_revision:
                continue
            # Filter by user
            if user is not None and ref.user != user:
                continue
            # Filter by channel  
            if channel is not None and ref.channel != channel:
                continue
            filtered_refs.append((ref, recipe_bundle))          # Get package binaries for filtered references
        binaries = []
        for ref, recipe_bundle in filtered_refs:
            # Get package binaries for this reference
            packages_info = package_list.prefs(ref, recipe_bundle)
            
            # Get package configurations for this recipe to get settings/options
            try:
                pkg_configs = conan_api.list.packages_configurations(ref, remote=remote)
            except Exception as e:
                logger.warning(f"Could not get package configurations for {ref}: {e}")
                pkg_configs = {}

            if packages_info:
                # We have actual binary packages
                for pref, pref_bundle in packages_info.items():
                    # Find the configuration for this specific package
                    pkg_config = {}
                    for config_pref, config in pkg_configs.items():
                        if config_pref.package_id == pref.package_id:
                            pkg_config = config
                            break
                    
                    # Get settings for filtering
                    settings = pkg_config.get("settings", {})
                    
                    # Apply settings filters
                    if os and settings.get("os") != os:
                        continue
                    if arch and settings.get("arch") != arch:
                        continue
                    if compiler and settings.get("compiler") != compiler:
                        continue
                    if compiler_version and settings.get("compiler.version") != compiler_version:
                        continue
                    if build_type and settings.get("build_type") != build_type:
                        continue
                    
                    binary = ConanPackageBinary(
                        package_id=pref.package_id,
                        user=ref.user,
                        channel=ref.channel,
                        revision=pref.revision,
                        recipe_revision=ref.revision,
                        settings=settings,
                        options=pkg_config.get("options", {}),
                        requires=pkg_config.get("requires", []),
                        created=ref.timestamp,
                        path=str(pref)
                    )
                    binaries.append(binary)
            else:
                # No binary packages, create entry for recipe only
                binary = ConanPackageBinary(
                    package_id="recipe-only",
                    user=ref.user,
                    channel=ref.channel,
                    revision=None,
                    recipe_revision=ref.revision,
                    settings={},
                    options={},
                    requires=[],
                    created=ref.timestamp,
                    path=str(ref)
                )
                binaries.append(binary)
          # Create revision info
        revision_info = ConanRevisionInfo(
            recipe_revisions=sorted(all_revisions, reverse=True),
            users=sorted(all_users),
            channels=sorted(all_channels),
            latest_revision=latest_revision
        )
        
        return PackageBinariesResponse(
            package_name=package_name,
            version=version,
            binaries=binaries,
            revision_info=revision_info,
            total_binaries=len(binaries),
            filtered_by={
                "recipe_revision": target_revision,
                "user": user,
                "channel": channel,
                "os": os,
                "arch": arch,
                "compiler": compiler,
                "compiler_version": compiler_version,
                "build_type": build_type
            }
        )
        
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Package binaries error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get package binaries: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
        log_level="info"
    )
