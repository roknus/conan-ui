import axios from 'axios';
import {
    ConanPackageDetail,
    PackagesListResponse,
    PackageVersionsResponse,
    PackageBinariesResponse
} from '../types/conan';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Debug logging to verify which API URL is being used
console.log('API_BASE_URL:', API_BASE_URL);

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
});

// Get list of available repositories/remotes
export const getRepositories = async (): Promise<{
    repositories: Array<{
        name: string;
        url: string;
        available: boolean;
        description: string;
        is_default?: boolean;
    }>;
    default: string;
}> => {
    try {
        const response = await api.get('/repositories');
        return response.data;
    } catch (error) {
        console.error('Get repositories error:', error);
        throw new Error('Failed to load repositories');
    }
};

// List packages grouped by name
export const listPackages = async (
    remoteName: string,
    query: string = '',
    page: number = 1,
    per_page: number = 20
): Promise<PackagesListResponse> => {
    try {
        const response = await api.get('/packages', {
            params: { remote_name: remoteName, q: query, page, per_page }
        });
        return response.data;
    } catch (error) {
        console.error('List packages error:', error);
        throw new Error('Failed to list packages. Check your backend connection.');
    }
};

// Get all versions of a specific package
export const getPackageVersions = async (
    remoteName: string,
    packageName: string
): Promise<PackageVersionsResponse> => {
    try {
        const response = await api.get(`/packages/${packageName}`, {
            params: { remote_name: remoteName }
        });
        return response.data;
    } catch (error) {
        console.error('Get package versions error:', error);
        throw new Error('Failed to load package versions');
    }
};

// Get package binaries with filtering options
export const getPackageBinaries = async (
    remoteName: string,
    packageName: string,
    version: string,
    recipeRevision?: string,
    user?: string,
    channel?: string,
    os?: string,
    arch?: string,
    compiler?: string,
    compilerVersion?: string,
    buildType?: string
): Promise<PackageBinariesResponse> => {
    try {
        const params: any = { remote_name: remoteName };
        if (recipeRevision) params.recipe_revision = recipeRevision;
        if (user) params.user = user;
        if (channel) params.channel = channel;
        if (os) params.os = os;
        if (arch) params.arch = arch;
        if (compiler) params.compiler = compiler;
        if (compilerVersion) params.compiler_version = compilerVersion;
        if (buildType) params.build_type = buildType;

        const response = await api.get(`/packages/${packageName}/${version}/binaries`, { params });
        return response.data;
    } catch (error) {
        console.error('Get package binaries error:', error);
        throw new Error('Failed to load package binaries');
    }
};

// Get all available filter options for a package version (unfiltered)
export const getPackageFilterOptions = async (
    remoteName: string,
    packageName: string,
    version: string
): Promise<{
    package_name: string;
    version: string;
    filter_options: {
        os: string[];
        arch: string[];
        compiler: string[];
        build_type: string[];
    };
    compiler_versions: Record<string, string[]>;
}> => {
    try {
        const response = await api.get(`/packages/${packageName}/${version}/filter-options`, {
            params: { remote_name: remoteName }
        });
        return response.data;
    } catch (error) {
        console.error('Get package filter options error:', error);
        throw new Error('Failed to load package filter options');
    }
};

// Get detailed configuration information about a specific package variant
export const getPackageConfiguration = async (
    remoteName: string,
    name: string,
    version: string,
    user?: string,
    channel?: string,
    packageId?: string,
    recipeRevision?: string
): Promise<ConanPackageDetail> => {
    try {
        const params: any = { remote_name: remoteName };
        if (user) params.user = user;
        if (channel) params.channel = channel;
        if (packageId) params.package_id = packageId;
        if (recipeRevision) params.recipe_revision = recipeRevision;

        const response = await api.get(`/packages/${name}/${version}/configuration`, { params });
        return response.data;
    } catch (error) {
        console.error('Get package configuration error:', error);
        throw new Error('Failed to load package configuration');
    }
};

export const checkHealth = async () => {
    try {
        const response = await api.get('/health');
        return response.data;
    } catch (error) {
        console.error('Health check error:', error);
        throw new Error('Backend is not available');
    }
};

export const checkConfiguration = async () => {
    try {
        const response = await api.get('/');
        return response.data;
    } catch (error) {
        console.error('Configuration check error:', error);
        throw new Error('Failed to check configuration');
    }
};
