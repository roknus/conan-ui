import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Dropdown, { DropdownItem } from './Dropdown';
import { useRemote } from '../context/RemoteContext';
import { paths } from '../routes/paths';

// "Administration" dropdown in the top bar. Groups remote-scoped admin actions
// (currently just Cleanup) so they don't clutter the header. Add entries here.
// Built on the shared Dropdown so it matches the repository selector exactly.
const AdminMenu: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { remote } = useRemote();

    const items: DropdownItem[] = [
        {
            value: paths.cleanup(remote),
            label: 'Cleanup',
            active: location.pathname.endsWith('/cleanup'),
        },
    ];

    return (
        <Dropdown
            variant="menu"
            trigger="Administration"
            ariaLabel="Administration"
            align="right"
            items={items}
            onSelect={(to) => navigate(to)}
        />
    );
};

export default AdminMenu;
