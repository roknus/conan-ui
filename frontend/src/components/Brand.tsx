import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

// Clickable app brand — returns to the current remote's package list
const Brand: React.FC = () => {
    const navigate = useNavigate();
    const { remote } = useRemote();

    const handleClick = () => {
        navigate(paths.root(remote));
    };

    return (
        <button type="button" className="brand" onClick={handleClick}>
            Conan UI
        </button>
    );
};

export default Brand;
