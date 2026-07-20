"""Package browsing endpoints: list, versions, configuration, binaries."""

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from conan.api.conan_api import ConanAPI
from conan.api.model import ListPattern, RecipeReference
from conan.errors import ConanException
from conan.internal.errors import NotFoundException

from conan_client import (
    get_conan_api,
    get_remote_by_name,
    validate_remote_name,
    search_recipes,
    get_package_configurations,
)
from schemas import (
    ConanPackageVariant,
    ConanPackageBinary,
    ConanRevisionInfo,
    ConanPackageVersion,
    ConanPackageInfo,
    ConanPackageDetail,
    PackagesListResponse,
    PackageVersionsResponse,
    PackageBinariesResponse,
    PackageFilterOptionsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_recipe_metadata(conan_api: ConanAPI, ref: RecipeReference, remote) -> dict:
    """Read recipe-level attributes (description, license, homepage, ...) from a recipe.

    These attributes live in the recipe's conanfile.py, not in the package
    configuration data, so they must be read by downloading the recipe into the
    local cache and inspecting it. The download is cached, so only the first view
    of a given recipe revision pays the network cost. Best-effort: any failure
    returns an empty dict rather than breaking the configuration response.
    """
    try:
        conan_api.download.recipe(ref, remote=remote)
        conanfile_path = os.path.join(conan_api.cache.export_path(ref), "conanfile.py")
        conanfile = conan_api.local.inspect(conanfile_path, remotes=[remote], lockfile=None)

        def _as_str(value):
            if value is None:
                return None
            if isinstance(value, (list, tuple)):
                return ", ".join(str(v) for v in value)
            return str(value)

        topics = getattr(conanfile, "topics", None)
        if isinstance(topics, str):
            topics = [topics]
        elif isinstance(topics, (list, tuple)):
            topics = [str(t) for t in topics]
        else:
            topics = []

        return {
            "description": _as_str(getattr(conanfile, "description", None)),
            "license": _as_str(getattr(conanfile, "license", None)),
            "author": _as_str(getattr(conanfile, "author", None)),
            "homepage": _as_str(getattr(conanfile, "homepage", None)),
            "url": _as_str(getattr(conanfile, "url", None)),
            "topics": topics,
        }
    except Exception as e:
        logger.warning(f"Could not load recipe metadata for {ref}: {e}")
        return {}


@router.get("/packages", response_model=PackagesListResponse)
async def list_packages(
    remote_name: str = Query(..., description="Remote name to search"),
    q: str = Query("", description="Search query for package names"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=1000, description="Items per page"),
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """List Conan packages grouped by name

    Uses Conan API to search for packages in the specified remote.
    """

    try:
        # Validate and get remote
        validate_remote_name(conan_api, remote_name)
        remote = get_remote_by_name(conan_api, remote_name)

        # The list view only needs recipe name/version metadata. Use a single
        # recipe search instead of list.select("*:*"), which enumerates every
        # binary (latest revision + package configurations, ~2 requests PER recipe)
        # and times out on remotes with many packages. Binary details are fetched
        # lazily per-package by the detail endpoints below.
        # NOTE: search_recipes returns references without revisions, so it can't be
        # read back via PackagesList.items() (that only yields refs with revisions).
        search_query = f"*{q}*" if q else "*"
        refs = search_recipes(conan_api, search_query, remote=remote)

        # Group recipe references by name in one pass, tracking newest version + count.
        packages_dict = {}
        latest_version_obj = {}
        for ref in refs:
            name = ref.name

            if name not in packages_dict:
                packages_dict[name] = ConanPackageInfo(
                    name=name,
                    latest_version=str(ref.version),
                    total_versions=1,
                    created=ref.timestamp,
                )
                latest_version_obj[name] = ref.version
            else:
                info = packages_dict[name]
                info.total_versions += 1
                # Compare Version objects (not strings) to find the newest.
                if ref.version > latest_version_obj[name]:
                    latest_version_obj[name] = ref.version
                    info.latest_version = str(ref.version)
                    info.created = ref.timestamp

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


@router.get("/packages/{package_name}", response_model=PackageVersionsResponse)
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
        for ref, packages_info in package_list.items():
            if ref.name == package_name:
                version = ref.version

                if version not in versions_dict:
                    versions_dict[version] = []

                # Get package variants (binaries) for this reference
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


@router.get("/packages/{package_name}/{version}/configuration", response_model=ConanPackageDetail)
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
            path=str(ref),
            package_id=package_id,
            recipe_revision=ref.revision,
        )

        # Recipe-level metadata (description, license, homepage, ...) lives in the
        # conanfile, not the package config, so read it separately (best-effort).
        for field, value in _load_recipe_metadata(conan_api, ref, remote).items():
            setattr(detail, field, value)

        # This endpoint is only for actual binary packages with package IDs
        if not package_id:
            raise HTTPException(status_code=400, detail="package_id parameter is required for package configuration")

        # Get all package configurations for this recipe
        try:
            pkg_configs = get_package_configurations(conan_api, ref, remote=remote)
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

                # get_package_configurations() yields prefs with no package revision or
                # timestamp, so pref.timestamp is always None here (Created shows
                # "Unknown"). Resolve the latest package revision to get the binary's
                # actual creation/upload time.
                try:
                    latest_pref = conan_api.list.latest_package_revision(target_pref, remote=remote)
                    if latest_pref:
                        detail.created = latest_pref.timestamp
                        detail.package_revision = latest_pref.revision
                except Exception as e:
                    logger.warning(f"Could not resolve package revision timestamp for {target_pref}: {e}")

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


@router.get("/packages/{package_name}/{version}/filter-options", response_model=PackageFilterOptionsResponse)
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

        for ref, _packages_info in package_list.items():
            if ref.name == package_name and ref.version == version:
                # Get package configurations for this recipe to get settings
                try:
                    pkg_configs = get_package_configurations(conan_api, ref, remote=remote)

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


@router.get("/packages/{package_name}/{version}/binaries", response_model=PackageBinariesResponse)
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

        for ref, packages_info in package_list.items():
            if ref.name == package_name and ref.version == version:
                all_refs.append((ref, packages_info))
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
        for ref, packages_info in all_refs:
            # Filter by revision
            if target_revision and ref.revision != target_revision:
                continue
            # Filter by user
            if user is not None and ref.user != user:
                continue
            # Filter by channel
            if channel is not None and ref.channel != channel:
                continue
            filtered_refs.append((ref, packages_info))
        # Get package binaries for filtered references
        binaries = []
        for ref, packages_info in filtered_refs:
            # Get package configurations for this recipe to get settings/options
            try:
                pkg_configs = get_package_configurations(conan_api, ref, remote=remote)
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
                        created=pref.timestamp,
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
