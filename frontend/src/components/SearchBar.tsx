import React, { useState } from 'react';
import { FaMagnifyingGlass, FaXmark } from './icons';
import './SearchBar.css';

interface SearchBarProps {
    onSearch: (query: string) => void;
    /** Clear the search. Falls back to onSearch('') when not provided. */
    onClear?: () => void;
    initialValue?: string;
    initialQuery?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, onClear, initialValue = '', initialQuery = '' }) => {
    const [query, setQuery] = useState(initialValue || initialQuery);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
    };

    const handleClear = () => {
        setQuery('');
        if (onClear) {
            onClear();
        } else {
            onSearch('');
        }
    };

    return (
        <div className="search-bar">
            <form onSubmit={handleSubmit} className="search-form">
                <div className="search-input-container">
                    <FaMagnifyingGlass className="search-icon" aria-hidden />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search for Conan packages..."
                        className="search-input"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="clear-button"
                            aria-label="Clear search"
                        >
                            <FaXmark />
                        </button>
                    )}
                </div>
                <button type="submit" className="search-button">
                    Search
                </button>
            </form>
        </div>
    );
};

export default SearchBar;
