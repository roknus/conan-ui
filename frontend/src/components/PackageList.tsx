import React from 'react';
import { ConanPackageInfo } from '../types/conan';
import { formatDate } from '../utils/dateUtils';
import { FaBox, FaArrowLeft, FaArrowRight } from './icons';
import './PackageList.css';

interface PackageListProps {
    packages: ConanPackageInfo[];
    onPackageSelect: (pkg: ConanPackageInfo) => void;
    currentPage?: number;
    totalPackages?: number;
    perPage?: number;
    onPageChange?: (page: number) => void;
    highlight?: string;
}

// Highlight the matched portion of the package name so it's easy to spot.
const highlightMatch = (name: string, query?: string): React.ReactNode => {
    const q = query?.trim();
    if (!q) return name;
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return name;
    return (
        <>
            {name.slice(0, idx)}
            <mark className="pkg-match">{name.slice(idx, idx + q.length)}</mark>
            {name.slice(idx + q.length)}
        </>
    );
};

const PackageList: React.FC<PackageListProps> = ({
    packages,
    onPackageSelect,
    currentPage = 1,
    totalPackages,
    perPage = 20,
    onPageChange,
    highlight,
}) => {
    if (packages.length === 0) {
        return (
            <div className="package-list-container">
                <div className="empty-state">
                    <div className="empty-icon"><FaBox /></div>
                    <p className="empty-title">No packages found</p>
                    <p className="empty-hint">Try a different search term or check your remote connection</p>
                </div>
            </div>
        );
    }

    const total = totalPackages ?? packages.length;
    const totalPages = Math.ceil(total / perPage);

    return (
        <div className="package-list-container">
            <div className="package-list-header">
                <span className="result-count">
                    {total.toLocaleString()} package{total !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="package-grid">
                {packages.map((pkg) => (
                    <button
                        key={pkg.name}
                        type="button"
                        className="package-card"
                        onClick={() => onPackageSelect(pkg)}
                    >
                        <span className="pkg-name" title={pkg.name}>
                            {highlightMatch(pkg.name, highlight)}
                        </span>
                        <div className="package-card__meta">
                            <span className="version-count">
                                {pkg.total_versions} version{pkg.total_versions !== 1 ? 's' : ''}
                            </span>
                            {pkg.latest_version && (
                                <span className="latest-version" title={pkg.latest_version}>
                                    {pkg.latest_version}
                                </span>
                            )}
                        </div>
                        {pkg.created && (
                            <div className="package-card__created">
                                {formatDate(pkg.created)}
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {totalPages > 1 && onPageChange && (
                <div className="pagination">
                    <button
                        className="pagination-btn"
                        disabled={currentPage <= 1}
                        onClick={() => onPageChange(currentPage - 1)}
                    >
                        <FaArrowLeft /> Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
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
                        Next <FaArrowRight />
                    </button>
                </div>
            )}
        </div>
    );
};

export default PackageList;
