import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Brand from './Brand';
import SearchBar from './SearchBar';
import AdminMenu from './AdminMenu';
import { getRepositories } from '../services/api';
import { paths } from '../routes/paths';

interface Repository {
    name: string;
    url: string;
    available: boolean;
    description: string;
    is_default?: boolean;
}

interface LayoutProps {
    /** Remote in context (drives the selector value + where search navigates) */
    remoteName?: string;
    /** Current search query, used to seed the search box */
    searchQuery?: string;
    children: React.ReactNode;
}

// Static top bar (brand + centered search + remote selector) shared by every
// remote-scoped page, plus the main content area.
const Layout: React.FC<LayoutProps> = ({ remoteName, searchQuery = '', children }) => {
    const navigate = useNavigate();
    const [repositories, setRepositories] = useState<Repository[]>([]);

    useEffect(() => {
        let cancelled = false;
        getRepositories()
            .then((result) => {
                if (!cancelled) setRepositories(result.repositories);
            })
            .catch((err) => console.error('Failed to load repositories:', err));
        return () => { cancelled = true; };
    }, []);

    // Searching from any page lands on the current remote's package list
    const handleSearch = (query: string) => {
        if (!remoteName) return;
        navigate(paths.remote(remoteName, query || undefined));
    };

    const handleRemoteChange = (newRemoteName: string) => {
        navigate(paths.remote(newRemoteName, searchQuery || undefined));
    };

    const knownRemote = repositories.some((repo) => repo.name === remoteName);

    return (
        <div className="App">
            <header className="App-header list-header">
                <Brand />
                <SearchBar onSearch={handleSearch} initialQuery={searchQuery} />
                <div className="header-right">
                    <div className="remote-selector">
                        <label htmlFor="remote-select">Repository: </label>
                        <select
                            id="remote-select"
                            value={remoteName || ''}
                            onChange={(e) => handleRemoteChange(e.target.value)}
                            className="remote-dropdown"
                        >
                            {/* Keep the current remote selectable before the list loads */}
                            {remoteName && !knownRemote && (
                                <option value={remoteName}>{remoteName}</option>
                            )}
                            {repositories.map((repo) => (
                                <option key={repo.name} value={repo.name} disabled={!repo.available}>
                                    {repo.name} {repo.is_default ? '(default)' : ''} {!repo.available ? '(unavailable)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    {remoteName && <AdminMenu remoteName={remoteName} />}
                </div>
            </header>
            <main className="App-main">
                {children}
            </main>
        </div>
    );
};

export default Layout;
