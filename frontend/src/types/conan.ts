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
    license?: string;
    author?: string;
    settings: Record<string, any>;
    options: Record<string, any>;
    requires: string[];
    created?: number;
    path: string;
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
