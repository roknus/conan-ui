// Centralized URL builders. Keeping every route string in one place avoids the
// hand-written `/${encodeURIComponent(...)}` duplication that let the version
// param drift between the path and the query string.

const enc = encodeURIComponent;

export interface PackageViewOptions {
    version?: string;
    tab?: 'binaries' | 'versions';
}

export const paths = {
    /** Landing / remote selection */
    root: () => '/',

    /** A remote's package list, optionally with a search query */
    remote: (remote: string, query?: string) =>
        query ? `/${enc(remote)}?q=${enc(query)}` : `/${enc(remote)}`,

    /** Bare package path (no query) */
    package: (remote: string, pkg: string) => `/${enc(remote)}/${enc(pkg)}`,

    /** Package view (binaries/versions tabs) at a given version */
    packageView: (remote: string, pkg: string, opts: PackageViewOptions = {}) => {
        const params = new URLSearchParams();
        if (opts.version) params.set('version', opts.version);
        if (opts.tab === 'versions') params.set('tab', 'versions');
        const qs = params.toString();
        return qs ? `/${enc(remote)}/${enc(pkg)}?${qs}` : `/${enc(remote)}/${enc(pkg)}`;
    },

    /** Configuration/detail page for a specific binary */
    packageConfig: (remote: string, pkg: string) => `/${enc(remote)}/${enc(pkg)}/configuration`,

    /** Package cleanup tool for a remote */
    cleanup: (remote: string) => `/${enc(remote)}/cleanup`,
};
