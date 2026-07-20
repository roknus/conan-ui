import React from 'react';
import { ConanPackageDetail } from '../types/conan';
import { formatDate } from '../utils/dateUtils';
import { FaArrowLeft, FaClipboardList, FaAlignLeft, FaCircleInfo, FaCubes, FaGear, FaSliders, FaFolder, FaFingerprint, FaTags } from './icons';
import PropertiesTable, { objectToRows, PropertyRow } from './PropertiesTable';
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
    
    const renderObjectAsTable = (obj: Record<string, any>, title: React.ReactNode) => {
        if (Object.keys(obj).length === 0) return null;

        return (
            <div className="detail-section">
                <h3>{title}</h3>
                <PropertiesTable rows={objectToRows(obj)} />
            </div>
        );
    };

    return (
        <div className="package-detail-container">
            <div className="detail-header">
                <button onClick={handleClose} className="back-button">
                    <FaArrowLeft /> Back to list
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
                        <h2><FaClipboardList /> Basic Information</h2>
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

                    {/* Reference / Identity */}
                    {(() => {
                        const referenceRows: PropertyRow[] = [
                            ...(pkg.recipe_revision ? [{ label: 'Recipe revision', value: pkg.recipe_revision }] : []),
                            ...(pkg.package_id ? [{ label: 'Package ID', value: pkg.package_id }] : []),
                            ...(pkg.package_revision ? [{ label: 'Package revision', value: pkg.package_revision }] : []),
                        ];
                        if (referenceRows.length === 0) return null;
                        return (
                            <div className="detail-section">
                                <h2><FaFingerprint /> Reference</h2>
                                <PropertiesTable rows={referenceRows} />
                            </div>
                        );
                    })()}

                    {/* Description */}
                    {pkg.description && (
                        <div className="detail-section">
                            <h2><FaAlignLeft /> Description</h2>
                            <p className="description">{pkg.description}</p>
                        </div>
                    )}

                    {/* Additional Info */}
                    <div className="detail-section">
                        <h2><FaCircleInfo /> Additional Information</h2>
                        {(pkg.author || pkg.license || pkg.homepage || pkg.url) ? (
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
                                {pkg.url && (
                                    <div className="info-item">
                                        <span className="info-label">Recipe URL:</span>
                                        <span className="info-value">
                                            <a href={pkg.url} target="_blank" rel="noopener noreferrer">
                                                {pkg.url}
                                            </a>
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="empty-note">No additional metadata is published for this recipe.</p>
                        )}
                    </div>

                    {/* Topics */}
                    {pkg.topics && pkg.topics.length > 0 && (
                        <div className="detail-section">
                            <h2><FaTags /> Topics</h2>
                            <div className="requirements-list">
                                {pkg.topics.map((topic, index) => (
                                    <span key={index} className="topic-badge">
                                        {topic}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Requirements */}
                    {pkg.requires.length > 0 && (
                        <div className="detail-section">
                            <h2><FaCubes /> Requirements</h2>
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
                    {renderObjectAsTable(pkg.settings, <><FaGear /> Settings</>)}

                    {/* Options */}
                    {renderObjectAsTable(pkg.options, <><FaSliders /> Options</>)}

                    {/* Path Information */}
                    <div className="detail-section">
                        <h2><FaFolder /> Path Information</h2>
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
