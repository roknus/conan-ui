import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { paths } from '../routes/paths';
import './AdminMenu.css';

interface AdminMenuProps {
    /** Remote in context — admin actions are scoped to it */
    remoteName: string;
}

interface AdminItem {
    label: string;
    icon: string;
    to: string;
    /** pathname suffix used to mark the item active */
    match: string;
}

// "Administration" dropdown in the top bar. Groups remote-scoped admin actions
// (currently just Cleanup) so they don't clutter the header. Add entries here.
const AdminMenu: React.FC<AdminMenuProps> = ({ remoteName }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const items: AdminItem[] = [
        { label: 'Cleanup', icon: '🧹', to: paths.cleanup(remoteName), match: '/cleanup' },
    ];

    // Close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const go = (to: string) => {
        setOpen(false);
        navigate(to);
    };

    return (
        <div className="admin-menu" ref={menuRef}>
            <button
                type="button"
                className="admin-menu-trigger"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                Administration
                <span className={`admin-menu-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className="admin-menu-dropdown" role="menu">
                    {items.map((item) => {
                        const active = location.pathname.endsWith(item.match);
                        return (
                            <button
                                key={item.to}
                                type="button"
                                role="menuitem"
                                className={`admin-menu-item ${active ? 'active' : ''}`}
                                onClick={() => go(item.to)}
                            >
                                <span className="admin-menu-item-icon" aria-hidden="true">{item.icon}</span>
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminMenu;
