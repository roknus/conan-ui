import React, { useState, useEffect } from 'react';
import './PackageBinaries.css';
import { ConanPackageBinary, ConanRevisionInfo, ConanBinaryFilters, ConanFilterOptions } from '../types/conan';
import { formatDate } from '../utils/dateUtils';

interface PackageBinariesProps {
    remoteName: string;
    packageName: string;
    version: string;
    binaries: ConanPackageBinary[];
    revisionInfo: ConanRevisionInfo;
    currentFilters: ConanBinaryFilters;
    onFiltersChange: (filters: ConanBinaryFilters) => void;
    onBinarySelect: (binary: ConanPackageBinary) => void;
    loading: boolean;
}

const PackageBinaries: React.FC<PackageBinariesProps> = ({
    remoteName,
    packageName,
    version,
    binaries,
    revisionInfo,
    currentFilters,
    onFiltersChange,
    onBinarySelect,
    loading
}) => {
    const [localFilters, setLocalFilters] = useState<ConanBinaryFilters>(currentFilters);
    const [allFilterOptions, setAllFilterOptions] = useState<ConanFilterOptions>({
        os: [],
        arch: [],
        compiler: [],
        compiler_version: [],
        build_type: []
    });
    const [compilerVersionMap, setCompilerVersionMap] = useState<Map<string, string[]>>(new Map());
    const [filterOptionsLoaded, setFilterOptionsLoaded] = useState(false);

    // Update local filters when props change
    useEffect(() => {
        setLocalFilters(currentFilters);
    }, [currentFilters]);    // Load filter options independently from binaries - this ensures we always have all options
    useEffect(() => {
        const loadFilterOptions = async () => {
            if (!remoteName || !packageName || !version) return;
            
            try {
                // Import the API function here to avoid circular dependency
                const { getPackageFilterOptions } = await import('../services/api');
                const filterData = await getPackageFilterOptions(remoteName, packageName, version);
                
                // Convert compiler versions to Map
                const compilerVersionMapTemp = new Map<string, string[]>();
                Object.entries(filterData.compiler_versions).forEach(([compiler, versions]) => {
                    compilerVersionMapTemp.set(compiler, versions);
                });
                
                // Get compiler versions for currently selected compiler
                const selectedCompilerVersions = localFilters.compiler && compilerVersionMapTemp.has(localFilters.compiler)
                    ? compilerVersionMapTemp.get(localFilters.compiler)!
                    : [];                
                setAllFilterOptions({
                    os: filterData.filter_options.os,
                    arch: filterData.filter_options.arch,
                    compiler: filterData.filter_options.compiler,
                    compiler_version: selectedCompilerVersions,
                    build_type: filterData.filter_options.build_type
                });

                setCompilerVersionMap(compilerVersionMapTemp);
                setFilterOptionsLoaded(true);
            } catch (error) {
                console.error('Failed to load filter options:', error);
                setFilterOptionsLoaded(true); // Still mark as loaded to avoid infinite loading
            }
        };        loadFilterOptions();
    }, [remoteName, packageName, version]); // Only reload when remote/package/version changes

    // Update compiler versions when compiler selection changes
    useEffect(() => {
        if (!filterOptionsLoaded) return;
        
        const selectedCompilerVersions = localFilters.compiler && compilerVersionMap.has(localFilters.compiler)
            ? compilerVersionMap.get(localFilters.compiler)!
            : [];

        setAllFilterOptions(prev => ({
            ...prev,
            compiler_version: selectedCompilerVersions
        }));
    }, [localFilters.compiler, compilerVersionMap, filterOptionsLoaded]);

    const handleFilterChange = (filterName: keyof ConanBinaryFilters, value: string) => {
        const newFilters = {
            ...localFilters,
            [filterName]: value === '' ? undefined : value
        };

        // If compiler changed, reset compiler version
        if (filterName === 'compiler') {
            newFilters.compiler_version = undefined;
        }

        setLocalFilters(newFilters);
        onFiltersChange(newFilters);
    };    
    
    const formatSettings = (settings: Record<string, any>) => {
        return Object.entries(settings).map(([key, value]) => ({
            key,
            value: String(value),
            type: 'setting'
        }));
    };

    const formatOptions = (options: Record<string, any>) => {
        return Object.entries(options).map(([key, value]) => ({
            key,
            value: String(value),
            type: 'option'
        }));
    };

    const formatRequires = (requires: string[]) => {
        return requires.map(req => ({
            key: 'requires',
            value: req,
            type: 'require'
        }));
    };

    if (loading) {
        return (
            <div className="package-binaries">
                <div className="loading">Loading package binaries...</div>
            </div>
        );
    }

    return (
        <div className="package-binaries">
            <div className="binaries-header">
                <h2>Package Binaries</h2>
                <div className="package-info">
                    <span className="package-name">{packageName}</span>
                    <span className="package-version">{version}</span>
                </div>
            </div>            <div className="filters-container">
                {/* Package Reference Filters */}
                <div className="filters-section package-filters">
                    <h3 className="filter-section-title">📦 Package Reference Filters</h3>
                    <div className="filter-controls">
                        <div className="filter-group">
                            <label htmlFor="revision-select">Recipe Revision:</label>
                            <select 
                                id="revision-select"
                                value={localFilters.recipe_revision || ''}
                                onChange={(e) => handleFilterChange('recipe_revision', e.target.value)}
                            >
                                <option value="">Latest ({revisionInfo.latest_revision || 'None'})</option>
                                {revisionInfo.recipe_revisions.map(revision => (
                                    <option key={revision} value={revision}>
                                        {revision}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="user-select">User:</label>
                            <select 
                                id="user-select"
                                value={localFilters.user || ''}
                                onChange={(e) => handleFilterChange('user', e.target.value)}
                            >
                                <option value="">All Users</option>
                                {revisionInfo.users.map(user => (
                                    <option key={user} value={user}>
                                        {user}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="channel-select">Channel:</label>
                            <select 
                                id="channel-select"
                                value={localFilters.channel || ''}
                                onChange={(e) => handleFilterChange('channel', e.target.value)}
                            >
                                <option value="">All Channels</option>
                                {revisionInfo.channels.map(channel => (
                                    <option key={channel} value={channel}>
                                        {channel}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>                

                
                {/* Build Settings Filters */}
                <div className="filters-section settings-filters">
                    <h3 className="filter-section-title">⚙️ Build Settings Filters</h3>
                    
                    {/* Platform Settings Row */}
                    <div className="filter-row platform-settings">
                        <div className="filter-group">
                            <label htmlFor="os-select">🖥️ Operating System:</label>
                            <select 
                                id="os-select"
                                value={localFilters.os || ''}
                                onChange={(e) => handleFilterChange('os', e.target.value)}
                            >
                                <option value="">All OS</option>
                                {allFilterOptions.os.map(os => (
                                    <option key={os} value={os}>
                                        {os}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="arch-select">🏗️ Architecture:</label>
                            <select 
                                id="arch-select"
                                value={localFilters.arch || ''}
                                onChange={(e) => handleFilterChange('arch', e.target.value)}
                            >
                                <option value="">All Architectures</option>
                                {allFilterOptions.arch.map(arch => (
                                    <option key={arch} value={arch}>
                                        {arch}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label htmlFor="build-type-select">🔧 Build Type:</label>
                            <select 
                                id="build-type-select"
                                value={localFilters.build_type || ''}
                                onChange={(e) => handleFilterChange('build_type', e.target.value)}
                            >
                                <option value="">All Build Types</option>
                                {allFilterOptions.build_type.map(buildType => (
                                    <option key={buildType} value={buildType}>
                                        {buildType}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Compilation Settings Row */}
                    <div className="filter-row compilation-settings">
                        <div className="filter-group">
                            <label htmlFor="compiler-select">⚙️ Compiler:</label>
                            <select 
                                id="compiler-select"
                                value={localFilters.compiler || ''}
                                onChange={(e) => handleFilterChange('compiler', e.target.value)}
                            >
                                <option value="">All Compilers</option>
                                {allFilterOptions.compiler.map(compiler => (
                                    <option key={compiler} value={compiler}>
                                        {compiler}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {localFilters.compiler && allFilterOptions.compiler_version.length > 0 && (
                            <div className="filter-group">
                                <label htmlFor="compiler-version-select">🔢 Compiler Version:</label>
                                <select 
                                    id="compiler-version-select"
                                    value={localFilters.compiler_version || ''}
                                    onChange={(e) => handleFilterChange('compiler_version', e.target.value)}
                                >
                                    <option value="">All Versions</option>
                                    {allFilterOptions.compiler_version.map(version => (
                                        <option key={version} value={version}>
                                            {version}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>
            </div><div className="binaries-list">
                {binaries.length === 0 ? (
                    <div className="no-binaries">
                        No package binaries found with current filters.
                    </div>
                ) : (
                    <>
                        {/* Check if we only have recipe-only entries */}
                        {binaries.every(binary => binary.package_id === 'recipe-only') && (
                            <div className="recipe-only-message">
                                <h3>Recipe Available - No Binaries Built</h3>
                                <p>This package version has a recipe but no binary packages have been built yet. 
                                   The recipe contains the build instructions and metadata, but you'll need to build 
                                   the package for your specific platform or wait for pre-built binaries to become available.</p>
                            </div>
                        )}
                        
                        {binaries.map((binary, index) => (
                            <div 
                                key={`${binary.package_id}-${index}`}
                                className={`binary-item ${binary.package_id === 'recipe-only' ? 'recipe-only-item' : ''}`}
                                onClick={binary.package_id === 'recipe-only' ? undefined : () => onBinarySelect(binary)}
                                style={binary.package_id === 'recipe-only' ? { cursor: 'default' } : { cursor: 'pointer' }}
                            ><div className="binary-header">
                                <div className="binary-id">
                                    {binary.package_id === 'recipe-only' ? (
                                        <span className="recipe-only" title="Recipe exists but no binary packages are available. Cannot view details.">
                                            Recipe Only (No Binaries)
                                        </span>
                                    ) : (
                                        <span className="package-id">{binary.package_id}</span>
                                    )}
                                </div>
                                <div className="binary-revision">
                                    {binary.recipe_revision && (
                                        <span className="revision">Rev: {binary.recipe_revision}</span>
                                    )}
                                    {binary.revision && (
                                        <span className="pkg-revision">Pkg: {binary.revision}</span>
                                    )}
                                </div>
                            </div>

                            <div className="binary-details">
                                <div className="binary-metadata">
                                    <div className="user-channel">
                                        <span className="user">{binary.user || 'None'}</span>
                                        <span className="separator">/</span>
                                        <span className="channel">{binary.channel || 'None'}</span>
                                    </div>
                                    <div className="created-date">
                                        Created: {formatDate(binary.created)}
                                    </div>
                                </div>                                {(Object.keys(binary.settings).length > 0 || Object.keys(binary.options).length > 0 || binary.requires.length > 0) && (
                                    <div className="binary-config">
                                        {Object.keys(binary.settings).length > 0 && (
                                            <div className="config-section">
                                                <strong className="config-label">Settings:</strong>
                                                <div className="config-tags">                                                    {formatSettings(binary.settings).map((item, idx) => (
                                                        <span 
                                                            key={`setting-${idx}`}
                                                            className="config-tag setting-tag"
                                                            title={`⚙️ Setting: ${item.key} = ${item.value}`}
                                                        >
                                                            {item.value}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {Object.keys(binary.options).length > 0 && (
                                            <div className="config-section">
                                                <strong className="config-label">Options:</strong>
                                                <div className="config-tags">                                                    {formatOptions(binary.options).map((item, idx) => (
                                                        <span 
                                                            key={`option-${idx}`}
                                                            className="config-tag option-tag"
                                                            title={`🔧 Option: ${item.key} = ${item.value}`}
                                                        >
                                                            {item.value}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {binary.requires.length > 0 && (
                                            <div className="config-section">
                                                <strong className="config-label">Requires:</strong>
                                                <div className="config-tags">                                                    {formatRequires(binary.requires).map((item, idx) => (
                                                        <span 
                                                            key={`require-${idx}`}
                                                            className="config-tag require-tag"
                                                            title={`📦 Dependency: ${item.value}`}
                                                        >
                                                            {item.value}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        ))}
                    </>
                )}
            </div>

            <div className="binaries-summary">
                Total binaries: {binaries.length}
            </div>
        </div>
    );
};

export default PackageBinaries;
