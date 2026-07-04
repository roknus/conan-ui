import React from 'react';
import { useNavigate } from 'react-router-dom';
import Brand from './Brand';
import SearchBar from './SearchBar';
import AdminMenu from './AdminMenu';
import Dropdown, { DropdownItem } from './Dropdown';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

interface LayoutProps {
    /** Current search query, used to seed the search box */
    searchQuery?: string;
    children: React.ReactNode;
}

// Static top bar (brand + centered search + remote selector) shared by every
// remote-scoped page, plus the main content area. The active remote comes from
// RemoteContext (the ?repo= query param, or the default).
const Layout: React.FC<LayoutProps> = ({ searchQuery = '', children }) => {
    const navigate = useNavigate();
    const { remote, repositories } = useRemote();

    // Searching from any page lands on the current remote's package list
    const handleSearch = (query: string) => {
        navigate(paths.remote(remote, query || undefined));
    };

    // Switching the remote goes to its package list, keeping the search query
    const handleRemoteChange = (newRemoteName: string) => {
        navigate(paths.remote(newRemoteName, searchQuery || undefined));
    };

    const repoItems: DropdownItem[] = repositories.map((repo) => ({
        value: repo.name,
        label: `${repo.name}${repo.is_default ? ' (default)' : ''}${!repo.available ? ' (unavailable)' : ''}`,
        disabled: !repo.available,
        active: repo.name === remote,
    }));

    return (
        <div className="App">
            <header className="App-header list-header">
                <Brand />
                <SearchBar onSearch={handleSearch} initialQuery={searchQuery} />
                <div className="header-right">
                    <div className="remote-selector">
                        <span className="remote-selector-label">Repository</span>
                        <Dropdown
                            variant="select"
                            ariaLabel="Repository"
                            align="left"
                            trigger={remote || 'Select…'}
                            items={repoItems}
                            onSelect={handleRemoteChange}
                        />
                    </div>
                    {remote && <AdminMenu />}
                </div>
            </header>
            <main className="App-main">
                {children}
            </main>
        </div>
    );
};

export default Layout;
