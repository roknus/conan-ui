"""Pydantic request/response models for the Conan UI API."""

from typing import List, Optional, Dict, Any

from pydantic import BaseModel


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
    url: Optional[str] = None
    license: Optional[str] = None
    author: Optional[str] = None
    topics: List[str] = []
    settings: Dict[str, Any] = {}
    options: Dict[str, Any] = {}
    requires: List[str] = []
    created: Optional[float] = None
    path: str
    # Identity / provenance of the resolved binary
    package_id: Optional[str] = None
    recipe_revision: Optional[str] = None
    package_revision: Optional[str] = None


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


# --- Cleanup models -----------------------------------------------------------
# The cleanup feature operates on a remote at the level of the *recipe revision*
# (name/version@user/channel#rrev) — the unit the search UI works with. Each
# recipe revision holds N package binaries (one per configuration/profile).
# Conan's native `--lru` filter is cache-only (see remove.py: "'--lru' cannot be
# used in remotes, only in cache"), so on remotes we approximate LRU by ordering
# recipe revisions by their upload/creation time (rref.timestamp) — newest first.

# How "keep at least X" groups recipe revisions before counting the newest X to keep.
CleanupScope = str  # one of: "version", "name"

# What a deletion removes: whole recipe revisions ("both", cascades to binaries)
# or only the package binaries, leaving the recipe metadata ("binaries").
CleanupDeleteMode = str  # one of: "both", "binaries"


class CleanupRequest(BaseModel):
    """Filter + rules describing which recipe revisions to clean up on a remote."""
    remote_name: str
    # Reference filter, e.g. "*", "zlib/*", "zlib/1.3@user/channel". ":*" is
    # appended automatically so it always matches package binaries.
    pattern: str = "*"
    # Conan package query on settings/options, e.g. "os=Windows AND compiler=gcc".
    package_query: Optional[str] = None
    # LRU proxy: only recipe revisions older than this many days are eligible.
    older_than_days: Optional[int] = None
    # Safety floor: always keep the newest X recipe revisions within each group.
    keep_at_least: Optional[int] = None
    # Grouping the keep-floor is counted within.
    keep_scope: CleanupScope = "name"
    # Whether a deletion removes the whole recipe revision or only its binaries.
    delete_mode: CleanupDeleteMode = "both"
    # Version prerelease filter: "all", "only" (prereleases), "exclude" (stable only).
    prerelease: str = "all"


class CleanupExecuteRequest(CleanupRequest):
    """Execute request carries the previewed delete count as a concurrency guard.

    The count is mode-dependent: number of recipe revisions removed in "both"
    mode, number of binaries removed in "binaries" mode.
    """
    expected_delete_count: int


class CleanupBinary(BaseModel):
    """A single package binary within a recipe revision."""
    key: str                      # pref.repr_notime() — stable unique id
    package_id: str
    package_revision: Optional[str] = None
    created: Optional[float] = None
    size: Optional[int] = None    # on-disk bytes (None if unknown)
    action: str                   # "keep" | "delete"


class CleanupRecipeRevision(BaseModel):
    """A recipe revision with its binaries and computed action."""
    ref: str                      # name/version@user/channel#rrev
    revision: str
    is_prerelease: bool = False   # version carries a prerelease component
    created: Optional[float] = None
    action: str                   # "keep" | "delete"
    reason: str                   # why it was kept/deleted
    binaries: List[CleanupBinary]
    total_size: int = 0           # bytes across all binaries in this revision
    delete_size: int = 0          # bytes reclaimed if this revision is deleted


class CleanupGroup(BaseModel):
    """Recipe revisions grouped by the keep-scope, newest first."""
    key: str
    revisions: List[CleanupRecipeRevision]
    to_delete_recipes: int        # recipe revisions flagged for deletion
    to_delete_binaries: int       # binaries under those revisions
    total_size: int = 0           # bytes across all binaries in the group
    delete_size: int = 0          # bytes that would be reclaimed in this group


class CleanupSummary(BaseModel):
    total_recipes: int
    to_delete_recipes: int
    to_keep_recipes: int
    total_binaries: int
    to_delete_binaries: int
    total_size: int = 0           # bytes across all matched binaries
    reclaim_size: int = 0         # bytes reclaimed by the deletions


class CleanupPlanResponse(BaseModel):
    """Non-destructive preview of what a cleanup would remove."""
    remote_name: str
    groups: List[CleanupGroup]
    summary: CleanupSummary


class CleanupExecuteResponse(BaseModel):
    """Result of actually deleting the planned binaries."""
    remote_name: str
    deleted: List[str]            # keys successfully removed
    failed: List[Dict[str, str]]  # [{key, error}]
    total_deleted: int
    reclaimed_size: int = 0       # bytes reclaimed by successful deletions
