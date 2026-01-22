import React, { useEffect, useRef, useState } from 'react';
import { DriverInfo, SortConfig, SortKey } from '../types';

interface DriverListProps {
    drivers: DriverInfo[];
    selectedDrivers: DriverInfo[];
    onSelectionChange: (drivers: DriverInfo[]) => void;
    sortConfig: SortConfig;
    onSort: (key: SortKey) => void;
}

const DriverList: React.FC<DriverListProps> = ({ drivers, selectedDrivers, onSelectionChange, sortConfig, onSort }) => {
    const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

    useEffect(() => {
        // Scroll to single selected item if needed
        if (selectedDrivers.length === 1) {
            const index = drivers.indexOf(selectedDrivers[0]);
            if (index !== -1 && rowRefs.current[index]) {
                rowRefs.current[index]?.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedDrivers, drivers]);

    const handleRowClick = (e: React.MouseEvent, driver: DriverInfo, index: number) => {
        // Prevent default text selection during shift-click
        if (e.shiftKey) {
             document.getSelection()?.removeAllRanges();
        }

        if (e.ctrlKey || e.metaKey) {
            // Toggle selection
            const isSelected = selectedDrivers.includes(driver);
            let newSelection;
            if (isSelected) {
                newSelection = selectedDrivers.filter(d => d !== driver);
            } else {
                newSelection = [...selectedDrivers, driver];
            }
            onSelectionChange(newSelection);
            setLastSelectedIndex(index);
        } else if (e.shiftKey && lastSelectedIndex !== -1) {
            // Range selection
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);

            // In Windows/standard lists, Shift+Click selects the range from Anchor to Current, replacing previous selection.
            const range = drivers.slice(start, end + 1);
            onSelectionChange(range);
        } else {
            // Single selection
            onSelectionChange([driver]);
            setLastSelectedIndex(index);
        }
    };

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
                    {drivers.map((d, i) => {
                        const isSelected = selectedDrivers.includes(d);
                        return (
                            <tr
                                key={i}
                                ref={el => rowRefs.current[i] = el}
                                onClick={(e) => handleRowClick(e, d, i)}
                                style={{
                                    backgroundColor: isSelected ? '#37373d' : (i % 2 === 0 ? '#1e1e1e' : '#252526'),
                                    cursor: 'pointer',
                                    color: '#d4d4d4'
                                }}
                            >
                                <td style={tdStyle}>{d.deviceName}</td>
                                <td style={tdStyle}>{d.version || 'N/A'}</td>
                                <td style={tdStyle}>{d.displayMatchedHardwareId}</td>
                                <td style={tdStyle}>{d.infName}</td>
                            </tr>
                        );
                    })}
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
