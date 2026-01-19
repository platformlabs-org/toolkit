import React, { useEffect, useRef } from 'react';
import { DriverInfo, SortConfig, SortKey } from '../types';

interface DriverListProps {
    drivers: DriverInfo[];
    selected: DriverInfo | null;
    onSelect: (driver: DriverInfo) => void;
    sortConfig: SortConfig;
    onSort: (key: SortKey) => void;
}

const DriverList: React.FC<DriverListProps> = ({ drivers, selected, onSelect, sortConfig, onSort }) => {
    const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

    useEffect(() => {
        if (selected) {
            const index = drivers.indexOf(selected);
            if (index !== -1 && rowRefs.current[index]) {
                rowRefs.current[index]?.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selected, drivers]);

    const renderHeader = (label: string, key: SortKey) => (
        <th
            style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => onSort(key)}
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
                    {drivers.map((d, i) => (
                        <tr
                            key={i}
                            ref={el => rowRefs.current[i] = el}
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
