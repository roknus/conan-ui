import React from 'react';
import { IconType } from 'react-icons';
import { FaLinux, FaWindows, FaApple, FaAndroid, FaFreebsd } from 'react-icons/fa6';
import { SiWasmer } from 'react-icons/si';

// Maps Conan `os` setting values (case-insensitive) to a platform brand icon.
// Apple covers the Darwin-family OSes; anything unmapped renders no icon and the
// caller falls back to just the text label.
const OS_ICONS: Record<string, IconType> = {
    linux: FaLinux,
    windows: FaWindows,
    windowsce: FaWindows,
    windowsstore: FaWindows,
    macos: FaApple,
    ios: FaApple,
    watchos: FaApple,
    tvos: FaApple,
    android: FaAndroid,
    freebsd: FaFreebsd,
    emscripten: SiWasmer,
};

// react-icons v5 types IconType as returning ReactNode, which TypeScript 4.9
// (this repo's pinned version) rejects as a JSX component (TS2786). Treating the
// icon as a plain SVG component sidesteps that without upgrading TypeScript.
type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;

interface OsIconProps {
    os?: string;
    className?: string;
}

// Renders the platform logo for a Conan OS value, or nothing when unrecognized.
const OsIcon: React.FC<OsIconProps> = ({ os, className }) => {
    if (!os) return null;
    const found = OS_ICONS[os.toLowerCase()];
    if (!found) return null;
    const Icon = found as unknown as SvgIcon;
    return <Icon className={className} aria-hidden />;
};

export default OsIcon;
