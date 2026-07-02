import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { paths } from '../routes/paths';

// Clickable app brand — returns to the current remote's package list
const Brand: React.FC = () => {
    const navigate = useNavigate();
    const { remoteName } = useParams<{ remoteName?: string }>();

    const handleClick = () => {
        navigate(remoteName ? paths.remote(remoteName) : paths.root());
    };

    return (
        <button type="button" className="brand" onClick={handleClick}>
            Conan UI
        </button>
    );
};

export default Brand;
