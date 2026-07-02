import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRepositories } from '../services/api';
import { paths } from '../routes/paths';

interface Repository {
    name: string;
    url: string;
    available: boolean;
    description: string;
    is_default?: boolean;
}

// Landing page: pick a remote. Auto-redirects to the default (or first available).
const RemoteSelectionPage: React.FC = () => {
    const [repositories, setRepositories] = useState<Repository[]>([]);
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

                const defaultRemote = result.repositories.find(
                    (repo) => repo.is_default || repo.name === result.default
                );
                if (defaultRemote && defaultRemote.available) {
                    navigate(paths.remote(defaultRemote.name), { replace: true });
                    return;
                }

                const firstAvailable = result.repositories.find((repo) => repo.available);
                if (firstAvailable) {
                    navigate(paths.remote(firstAvailable.name), { replace: true });
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

    return (
        <div className="App">
            <header className="App-header hero">
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
                                onClick={repo.available ? () => navigate(paths.remote(repo.name)) : undefined}
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
};

export default RemoteSelectionPage;
