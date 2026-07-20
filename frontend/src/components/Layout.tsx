import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Brand from './Brand';
import Footer from './Footer';
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
    const location = useLocation();
    const { remote, repositories } = useRemote();

    // Searching from any page lands on the current remote's package list
    const handleSearch = (query: string) => {
        navigate(paths.remote(remote, query || undefined));
    };

    // Clearing removes the ?q filter from the current page rather than
    // navigating to the list — so it doesn't yank you off a package page.
    const handleClear = () => {
        const params = new URLSearchParams(location.search);
        if (!params.has('q')) return; // nothing applied; the box is already cleared locally
        params.delete('q');
        navigate({ pathname: location.pathname, search: params.toString() });
    };

    // Switching the remote swaps ?repo in place, keeping the current page and its
    // other params — so changing repository just changes context, not the page.
    const handleRemoteChange = (newRemoteName: string) => {
        const params = new URLSearchParams(location.search);
        params.set('repo', newRemoteName);
        navigate({ pathname: location.pathname, search: params.toString() });
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
                <SearchBar onSearch={handleSearch} onClear={handleClear} initialQuery={searchQuery} />
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
            <Footer />
        </div>
    );
};

export default Layout;
