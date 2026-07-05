import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PackageList from '../components/PackageList';
import { ConanPackageInfo } from '../types/conan';
import { listPackages } from '../services/api';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

const PER_PAGE = 20;

const PackageListPage: React.FC = () => {
    const { remote: remoteName } = useRemote();
    const [searchParams] = useSearchParams();

    const searchQuery = searchParams.get('q') || '';

    const [packages, setPackages] = useState<ConanPackageInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPackages, setTotalPackages] = useState(0);

    const fetchPage = useCallback(async (page: number) => {
        if (!remoteName) return;
        setLoading(true);
        setError(null);
        try {
            const result = await listPackages(remoteName, searchQuery, page, PER_PAGE);
            setPackages(result.packages);
            setTotalPackages(result.total);
            setCurrentPage(page);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setPackages([]);
            setTotalPackages(0);
        } finally {
            setLoading(false);
        }
    }, [remoteName, searchQuery]);

    // Refetch from page 1 whenever the remote or search query changes
    useEffect(() => {
        fetchPage(1);
    }, [fetchPage]);

    // Destination for a package card: its view at the latest version, or the
    // bare package view (which resolves the latest from the API) when unknown.
    const packageHref = (pkg: ConanPackageInfo) =>
        pkg.latest_version
            ? paths.packageView(remoteName!, pkg.name, { version: pkg.latest_version })
            : paths.package(remoteName!, pkg.name);

    return (
        <Layout searchQuery={searchQuery}>
            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">Error: {error}</div>}
            {!loading && !error && (
                <PackageList
                    packages={packages}
                    packageHref={packageHref}
                    currentPage={currentPage}
                    totalPackages={totalPackages}
                    perPage={PER_PAGE}
                    onPageChange={fetchPage}
                    highlight={searchQuery}
                />
            )}
        </Layout>
    );
};

export default PackageListPage;
