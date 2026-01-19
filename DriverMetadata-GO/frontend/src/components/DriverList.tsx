import React, { useState, useMemo } from 'react';
import { DriverInfo } from '../types';

interface DriverListProps {
    drivers: DriverInfo[];
    selected: DriverInfo | null;
    onSelect: (driver: DriverInfo) => void;
}

type SortKey = 'deviceName' | 'version' | 'displayMatchedHardwareId' | 'infName';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

const compareVersions = (v1: string, v2: string): number => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;

    // Handle standard versions but also be robust against non-numeric parts if any
    const parts1 = v1.split('.').map(p => parseInt(p, 10));
    const parts2 = v2.split('.').map(p => parseInt(p, 10));

    const length = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < length; i++) {
        // Treat missing parts as 0 (e.g. 1.0 == 1.0.0)
        const num1 = isNaN(parts1[i]) ? 0 : parts1[i];
        const num2 = isNaN(parts2[i]) ? 0 : parts2[i];

        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }

    return 0;
};

const DriverList: React.FC<DriverListProps> = ({ drivers, selected, onSelect }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'deviceName', direction: 'asc' });

    const sortedDrivers = useMemo(() => {
        const sorted = [...drivers];
        sorted.sort((a, b) => {
            let comparison = 0;
            if (sortConfig.key === 'version') {
                comparison = compareVersions(a.version, b.version);
            } else {
                const valA = (a[sortConfig.key] || '').toString().toLowerCase();
                const valB = (b[sortConfig.key] || '').toString().toLowerCase();
                if (valA > valB) comparison = 1;
                if (valA < valB) comparison = -1;
            }
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [drivers, sortConfig]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const renderHeader = (label: string, key: SortKey) => (
        <th
            style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => handleSort(key)}
        >
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {label}
                {sortConfig.key === key && (
                    <span style={{ marginLeft: '5px', fontSize: '10px' }}>
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                    </span>
                )}
            </div>
        </th>
    );

    return (
        <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#252526', color: '#ccc', zIndex: 1 }}>
                    <tr>
                        {renderHeader('Device Name', 'deviceName')}
                        {renderHeader('Version', 'version')}
                        {renderHeader('Matched HWID', 'displayMatchedHardwareId')}
                        {renderHeader('Inf Name', 'infName')}
                    </tr>
                </thead>
                <tbody>
                    {sortedDrivers.map((d, i) => (
                        <tr
                            key={i}
                            onClick={() => onSelect(d)}
                            style={{
                                backgroundColor: selected === d ? '#37373d' : (i % 2 === 0 ? '#1e1e1e' : '#252526'),
                                cursor: 'pointer',
                                color: '#d4d4d4'
                            }}
                        >
                            <td style={tdStyle}>{d.deviceName}</td>
                            <td style={tdStyle}>{d.version || 'N/A'}</td>
                            <td style={tdStyle}>{d.displayMatchedHardwareId}</td>
                            <td style={tdStyle}>{d.infName}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const thStyle: React.CSSProperties = {
    padding: '8px',
    borderBottom: '1px solid #333',
    fontWeight: 'normal'
};

const tdStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: '1px solid #333',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px'
};

export default DriverList;
