// Base package info for listing packages
export interface ConanPackageInfo {
    name: string;
    latest_version?: string;
    total_versions: number;
    created?: number;
}

// Package variant (specific user/channel combination)
export interface ConanPackageVariant {
    user?: string;
    channel?: string;
    path: string;
    created?: number;
    size?: number;
}

// Package version with all its variants
export interface ConanPackageVersion {
    version: string;
    variants: ConanPackageVariant[];
    total_variants: number;
}

// Settings-based filters for binaries
export interface ConanSettingsFilters {
    os?: string;
    arch?: string;
    compiler?: string;
    compiler_version?: string;
    build_type?: string;
}

// Combined filters including both original and settings filters
export interface ConanBinaryFilters extends ConanSettingsFilters {
    recipe_revision?: string;
    user?: string;
    channel?: string;
}

// Available filter options extracted from binaries
export interface ConanFilterOptions {
    os: string[];
    arch: string[];
    compiler: string[];
    compiler_version: string[]; // Will be populated based on selected compiler
    build_type: string[];
}

export interface ConanPackageDetail {
    name: string;
    version: string;
    user?: string;
    channel?: string;
    description?: string;
    homepage?: string;
    url?: string;
    license?: string;
    author?: string;
    topics?: string[];
    settings: Record<string, any>;
    options: Record<string, any>;
    requires: string[];
    created?: number;
    path: string;
    package_id?: string;
    recipe_revision?: string;
    package_revision?: string;
}

// Package binary with full metadata including revisions
export interface ConanPackageBinary {
    package_id: string;
    user?: string;
    channel?: string;
    revision?: string;
    recipe_revision?: string;
    settings: Record<string, any>;
    options: Record<string, any>;
    requires: string[];
    created?: number;
    path: string;
}

// Information about available revisions, users, and channels
export interface ConanRevisionInfo {
    recipe_revisions: string[];
    users: string[];
    channels: string[];
    latest_revision?: string;
}

// --- Cleanup ---------------------------------------------------------------

export type CleanupScope = 'version' | 'name';
export type CleanupDeleteMode = 'both' | 'binaries';
export type PrereleaseMode = 'all' | 'only' | 'exclude';

// Filter + rules describing which recipe revisions to clean up on a remote.
export interface CleanupRequest {
    remote_name: string;
    pattern: string;
    package_query?: string;
    older_than_days?: number;
    keep_at_least?: number;
    keep_scope: CleanupScope;
    delete_mode: CleanupDeleteMode;
    prerelease: PrereleaseMode;
}

export interface CleanupBinary {
    key: string;
    package_id: string;
    package_revision?: string;
    created?: number;
    size?: number;
    action: 'keep' | 'delete';
}

export interface CleanupRecipeRevision {
    ref: string;
    revision: string;
    is_prerelease: boolean;
    created?: number;
    action: 'keep' | 'delete';
    reason: string;
    binaries: CleanupBinary[];
    total_size: number;
    delete_size: number;
}

export interface CleanupGroup {
    key: string;
    revisions: CleanupRecipeRevision[];
    to_delete_recipes: number;
    to_delete_binaries: number;
    total_size: number;
    delete_size: number;
}

export interface CleanupSummary {
    total_recipes: number;
    to_delete_recipes: number;
    to_keep_recipes: number;
    total_binaries: number;
    to_delete_binaries: number;
    total_size: number;
    reclaim_size: number;
}

export interface CleanupPlanResponse {
    remote_name: string;
    groups: CleanupGroup[];
    summary: CleanupSummary;
}

export interface CleanupExecuteResponse {
    remote_name: string;
    deleted: string[];
    failed: Array<{ key: string; error: string }>;
    total_deleted: number;
    reclaimed_size: number;
}

// One NDJSON line from the streaming cleanup endpoints.
export interface CleanupStreamEvent {
    event:
        | 'scan_start'
        | 'scan_progress'
        | 'slot'
        | 'slot_ready'
        | 'result'
        | 'delete_start'
        | 'deleted'
        | 'failed'
        | 'done'
        | 'conflict'
        | 'error';
    total?: number;
    done?: number;
    current?: string;
    id?: string;
    label?: string;
    key?: string;
    error?: string;
    detail?: string;
    reclaimed_size?: number;
    reclaim_total?: number;
    total_deleted?: number;
    failed?: Array<{ key: string; error: string }>;
    remote_name?: string;
    groups?: CleanupGroup[];
    summary?: CleanupSummary;
}

// API Response types
export interface PackagesListResponse {
    packages: ConanPackageInfo[];
    total: number;
    page: number;
    per_page: number;
}

export interface PackageVersionsResponse {
    package_name: string;
    versions: ConanPackageVersion[];
    total_versions: number;
}

export interface PackageBinariesResponse {
    package_name: string;
    version: string;
    binaries: ConanPackageBinary[];
    revision_info: ConanRevisionInfo;
    total_binaries: number;
    filtered_by: Record<string, string | null>;
}
