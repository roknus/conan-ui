import React from 'react';
import { ConanPackageInfo } from '../types/conan';
import { formatDate } from '../utils/dateUtils';
import './PackageList.css';

interface PackageListProps {
    packages: ConanPackageInfo[];
    onPackageSelect: (pkg: ConanPackageInfo) => void;
}

const PackageList: React.FC<PackageListProps> = ({ packages, onPackageSelect }) => {
    if (packages.length === 0) {
        return (
            <div className="package-list-container">
                <div className="empty-state">
                    <p>📦 No packages found</p>
                    <p>Try a different search term or check your remote connection</p>
                </div>
            </div>
        );    }

    return (
        <div className="package-list-container">
            <div className="package-list-header">
                <h2>📦 Found {packages.length} package{packages.length !== 1 ? 's' : ''}</h2>
            </div>
            <div className="package-list">
                {packages.map((pkg) => (
                    <div
                        key={pkg.name}
                        className="package-card"
                        onClick={() => onPackageSelect(pkg)}
                    >
                        <div className="package-header">
                            <h3 className="package-name">{pkg.name}</h3>
                            <div className="package-stats">
                                <span className="version-count">
                                    {pkg.total_versions} version{pkg.total_versions !== 1 ? 's' : ''}
                                </span>
                                {pkg.latest_version && (
                                    <span className="latest-version">
                                        Latest: {pkg.latest_version}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="package-metadata">
                            {pkg.created && (
                                <div className="metadata-item">
                                    <span className="metadata-label">Created:</span>
                                    <span className="metadata-value">{formatDate(pkg.created)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PackageList;
