import React from 'react';
import { DriverInfo } from '../types';

interface DriverListProps {
    drivers: DriverInfo[];
    selected: DriverInfo | null;
    onSelect: (driver: DriverInfo) => void;
}

const DriverList: React.FC<DriverListProps> = ({ drivers, selected, onSelect }) => {
    return (
        <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#252526', color: '#ccc' }}>
                    <tr>
                        <th style={thStyle}>Device Name</th>
                        <th style={thStyle}>Version</th>
                        <th style={thStyle}>Matched HWID</th>
                        <th style={thStyle}>Inf Name</th>
                    </tr>
                </thead>
                <tbody>
                    {drivers.map((d, i) => (
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
