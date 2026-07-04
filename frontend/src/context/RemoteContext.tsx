import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRepositories } from '../services/api';

export interface Repository {
    name: string;
    url: string;
    available: boolean;
    description: string;
    is_default?: boolean;
}

interface RemoteContextValue {
    /** Active remote: the ?repo= value, or the default when absent. '' until repos load. */
    remote: string;
    repositories: Repository[];
    defaultRemote: string;
    loading: boolean;
    error: string | null;
}

const RemoteContext = createContext<RemoteContextValue | undefined>(undefined);

// Owns the repository list and resolves which remote is "active". The remote is
// a ?repo= query param so it persists across navigation and can be switched
// without rewriting the path; when absent we fall back to the default remote.
export const RemoteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [searchParams] = useSearchParams();
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [defaultRemote, setDefaultRemote] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getRepositories()
            .then((result) => {
                if (cancelled) return;
                setRepositories(result.repositories);
                // Prefer the flagged default; if it's unavailable, the first available one.
                const preferred = result.repositories.find(
                    (r) => r.is_default || r.name === result.default
                );
                const usable =
                    preferred && preferred.available
                        ? preferred
                        : result.repositories.find((r) => r.available);
                setDefaultRemote(usable?.name || preferred?.name || result.default || '');
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load repositories');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const remote = (searchParams.get('repo') || '') || defaultRemote;

    const value = useMemo(
        () => ({ remote, repositories, defaultRemote, loading, error }),
        [remote, repositories, defaultRemote, loading, error]
    );

    return <RemoteContext.Provider value={value}>{children}</RemoteContext.Provider>;
};

export const useRemote = (): RemoteContextValue => {
    const ctx = useContext(RemoteContext);
    if (!ctx) throw new Error('useRemote must be used within a RemoteProvider');
    return ctx;
};
