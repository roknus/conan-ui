import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PackageList from './PackageList';
import { ConanPackageInfo } from '../types/conan';

// Helper to generate mock packages
function makePackages(count: number): ConanPackageInfo[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `package-${i + 1}`,
        latest_version: '1.0.0',
        // Use a count that won't collide with page-number text in queries
        total_versions: 99,
        created: Date.now() / 1000,
    }));
}

describe('PackageList', () => {
    const onPackageSelect = jest.fn();
    const onPageChange = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders empty state when no packages', () => {
        render(<PackageList packages={[]} onPackageSelect={onPackageSelect} />);
        expect(screen.getByText(/No packages found/)).toBeInTheDocument();
    });

    it('renders packages without pagination when totalPackages <= perPage', () => {
        const packages = makePackages(5);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={5}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        expect(screen.getByText('5 packages')).toBeInTheDocument();
        expect(screen.queryByText('← Prev')).not.toBeInTheDocument();
    });

    it('shows total from totalPackages prop, not packages.length', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={55}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        // Should show total (55), not the current page count (20)
        expect(screen.getByText('55 packages')).toBeInTheDocument();
    });

    it('renders pagination controls when totalPackages > perPage', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={45}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        expect(screen.getByText('← Prev')).toBeInTheDocument();
        expect(screen.getByText('Next →')).toBeInTheDocument();
        // 3 pages: 1, 2, 3
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('disables Previous button on first page', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={45}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        expect(screen.getByText('← Prev')).toBeDisabled();
        expect(screen.getByText('Next →')).not.toBeDisabled();
    });

    it('disables Next button on last page', () => {
        const packages = makePackages(5);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={45}
                perPage={20}
                currentPage={3}
                onPageChange={onPageChange}
            />
        );
        expect(screen.getByText('Next →')).toBeDisabled();
        expect(screen.getByText('← Prev')).not.toBeDisabled();
    });

    it('calls onPageChange when clicking Next', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={45}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        fireEvent.click(screen.getByText('Next →'));
        expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange when clicking Previous', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={60}
                perPage={20}
                currentPage={2}
                onPageChange={onPageChange}
            />
        );
        fireEvent.click(screen.getByText('← Prev'));
        expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange when clicking a page number', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={60}
                perPage={20}
                currentPage={1}
                onPageChange={onPageChange}
            />
        );
        fireEvent.click(screen.getByText('3'));
        expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('highlights current page button as active', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={60}
                perPage={20}
                currentPage={2}
                onPageChange={onPageChange}
            />
        );
        const page2Button = screen.getByText('2');
        expect(page2Button).toHaveClass('active');
        const page1Button = screen.getByText('1');
        expect(page1Button).not.toHaveClass('active');
    });

    it('shows ellipsis for many pages', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={200}
                perPage={20}
                currentPage={5}
                onPageChange={onPageChange}
            />
        );
        // Should show ellipsis between non-consecutive page groups
        const ellipses = screen.getAllByText('…');
        expect(ellipses.length).toBeGreaterThan(0);
    });

    it('calls onPackageSelect when clicking a package row', () => {
        const packages = makePackages(3);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
            />
        );
        fireEvent.click(screen.getByText('package-2'));
        expect(onPackageSelect).toHaveBeenCalledWith(packages[1]);
    });

    it('renders long package names on a single non-wrapping line', () => {
        const longNamePackages: ConanPackageInfo[] = [
            {
                name: 'ecs_multiplayer_framework_with_extremely_long_package_name',
                latest_version: '0.0.0-master+b068a385',
                total_versions: 10,
                created: Date.now() / 1000,
            },
        ];
        render(
            <PackageList
                packages={longNamePackages}
                onPackageSelect={onPackageSelect}
            />
        );
        const nameElement = screen.getByText('ecs_multiplayer_framework_with_extremely_long_package_name');
        expect(nameElement).toBeInTheDocument();
        // The name cell carries the class responsible for single-line ellipsis truncation
        expect(nameElement).toHaveClass('pkg-name');
        // And lives inside a clickable card
        const card = nameElement.closest('.package-card');
        expect(card).toBeInTheDocument();
    });

    it('renders latest version and versions count alongside the name', () => {
        const packages: ConanPackageInfo[] = [
            {
                name: 'a_very_long_conan_package_name_that_should_not_break_the_layout',
                latest_version: '2.0.0',
                total_versions: 5,
                created: Date.now() / 1000,
            },
        ];
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
            />
        );
        const nameElement = screen.getByText('a_very_long_conan_package_name_that_should_not_break_the_layout');
        expect(nameElement).toBeInTheDocument();
        // Version count badge and latest version are shown in the card meta
        expect(screen.getByText('5 versions')).toBeInTheDocument();
        expect(screen.getByText('2.0.0')).toBeInTheDocument();
    });

    it('highlights the matched portion of the name when a query is given', () => {
        const packages: ConanPackageInfo[] = [
            {
                name: 'boost',
                latest_version: '1.83.0',
                total_versions: 3,
                created: Date.now() / 1000,
            },
        ];
        const { container } = render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                highlight="oo"
            />
        );
        const mark = container.querySelector('mark.pkg-match');
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveTextContent('oo');
    });

    it('renders multiple packages with long names as separate cards', () => {
        const longNamePackages: ConanPackageInfo[] = [
            {
                name: 'short',
                latest_version: '1.0.0',
                total_versions: 1,
                created: Date.now() / 1000,
            },
            {
                name: 'ecs_protobuf_plugin_with_extra_long_suffix_name',
                latest_version: '0.0.0-master+80363cca',
                total_versions: 23,
                created: Date.now() / 1000,
            },
        ];
        render(
            <PackageList
                packages={longNamePackages}
                onPackageSelect={onPackageSelect}
            />
        );
        expect(screen.getByText('short')).toBeInTheDocument();
        expect(screen.getByText('ecs_protobuf_plugin_with_extra_long_suffix_name')).toBeInTheDocument();
        // One card per package
        const cards = document.querySelectorAll('.package-card');
        expect(cards).toHaveLength(2);
    });

    it('does not render pagination when onPageChange is not provided', () => {
        const packages = makePackages(20);
        render(
            <PackageList
                packages={packages}
                onPackageSelect={onPackageSelect}
                totalPackages={45}
                perPage={20}
                currentPage={1}
            />
        );
        expect(screen.queryByText('← Prev')).not.toBeInTheDocument();
    });
});
