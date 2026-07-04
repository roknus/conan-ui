import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PackageBinaries from '../components/PackageBinaries';
import { ConanPackageBinary, ConanRevisionInfo, ConanBinaryFilters } from '../types/conan';
import { getPackageBinaries, getPackageVersions } from '../services/api';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

const PackageBinariesPage: React.FC = () => {
    const { remote: remoteName } = useRemote();
    const { packageName } = useParams<{ packageName: string }>();
    const [binaries, setBinaries] = useState<ConanPackageBinary[]>([]);
    const [revisionInfo, setRevisionInfo] = useState<ConanRevisionInfo | null>(null);
    const [binaryFilters, setBinaryFilters] = useState<ConanBinaryFilters>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Filter values, version + active tab are all derived from the URL
    const revision = searchParams.get('revision') || '';
    const user = searchParams.get('user') || '';
    const channel = searchParams.get('channel') || '';
    const os = searchParams.get('os') || undefined;
    const arch = searchParams.get('arch') || undefined;
    const compiler = searchParams.get('compiler') || undefined;
    const compilerVersion = searchParams.get('compiler_version') || undefined;
    const buildType = searchParams.get('build_type') || undefined;
    const version = searchParams.get('version') || '';
    const activeTab: 'binaries' | 'versions' = searchParams.get('tab') === 'versions' ? 'versions' : 'binaries';

    // Bare pathname for this package. Repo is carried in the query string
    // (?repo=), so it must not be baked into the pathname here.
    const packagePathname = `/${encodeURIComponent(packageName!)}`;

    const handleTabChange = (nextTab: 'binaries' | 'versions') => {
        if (!remoteName) return;
        const params = new URLSearchParams(searchParams);
        if (nextTab === 'versions') {
            params.set('tab', 'versions');
        } else {
            params.delete('tab');
        }
        navigate({ pathname: packagePathname, search: params.toString() });
    };

    const handleBinaryFiltersChange = async (filters: ConanBinaryFilters) => {
        if (!remoteName) return;

        setLoading(true);
        setError(null);
        setBinaryFilters(filters);

        // Update URL with filter parameters (keep the remote + selected version)
        const params = new URLSearchParams();
        if (remoteName) params.set('repo', remoteName);
        if (version) params.set('version', version);
        if (filters.recipe_revision) params.set('revision', filters.recipe_revision);
        if (filters.user) params.set('user', filters.user);
        if (filters.channel) params.set('channel', filters.channel);
        if (filters.os) params.set('os', filters.os);
        if (filters.arch) params.set('arch', filters.arch);
        if (filters.compiler) params.set('compiler', filters.compiler);
        if (filters.compiler_version) params.set('compiler_version', filters.compiler_version);
        if (filters.build_type) params.set('build_type', filters.build_type);

        navigate({ pathname: packagePathname, search: params.toString() });

        try {
            const result = await getPackageBinaries(
                remoteName,
                packageName!,
                version,
                filters.recipe_revision || '',
                filters.user || '',
                filters.channel || '',
                filters.os,
                filters.arch,
                filters.compiler,
                filters.compiler_version,
                filters.build_type
            );
            setBinaries(result.binaries);
            setRevisionInfo(result.revision_info);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply filters');
        } finally {
            setLoading(false);
        }
    };

    const handleBinarySelect = (binary: ConanPackageBinary) => {
        if (!remoteName) return;

        // Prevent navigation for recipe-only items
        if (binary.package_id === 'recipe-only') return;

        const params = new URLSearchParams();
        if (remoteName) params.set('repo', remoteName);
        if (version) params.set('version', version);
        if (binary.user) params.set('user', binary.user);
        if (binary.channel) params.set('channel', binary.channel);
        if (binary.package_id) params.set('package_id', binary.package_id);
        if (binary.recipe_revision) params.set('recipe_revision', binary.recipe_revision);

        navigate({ pathname: `${packagePathname}/configuration`, search: params.toString() });
    };

    const handleVersionSelect = (selectedVersion: string) => {
        if (!remoteName) return;
        navigate(paths.packageView(remoteName, packageName!, { version: selectedVersion }));
    };

    // When no version is in the URL, resolve the latest one and redirect to it
    useEffect(() => {
        if (!remoteName || !packageName || version) return;

        let cancelled = false;
        const resolveLatest = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getPackageVersions(remoteName, packageName);
                if (cancelled) return;
                const latest = result.versions[0]?.version;
                if (latest) {
                    const params = new URLSearchParams(searchParams);
                    params.set('version', latest);
                    navigate({ pathname: packagePathname, search: params.toString() }, { replace: true });
                } else {
                    setError('No versions found for this package');
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load versions');
                    setLoading(false);
                }
            }
        };
        resolveLatest();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remoteName, packageName, version]);

    useEffect(() => {
        if (!remoteName || !packageName || !version) return;

        const filters: ConanBinaryFilters = {
            recipe_revision: revision,
            user,
            channel,
            os,
            arch,
            compiler,
            compiler_version: compilerVersion,
            build_type: buildType
        };
        setBinaryFilters(filters);

        const loadBinaries = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getPackageBinaries(
                    remoteName,
                    packageName,
                    version,
                    revision,
                    user,
                    channel,
                    os,
                    arch,
                    compiler,
                    compilerVersion,
                    buildType
                );
                setBinaries(result.binaries);
                setRevisionInfo(result.revision_info);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load package binaries');
            } finally {
                setLoading(false);
            }
        };

        loadBinaries();
        // Depends on filter values (not the whole searchParams) so toggling ?tab= doesn't refetch
    }, [remoteName, packageName, version, revision, user, channel, os, arch, compiler, compilerVersion, buildType]);

    return (
        <Layout>
            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">Error: {error}</div>}
            {!loading && !error && revisionInfo && (
                <PackageBinaries
                    remoteName={remoteName!}
                    packageName={packageName!}
                    version={version}
                    binaries={binaries}
                    revisionInfo={revisionInfo}
                    currentFilters={binaryFilters}
                    onFiltersChange={handleBinaryFiltersChange}
                    onBinarySelect={handleBinarySelect}
                    onVersionSelect={handleVersionSelect}
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    loading={loading}
                />
            )}
        </Layout>
    );
};

export default PackageBinariesPage;
