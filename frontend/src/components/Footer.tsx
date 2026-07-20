import React from 'react';
import { FaGithub } from './icons';

const REPO_URL = 'https://github.com/roknus/conan-ui';

// Static site footer shared by every page via Layout
const Footer: React.FC = () => (
    <footer className="App-footer">
        <a
            className="footer-link"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
        >
            <FaGithub aria-hidden="true" />
            <span>View on GitHub</span>
        </a>
    </footer>
);

export default Footer;
