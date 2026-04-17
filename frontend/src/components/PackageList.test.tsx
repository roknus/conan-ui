import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PackageList from './PackageList';
import { ConanPackageInfo } from '../types/conan';

// Helper to generate mock packages
function makePackages(count: number): ConanPackageInfo[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `package-${i + 1}`,
        latest_version: '1.0.0',
        total_versions: 1,
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
        expect(screen.getByText(/Found 5 packages/)).toBeInTheDocument();
        expect(screen.queryByText('← Previous')).not.toBeInTheDocument();
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
        expect(screen.getByText(/Found 55 packages/)).toBeInTheDocument();
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
        expect(screen.getByText('← Previous')).toBeInTheDocument();
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
        expect(screen.getByText('← Previous')).toBeDisabled();
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
        expect(screen.getByText('← Previous')).not.toBeDisabled();
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
        fireEvent.click(screen.getByText('← Previous'));
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

    it('calls onPackageSelect when clicking a package card', () => {
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

    it('renders long package names with proper CSS classes for overflow handling', () => {
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
        expect(nameElement).toHaveClass('package-name');
        // Verify the name is inside a flex-wrapping header
        const header = nameElement.closest('.package-header');
        expect(header).toBeInTheDocument();
    });

    it('renders package stats alongside long package names', () => {
        const longNamePackages: ConanPackageInfo[] = [
            {
                name: 'a_very_long_conan_package_name_that_should_not_break_the_layout',
                latest_version: '2.0.0',
                total_versions: 5,
                created: Date.now() / 1000,
            },
        ];
        render(
            <PackageList
                packages={longNamePackages}
                onPackageSelect={onPackageSelect}
            />
        );
        const nameElement = screen.getByText('a_very_long_conan_package_name_that_should_not_break_the_layout');
        expect(nameElement).toBeInTheDocument();
        // Stats should still be visible
        expect(screen.getByText('5 versions')).toBeInTheDocument();
        expect(screen.getByText('Latest: 2.0.0')).toBeInTheDocument();
        // Both name and stats should be inside the same card
        const card = nameElement.closest('.package-card');
        expect(card).toBeInTheDocument();
        expect(card).toContainElement(screen.getByText('5 versions'));
    });

    it('renders multiple packages with long names without breaking', () => {
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
        // All cards should be present
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
        expect(screen.queryByText('← Previous')).not.toBeInTheDocument();
    });
});
