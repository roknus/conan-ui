import axios from 'axios';
import {
    ConanPackageDetail,
    PackagesListResponse,
    PackageVersionsResponse,
    PackageBinariesResponse,
    CleanupRequest,
    CleanupPlanResponse,
    CleanupExecuteResponse,
    CleanupStreamEvent
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

// Cleanup: compute a deletion plan (non-destructive preview)
export const previewCleanup = async (
    req: CleanupRequest
): Promise<CleanupPlanResponse> => {
    try {
        // Enumerating binaries across a remote can take a while — override the
        // default 10s timeout for cleanup calls.
        const response = await api.post('/cleanup/preview', req, { timeout: 120000 });
        return response.data;
    } catch (error: any) {
        console.error('Cleanup preview error:', error);
        const detail = error?.response?.data?.detail;
        throw new Error(detail || 'Failed to compute cleanup plan');
    }
};

// The explicit removal selection the user fine-tuned via checkboxes.
export interface CleanupSelection {
    delete_recipes: string[];  // recipe-revision refs removed wholesale
    delete_binaries: string[]; // binary keys removed individually
}

// Cleanup: execute a selection. The backend removes exactly these targets.
export const executeCleanup = async (
    req: CleanupRequest,
    selection: CleanupSelection
): Promise<CleanupExecuteResponse> => {
    try {
        const response = await api.post(
            '/cleanup/execute',
            { ...req, ...selection },
            { timeout: 300000 }
        );
        return response.data;
    } catch (error: any) {
        console.error('Cleanup execute error:', error);
        const detail = error?.response?.data?.detail;
        throw new Error(detail || 'Failed to execute cleanup');
    }
};

// POST a JSON body and consume an NDJSON stream, invoking onEvent per line.
// Abort via the optional AbortSignal (throws DOMException 'AbortError').
const streamNdjson = async (
    path: string,
    body: unknown,
    onEvent: (ev: CleanupStreamEvent) => void,
    signal?: AbortSignal
): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok || !response.body) {
        let detail = `HTTP ${response.status}`;
        try {
            const j = await response.json();
            detail = j.detail || detail;
        } catch {
            /* non-JSON error body */
        }
        throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) onEvent(JSON.parse(line));
        }
    }
    const tail = buffer.trim();
    if (tail) onEvent(JSON.parse(tail));
};

// Streaming cleanup preview: emits scan_start / scan_progress / result (or error).
export const streamCleanupPreview = (
    req: CleanupRequest,
    onEvent: (ev: CleanupStreamEvent) => void,
    signal?: AbortSignal
): Promise<void> => streamNdjson('/cleanup/preview/stream', req, onEvent, signal);

// Streaming cleanup execute: scan_* then delete_start / deleted / failed / done.
// Removes exactly the selection the user fine-tuned via checkboxes.
export const streamCleanupExecute = (
    req: CleanupRequest,
    selection: CleanupSelection,
    onEvent: (ev: CleanupStreamEvent) => void,
    signal?: AbortSignal
): Promise<void> =>
    streamNdjson(
        '/cleanup/execute/stream',
        { ...req, ...selection },
        onEvent,
        signal
    );

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
