import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PackageDetail from '../components/PackageDetail';
import { ConanPackageDetail } from '../types/conan';
import { getPackageConfiguration } from '../services/api';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

const PackageConfigurationPage: React.FC = () => {
    const { remote: remoteName } = useRemote();
    const { packageName } = useParams<{ packageName: string }>();
    const [packageDetail, setPackageDetail] = useState<ConanPackageDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const version = searchParams.get('version') || '';

    const handleBackToBinaries = () => {
        if (!remoteName) return;
        navigate(paths.packageView(remoteName, packageName!, { version: version || undefined }));
    };

    useEffect(() => {
        if (!remoteName || !packageName || !version) return;

        const loadConfiguration = async () => {
            setLoading(true);
            setError(null);

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
        <Layout>
            {loading && <div className="loading">Loading...</div>}
            {error && <div className="error">Error: {error}</div>}
            {!loading && !error && packageDetail && (
                <PackageDetail package={packageDetail} onClose={handleBackToBinaries} />
            )}
        </Layout>
    );
};

export default PackageConfigurationPage;
