import React from 'react';
import { ConanPackageInfo } from '../types/conan';
import { formatDate } from '../utils/dateUtils';
import './PackageList.css';

interface PackageListProps {
    packages: ConanPackageInfo[];
    onPackageSelect: (pkg: ConanPackageInfo) => void;
    currentPage?: number;
    totalPackages?: number;
    perPage?: number;
    onPageChange?: (page: number) => void;
}

const PackageList: React.FC<PackageListProps> = ({ packages, onPackageSelect, currentPage = 1, totalPackages, perPage = 20, onPageChange }) => {
    if (packages.length === 0) {
        return (
            <div className="package-list-container">
                <div className="empty-state">
                    <p>📦 No packages found</p>
                    <p>Try a different search term or check your remote connection</p>
                </div>
            </div>
        );    }

    const total = totalPackages ?? packages.length;
    const totalPages = Math.ceil(total / perPage);

    return (
        <div className="package-list-container">
            <div className="package-list-header">
                <h2>📦 Found {total} package{total !== 1 ? 's' : ''}</h2>
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
            {totalPages > 1 && onPageChange && (
                <div className="pagination">
                    <button
                        className="pagination-btn"
                        disabled={currentPage <= 1}
                        onClick={() => onPageChange(currentPage - 1)}
                    >
                        ← Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                            // Show first, last, and pages near current
                            return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2;
                        })
                        .reduce<(number | string)[]>((acc, page, idx, arr) => {
                            if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                                acc.push('...');
                            }
                            acc.push(page);
                            return acc;
                        }, [])
                        .map((item, idx) =>
                            typeof item === 'string' ? (
                                <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                            ) : (
                                <button
                                    key={item}
                                    className={`pagination-btn ${item === currentPage ? 'active' : ''}`}
                                    onClick={() => onPageChange(item)}
                                >
                                    {item}
                                </button>
                            )
                        )}
                    <button
                        className="pagination-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
};

export default PackageList;
