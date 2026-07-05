import React from 'react';
import './PropertiesTable.css';

export interface PropertyRow {
    label: React.ReactNode;
    value: React.ReactNode;
}

interface PropertiesTableProps {
    rows: PropertyRow[];
    /** Extra class on the wrapper, e.g. for width tweaks per page. */
    className?: string;
}

/** Build rows from a plain object; objects/arrays in values are JSON-stringified. */
export const objectToRows = (obj: Record<string, unknown>): PropertyRow[] =>
    Object.entries(obj).map(([key, value]) => ({
        label: key,
        value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    }));

/**
 * A key/value table with a vertical divider between the label and value columns.
 * Values are rendered verbatim, so callers can pass links, badges, etc.
 */
const PropertiesTable: React.FC<PropertiesTableProps> = ({ rows, className }) => {
    if (rows.length === 0) return null;

    return (
        <div className={`properties-table${className ? ` ${className}` : ''}`}>
            {rows.map((row, index) => (
                <div key={index} className="property-row">
                    <span className="property-key">{row.label}</span>
                    <span className="property-value">{row.value}</span>
                </div>
            ))}
        </div>
    );
};

export default PropertiesTable;
