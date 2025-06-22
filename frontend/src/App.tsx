import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import './App.css';
import SearchBar from './components/SearchBar';
import PackageList from './components/PackageList';
import PackageDetail from './components/PackageDetail';
import PackageBinaries from './components/PackageBinaries';
import { 
  ConanPackageInfo, 
  ConanPackageVersion, 
  ConanPackageDetail,
  ConanPackageBinary,
  ConanRevisionInfo,
  ConanBinaryFilters
} from './types/conan';
import { 
  listPackages, 
  getPackageVersions, 
  getPackageBinaries,
  getPackageConfiguration, 
  checkConfiguration,
  getRepositories
} from './services/api';

// Remote Selection Component
function RemoteSelectionRoute() {
  const [repositories, setRepositories] = useState<Array<{
    name: string;
    url: string;
    available: boolean;
    description: string;
    is_default?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadRepositories = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await getRepositories();
        setRepositories(result.repositories);
        
        // Auto-redirect to default remote if available
        const defaultRemote = result.repositories.find(repo => repo.is_default || repo.name === result.default);
        if (defaultRemote && defaultRemote.available) {
          navigate(`/${encodeURIComponent(defaultRemote.name)}`, { replace: true });
          return;
        }
        
        // If default is not available, redirect to first available
        const firstAvailable = result.repositories.find(repo => repo.available);
        if (firstAvailable) {
          navigate(`/${encodeURIComponent(firstAvailable.name)}`, { replace: true });
          return;
        }
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repositories');
      } finally {
        setLoading(false);
      }
    };

    loadRepositories();
  }, [navigate]);

  const handleRemoteSelect = (remoteName: string) => {
    navigate(`/${encodeURIComponent(remoteName)}`);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <p>Select a remote repository to browse packages</p>
      </header>
      <main className="App-main">
        {loading && <div className="loading">Loading repositories...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && (
          <div className="repositories-list">
            <h2>Available Repositories</h2>
            {repositories.map((repo) => (
              <div 
                key={repo.name} 
                className={`repository-item ${repo.available ? 'available' : 'unavailable'}`}
                onClick={repo.available ? () => handleRemoteSelect(repo.name) : undefined}
                style={{ cursor: repo.available ? 'pointer' : 'not-allowed' }}
              >
                <h3>{repo.name}</h3>
                <p className="repository-url">{repo.url}</p>
                <p className="repository-description">{repo.description}</p>
                {!repo.available && (
                  <p className="repository-status">⚠️ Not available</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Route Components
function PackageListRoute() {
  const { remoteName } = useParams<{ remoteName: string }>();
  const [packages, setPackages] = useState<ConanPackageInfo[]>([]);
  const [repositories, setRepositories] = useState<Array<{
    name: string;
    url: string;
    available: boolean;
    description: string;
    is_default?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const searchQuery = searchParams.get('q') || '';

  // Load repositories on mount
  useEffect(() => {
    const loadRepositories = async () => {
      try {
        const result = await getRepositories();
        setRepositories(result.repositories);
      } catch (err) {
        console.error('Failed to load repositories:', err);
      }
    };
    loadRepositories();
  }, []);

  const handleSearch = async (query: string) => {
    if (!remoteName) return;
    
    setLoading(true);
    setError(null);
    
    // Update URL with search query
    if (query) {
      navigate(`/${encodeURIComponent(remoteName)}?q=${encodeURIComponent(query)}`);
    } else {
      navigate(`/${encodeURIComponent(remoteName)}`);
    }

    try {
      const result = await listPackages(remoteName, query);
      setPackages(result.packages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePackageSelect = (pkg: ConanPackageInfo) => {
    navigate(`/${encodeURIComponent(remoteName!)}/${encodeURIComponent(pkg.name)}`);
  };

  const handleRemoteChange = (newRemoteName: string) => {
    // Navigate to the new remote with current search query if any
    if (searchQuery) {
      navigate(`/${encodeURIComponent(newRemoteName)}?q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate(`/${encodeURIComponent(newRemoteName)}`);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    handleSearch(searchQuery);
  }, [searchQuery, remoteName]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <SearchBar onSearch={handleSearch} initialQuery={searchQuery} />
        <div className="remote-selector">
          <label htmlFor="remote-select">Repository: </label>
          <select 
            id="remote-select" 
            value={remoteName || ''} 
            onChange={(e) => handleRemoteChange(e.target.value)}
            className="remote-dropdown"
          >
            {repositories.map((repo) => (
              <option 
                key={repo.name} 
                value={repo.name} 
                disabled={!repo.available}
              >
                {repo.name} {repo.is_default ? '(default)' : ''} {!repo.available ? '(unavailable)' : ''}
              </option>
            ))}
          </select>
        </div>
      </header>
      <main className="App-main">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && (
          <PackageList 
            packages={packages} 
            onPackageSelect={handlePackageSelect}
          />
        )}
      </main>
    </div>
  );
}

function PackageVersionsRoute() {
  const { remoteName, packageName } = useParams<{ remoteName: string; packageName: string }>();
  const [versions, setVersions] = useState<ConanPackageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleVersionSelect = (version: ConanPackageVersion) => {
    navigate(`/${encodeURIComponent(remoteName!)}/${encodeURIComponent(packageName!)}/${encodeURIComponent(version.version)}`);
  };

  const handleBackToPackages = () => {
    navigate(`/${encodeURIComponent(remoteName!)}`);
  };

  useEffect(() => {
    if (!remoteName || !packageName) return;

    const loadVersions = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getPackageVersions(remoteName, packageName);
        setVersions(result.versions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, [remoteName, packageName]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <div className="breadcrumb">
          Remote: <strong>{remoteName}</strong> {' > '}
          <button className="breadcrumb-link" onClick={handleBackToPackages}>
            Packages
          </button>
          {' > '}
          {packageName}
        </div>
      </header>
      <main className="App-main">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && (
          <div className="versions-list">
            <h2>Versions of {packageName}</h2>
            {versions.map((version) => (
              <div key={version.version} className="version-item">
                <div className="version-header" onClick={() => handleVersionSelect(version)}>
                  <h3>{version.version}</h3>
                  <span className="variant-count">{version.total_variants} variants</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PackageBinariesRoute() {
  const { remoteName, packageName, version } = useParams<{ remoteName: string; packageName: string; version: string }>();
  const [binaries, setBinaries] = useState<ConanPackageBinary[]>([]);
  const [revisionInfo, setRevisionInfo] = useState<ConanRevisionInfo | null>(null);
  const [binaryFilters, setBinaryFilters] = useState<ConanBinaryFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleBinaryFiltersChange = async (filters: ConanBinaryFilters) => {
    if (!remoteName) return;
    
    setLoading(true);
    setError(null);
    setBinaryFilters(filters);

    // Update URL with filter parameters
    const params = new URLSearchParams();
    if (filters.recipe_revision) params.set('revision', filters.recipe_revision);
    if (filters.user) params.set('user', filters.user);
    if (filters.channel) params.set('channel', filters.channel);
    if (filters.os) params.set('os', filters.os);
    if (filters.arch) params.set('arch', filters.arch);
    if (filters.compiler) params.set('compiler', filters.compiler);
    if (filters.compiler_version) params.set('compiler_version', filters.compiler_version);
    if (filters.build_type) params.set('build_type', filters.build_type);
    
    navigate({
      pathname: `/${encodeURIComponent(remoteName)}/${encodeURIComponent(packageName!)}/${encodeURIComponent(version!)}`,
      search: params.toString()
    });

    try {
      const result = await getPackageBinaries(
        remoteName,
        packageName!, 
        version!,
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
    if (binary.package_id === 'recipe-only') {
      return;
    }

    const params = new URLSearchParams();
    if (binary.user) params.set('user', binary.user);
    if (binary.channel) params.set('channel', binary.channel);
    if (binary.package_id) params.set('package_id', binary.package_id);
    if (binary.recipe_revision) params.set('recipe_revision', binary.recipe_revision);

    navigate({
      pathname: `/${encodeURIComponent(remoteName)}/${encodeURIComponent(packageName!)}/${encodeURIComponent(version!)}/configuration`,
      search: params.toString()
    });
  };

  const handleBackToVersions = () => {
    if (!remoteName) return;
    navigate(`/${encodeURIComponent(remoteName)}/${encodeURIComponent(packageName!)}`);
  };

  const handleBackToPackages = () => {
    if (!remoteName) return;
    navigate(`/${encodeURIComponent(remoteName)}`);
  };

  useEffect(() => {
    if (!remoteName || !packageName || !version) return;

    const loadBinaries = async () => {
      setLoading(true);
      setError(null);

      // Get filter parameters from URL
      const revision = searchParams.get('revision') || '';
      const user = searchParams.get('user') || '';
      const channel = searchParams.get('channel') || '';
      const os = searchParams.get('os') || undefined;
      const arch = searchParams.get('arch') || undefined;
      const compiler = searchParams.get('compiler') || undefined;
      const compiler_version = searchParams.get('compiler_version') || undefined;
      const build_type = searchParams.get('build_type') || undefined;

      const filters: ConanBinaryFilters = { 
        recipe_revision: revision, 
        user, 
        channel,
        os,
        arch,
        compiler,
        compiler_version,
        build_type
      };
      setBinaryFilters(filters);

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
          compiler_version,
          build_type
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
  }, [remoteName, packageName, version, searchParams]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <div className="breadcrumb">
          Remote: <strong>{remoteName}</strong> {' > '}
          <button className="breadcrumb-link" onClick={handleBackToPackages}>
            Packages
          </button>
          {' > '}
          <button className="breadcrumb-link" onClick={handleBackToVersions}>
            {packageName}
          </button>
          {' > '}
          {version}
        </div>
      </header>
      <main className="App-main">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && revisionInfo && (
          <PackageBinaries
            remoteName={remoteName!}
            packageName={packageName!}
            version={version!}
            binaries={binaries}
            revisionInfo={revisionInfo}
            currentFilters={binaryFilters}
            onFiltersChange={handleBinaryFiltersChange}
            onBinarySelect={handleBinarySelect}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}

function PackageConfigurationRoute() {
  const { remoteName, packageName, version } = useParams<{ remoteName: string; packageName: string; version: string }>();
  const [packageDetail, setPackageDetail] = useState<ConanPackageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleBackToBinaries = () => {
    if (!remoteName) return;
    navigate(`/${encodeURIComponent(remoteName)}/${encodeURIComponent(packageName!)}/${encodeURIComponent(version!)}`);
  };

  const handleBackToVersions = () => {
    if (!remoteName) return;
    navigate(`/${encodeURIComponent(remoteName)}/${encodeURIComponent(packageName!)}`);
  };

  const handleBackToPackages = () => {
    if (!remoteName) return;
    navigate(`/${encodeURIComponent(remoteName)}`);
  };

  useEffect(() => {
    if (!remoteName || !packageName || !version) return;

    const loadConfiguration = async () => {
      setLoading(true);
      setError(null);

      // Get parameters from URL
      const user = searchParams.get('user') || '';
      const channel = searchParams.get('channel') || '';
      const packageId = searchParams.get('package_id') || '';
      const recipeRevision = searchParams.get('recipe_revision') || '';

      try {
        const detail = await getPackageConfiguration(
          remoteName,
          packageName, 
          version, 
          user, 
          channel,
          packageId,
          recipeRevision
        );
        setPackageDetail(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load package configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfiguration();
  }, [remoteName, packageName, version, searchParams]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <div className="breadcrumb">
          Remote: <strong>{remoteName}</strong> {' > '}
          <button className="breadcrumb-link" onClick={handleBackToPackages}>
            Packages
          </button>
          {' > '}
          <button className="breadcrumb-link" onClick={handleBackToVersions}>
            {packageName}
          </button>
          {' > '}
          <button className="breadcrumb-link" onClick={handleBackToBinaries}>
            {version}
          </button>
          {' > Configuration'}
        </div>
      </header>
      <main className="App-main">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Error: {error}</div>}
        {!loading && !error && packageDetail && (
          <PackageDetail 
            package={packageDetail} 
            onClose={handleBackToBinaries}
          />
        )}
      </main>
    </div>
  );
}

function ConfigurationErrorPage() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Conan UI</h1>
        <div className="error">
          Conan API is not configured properly. Please ensure:
          <ul>
            <li>Conan is installed and configured</li>
            <li>Your Conan remotes are set up correctly</li>
            <li>The backend server can access the Conan API</li>
          </ul>
        </div>
      </header>
    </div>
  );
}

function App() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  const checkAppConfiguration = async () => {
    try {
      const config = await checkConfiguration();
      setIsConfigured(config.conan_api_available);
    } catch (err) {
      setIsConfigured(false);
    }
  };

  useEffect(() => {
    checkAppConfiguration();
  }, []);

  if (isConfigured === null) {
    return <div className="loading">Checking configuration...</div>;
  }

  if (isConfigured === false) {
    return <ConfigurationErrorPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<RemoteSelectionRoute />} />
      <Route path="/:remoteName" element={<PackageListRoute />} />
      <Route path="/:remoteName/:packageName" element={<PackageVersionsRoute />} />
      <Route path="/:remoteName/:packageName/:version" element={<PackageBinariesRoute />} />
      <Route path="/:remoteName/:packageName/:version/configuration" element={<PackageConfigurationRoute />} />
    </Routes>
  );
}

export default App;
