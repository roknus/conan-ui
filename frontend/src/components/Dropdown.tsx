import React, { useEffect, useRef, useState } from 'react';
import './Dropdown.css';

export interface DropdownItem {
    /** Value handed back to onSelect when this item is chosen */
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
    /** Selected value (select variant) or current route (menu variant) — styled active */
    active?: boolean;
}

interface DropdownProps {
    /** Content shown in the closed trigger (current value, or a fixed name) */
    trigger: React.ReactNode;
    items: DropdownItem[];
    onSelect: (value: string) => void;
    /** 'select' = value picker (listbox roles + checkmarks); 'menu' = navigation actions */
    variant?: 'select' | 'menu';
    /** Which edge of the trigger the panel aligns to */
    align?: 'left' | 'right';
    /** Accessible label for the trigger button */
    ariaLabel?: string;
    className?: string;
}

// Shared dropdown used by both the repository selector and the Administration
// menu, so they look and behave identically. Supports mouse, outside-click /
// Escape dismissal, and arrow-key / Home / End keyboard navigation with roving
// focus. The 'select' variant adds listbox semantics + a checkmark on the
// active value; the 'menu' variant is a plain navigation menu.
const Dropdown: React.FC<DropdownProps> = ({
    trigger,
    items,
    onSelect,
    variant = 'menu',
    align = 'left',
    ariaLabel,
    className,
}) => {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const isSelect = variant === 'select';
    const enabledIndexes = items.reduce<number[]>((acc, it, i) => {
        if (!it.disabled) acc.push(i);
        return acc;
    }, []);

    const openMenu = (focus: 'first' | 'last' | 'selected') => {
        setOpen(true);
        if (focus === 'selected') {
            const sel = items.findIndex((it) => it.active && !it.disabled);
            setActiveIndex(sel >= 0 ? sel : enabledIndexes[0] ?? -1);
        } else if (focus === 'last') {
            setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        } else {
            setActiveIndex(enabledIndexes[0] ?? -1);
        }
    };

    const closeMenu = (refocusTrigger = true) => {
        setOpen(false);
        setActiveIndex(-1);
        if (refocusTrigger) triggerRef.current?.focus();
    };

    // Move focus to the active item as it changes
    useEffect(() => {
        if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus();
    }, [open, activeIndex]);

    // Dismiss on outside click
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    const move = (dir: 1 | -1) => {
        if (enabledIndexes.length === 0) return;
        const pos = enabledIndexes.indexOf(activeIndex);
        const next =
            pos < 0
                ? dir === 1
                    ? enabledIndexes[0]
                    : enabledIndexes[enabledIndexes.length - 1]
                : enabledIndexes[(pos + dir + enabledIndexes.length) % enabledIndexes.length];
        setActiveIndex(next);
    };

    const onTriggerKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                open ? move(1) : openMenu('selected');
                break;
            case 'ArrowUp':
                e.preventDefault();
                open ? move(-1) : openMenu('last');
                break;
            case 'Enter':
            case ' ':
                if (!open) {
                    e.preventDefault();
                    openMenu('selected');
                }
                break;
            case 'Escape':
                if (open) {
                    e.preventDefault();
                    closeMenu();
                }
                break;
            default:
                break;
        }
    };

    const onItemKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                move(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                move(-1);
                break;
            case 'Home':
                e.preventDefault();
                setActiveIndex(enabledIndexes[0] ?? -1);
                break;
            case 'End':
                e.preventDefault();
                setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
                break;
            case 'Escape':
                e.preventDefault();
                closeMenu();
                break;
            case 'Tab':
                // Let focus leave naturally, but close the panel
                setOpen(false);
                setActiveIndex(-1);
                break;
            default:
                break;
        }
    };

    const select = (item: DropdownItem) => {
        if (item.disabled) return;
        onSelect(item.value);
        closeMenu();
    };

    return (
        <div className={`dropdown ${className || ''}`} ref={rootRef}>
            <button
                ref={triggerRef}
                type="button"
                className="dropdown-trigger"
                aria-haspopup={isSelect ? 'listbox' : 'menu'}
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => (open ? closeMenu(false) : openMenu('selected'))}
                onKeyDown={onTriggerKeyDown}
            >
                <span className="dropdown-trigger-label">{trigger}</span>
                <span className={`dropdown-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className={`dropdown-panel align-${align}`} role={isSelect ? 'listbox' : 'menu'}>
                    {items.map((item, idx) => (
                        <button
                            key={item.value}
                            ref={(el) => {
                                itemRefs.current[idx] = el;
                            }}
                            type="button"
                            role={isSelect ? 'option' : 'menuitem'}
                            aria-selected={isSelect ? !!item.active : undefined}
                            aria-disabled={item.disabled || undefined}
                            disabled={item.disabled}
                            tabIndex={-1}
                            className={`dropdown-item ${item.active ? 'active' : ''}`}
                            onClick={() => select(item)}
                            onKeyDown={onItemKeyDown}
                        >
                            {isSelect && (
                                <span className="dropdown-check" aria-hidden="true">
                                    {item.active ? '✓' : ''}
                                </span>
                            )}
                            <span className="dropdown-item-label">{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dropdown;
