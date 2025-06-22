import React from 'react';
import { ConanPackageDetail } from '../types/conan';
import { formatDate } from '../utils/dateUtils';
import './PackageDetail.css';

interface PackageDetailProps {
    package: ConanPackageDetail;
    onBack?: () => void;
    onClose?: () => void;
}

const PackageDetail: React.FC<PackageDetailProps> = ({ package: pkg, onBack, onClose }) => {
    const handleClose = () => {
        if (onClose) onClose();
        if (onBack) onBack();    };
    
    const renderObjectAsTable = (obj: Record<string, any>, title: string) => {
        const entries = Object.entries(obj);
        if (entries.length === 0) return null;

        return (
            <div className="detail-section">
                <h3>{title}</h3>
                <div className="properties-table">
                    {entries.map(([key, value]) => (
                        <div key={key} className="property-row">
                            <span className="property-key">{key}:</span>
                            <span className="property-value">
                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="package-detail-container">
            <div className="detail-header">
                <button onClick={handleClose} className="back-button">
                    ← Back to list
                </button>
                <div className="package-title">
                    <h1>{pkg.name}</h1>
                    <span className="version-badge">v{pkg.version}</span>
                </div>
            </div>

            <div className="detail-content">
                <div className="detail-main">
                    {/* Basic Information */}
                    <div className="detail-section">
                        <h2>📋 Basic Information</h2>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="info-label">Name:</span>
                                <span className="info-value">{pkg.name}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Version:</span>
                                <span className="info-value">{pkg.version}</span>
                            </div>
                            {pkg.user && (
                                <div className="info-item">
                                    <span className="info-label">User:</span>
                                    <span className="info-value">{pkg.user}</span>
                                </div>
                            )}
                            {pkg.channel && (
                                <div className="info-item">
                                    <span className="info-label">Channel:</span>
                                    <span className="info-value">{pkg.channel}</span>
                                </div>
                            )}
                            <div className="info-item">
                                <span className="info-label">Created:</span>
                                <span className="info-value">{formatDate(pkg.created)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    {pkg.description && (
                        <div className="detail-section">
                            <h2>📝 Description</h2>
                            <p className="description">{pkg.description}</p>
                        </div>
                    )}

                    {/* Additional Info */}
                    <div className="detail-section">
                        <h2>ℹ️ Additional Information</h2>
                        <div className="info-grid">
                            {pkg.author && (
                                <div className="info-item">
                                    <span className="info-label">Author:</span>
                                    <span className="info-value">{pkg.author}</span>
                                </div>
                            )}
                            {pkg.license && (
                                <div className="info-item">
                                    <span className="info-label">License:</span>
                                    <span className="info-value">{pkg.license}</span>
                                </div>
                            )}
                            {pkg.homepage && (
                                <div className="info-item">
                                    <span className="info-label">Homepage:</span>
                                    <span className="info-value">
                                        <a href={pkg.homepage} target="_blank" rel="noopener noreferrer">
                                            {pkg.homepage}
                                        </a>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Requirements */}
                    {pkg.requires.length > 0 && (
                        <div className="detail-section">
                            <h2>📦 Requirements</h2>
                            <div className="requirements-list">
                                {pkg.requires.map((req, index) => (
                                    <span key={index} className="requirement-badge">
                                        {req}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Settings */}
                    {renderObjectAsTable(pkg.settings, '⚙️ Settings')}

                    {/* Options */}
                    {renderObjectAsTable(pkg.options, '🔧 Options')}

                    {/* Path Information */}
                    <div className="detail-section">
                        <h2>📁 Path Information</h2>
                        <div className="path-info">
                            <code>{pkg.path}</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PackageDetail;
