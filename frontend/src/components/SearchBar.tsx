import React, { useState } from 'react';
import './SearchBar.css';

interface SearchBarProps {
    onSearch: (query: string) => void;
    initialValue?: string;
    initialQuery?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, initialValue = '', initialQuery = '' }) => {
    const [query, setQuery] = useState(initialValue || initialQuery);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
    };

    const handleClear = () => {
        setQuery('');
        onSearch('');
    };

    return (
        <div className="search-bar">
            <form onSubmit={handleSubmit} className="search-form">
                <div className="search-input-container">
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
                            ❌
                        </button>
                    )}
                </div>
                <button type="submit" className="search-button">
                    🔍 Search
                </button>
            </form>
        </div>
    );
};

export default SearchBar;
