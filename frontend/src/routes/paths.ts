// Centralized URL builders. The active remote is carried as a ?repo= query
// param (falling back to the default when absent) rather than a path segment,
// so switching repositories never rewrites the path. Keeping every route string
// in one place avoids the hand-written `/${encodeURIComponent(...)}` duplication
// that let params drift between the path and the query string.

const enc = encodeURIComponent;

export interface PackageViewOptions {
    version?: string;
    tab?: 'binaries' | 'versions';
}

// Assemble a path plus query string, always carrying the active remote as ?repo=.
const build = (
    path: string,
    remote: string,
    params: Record<string, string | undefined> = {}
): string => {
    const sp = new URLSearchParams();
    if (remote) sp.set('repo', remote);
    for (const [key, val] of Object.entries(params)) {
        if (val) sp.set(key, val);
    }
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
};

export const paths = {
    /** Package list for the active remote (the app root) */
    root: (remote: string) => build('/', remote),

    /** Package list, optionally with a search query */
    remote: (remote: string, query?: string) => build('/', remote, { q: query }),

    /** Bare package view (no version) */
    package: (remote: string, pkg: string) => build(`/${enc(pkg)}`, remote),

    /** Package view (binaries/versions tabs) at a given version */
    packageView: (remote: string, pkg: string, opts: PackageViewOptions = {}) =>
        build(`/${enc(pkg)}`, remote, {
            version: opts.version,
            tab: opts.tab === 'versions' ? 'versions' : undefined,
        }),

    /** Configuration/detail page for a specific binary */
    packageConfig: (remote: string, pkg: string) => build(`/${enc(pkg)}/package`, remote),

    /** Package cleanup tool */
    cleanup: (remote: string) => build('/cleanup', remote),
};
