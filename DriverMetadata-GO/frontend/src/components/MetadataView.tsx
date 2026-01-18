import React, { useState } from 'react';
import { DriverInfo } from '../types';

// @ts-ignore
import { ClipboardSetText } from '../../wailsjs/runtime/runtime';

interface MetadataViewProps {
    driver: DriverInfo | null;
}

const MetadataView: React.FC<MetadataViewProps> = ({ driver }) => {
    const [copyFeedback, setCopyFeedback] = useState("");

    if (!driver) {
        return <div style={{ padding: '20px', color: '#666' }}>Select a driver to view details</div>;
    }

    const handleCopy = () => {
        const lines = [];
        lines.push(`[DEVICE] ${driver.deviceName}`);
        lines.push(` ├─ Version: ${driver.version} | Manufacturer: ${driver.manufacturer}`);
        lines.push(` ├─ Inf Name: ${driver.infName}`);
        lines.push(` ├─ Catalog: ${driver.catalogPath || 'N/A'}`);
        lines.push(` ├─ PnP DeviceID: ${driver.pnpDeviceId}`);

        if (driver.displayMatchedHardwareId) {
             lines.push(` ├─ Matched HWID (DISPLAY): ${driver.displayMatchedHardwareId}`);
        } else if (driver.rawMatchedHardwareId) {
             lines.push(` ├─ Matched HWID (RAW): ${driver.rawMatchedHardwareId}`);
        }

        lines.push(` ├─ HardwareID(s):`);
        if (driver.hardwareIds && driver.hardwareIds.length > 0) {
            driver.hardwareIds.forEach(hid => {
                const matchTag = (hid === driver.rawMatchedHardwareId || hid === driver.displayMatchedHardwareId) ? " [HIT ID]" : "";
                lines.push(` │   ► ${hid}${matchTag}`);
            });
        } else {
             lines.push(` │   (None)`);
        }

        if (driver.metadata && Object.keys(driver.metadata).length > 0) {
             lines.push(` └─ CAT Metadata:`);
             Object.entries(driver.metadata).forEach(([k, v]) => {
                 lines.push(`    > ${k.padEnd(22)} : ${v}`);
             });
        } else {
             lines.push(` └─ CAT Metadata: (None)`);
        }

        const text = lines.join('\n');

        // Use Wails runtime clipboard if available, fallback to navigator
        try {
            if (typeof ClipboardSetText === 'function') {
                ClipboardSetText(text);
            } else {
                navigator.clipboard.writeText(text);
            }
            setCopyFeedback("Copied!");
            setTimeout(() => setCopyFeedback(""), 2000);
        } catch (err) {
            console.error("Copy failed", err);
            setCopyFeedback("Error");
        }
    };

    return (
        <div style={{ flex: 1, overflow: 'auto', padding: '10px', backgroundColor: '#1e1e1e', color: '#d4d4d4', fontSize: '13px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#4ec9b0', fontSize: '16px' }}>{driver.deviceName}</h3>
                <button
                    onClick={handleCopy}
                    style={{
                        padding: '4px 10px',
                        backgroundColor: '#2d2d2d',
                        border: '1px solid #454545',
                        color: '#ccc',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3e3e42'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2d2d2d'}
                >
                    Copy All {copyFeedback && <span style={{ color: '#6a9955', marginLeft: '4px' }}>&#10003; {copyFeedback}</span>}
                </button>
            </div>

            <div style={sectionStyle}>
                <strong style={headerStyle}>General Info</strong>
                <div style={rowStyle}><span style={labelStyle}>Manufacturer:</span> {driver.manufacturer}</div>
                <div style={rowStyle}><span style={labelStyle}>Version:</span> {driver.version}</div>
                <div style={rowStyle}><span style={labelStyle}>Inf Name:</span> {driver.infName}</div>
                <div style={rowStyle}><span style={labelStyle}>Catalog:</span> {driver.catalogPath || 'N/A'}</div>
                <div style={rowStyle}><span style={labelStyle}>PnP Device ID:</span> {driver.pnpDeviceId}</div>
            </div>

            <div style={sectionStyle}>
                <strong style={headerStyle}>Hardware IDs</strong>
                <ul style={{ margin: '5px 0', paddingLeft: '20px', fontFamily: 'monospace' }}>
                    {driver.hardwareIds?.map((id, i) => (
                        <li key={i} style={{
                            color: id === driver.rawMatchedHardwareId || id === driver.displayMatchedHardwareId ? '#ce9178' : 'inherit'
                        }}>
                            {id} {(id === driver.rawMatchedHardwareId || id === driver.displayMatchedHardwareId) && <span style={{fontSize: '0.8em', color: '#6a9955'}}> (Match)</span>}
                        </li>
                    ))}
                    {(!driver.hardwareIds || driver.hardwareIds.length === 0) && <li>(None)</li>}
                </ul>
            </div>

            <div style={sectionStyle}>
                <strong style={headerStyle}>CAT Metadata</strong> <span style={{color: '#666'}}>(1.3.6.1.4.1.311.12.2.1)</span>
                {Object.keys(driver.metadata || {}).length === 0 ? (
                    <div style={{ color: '#888', fontStyle: 'italic', padding: '5px' }}>No metadata found</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '5px' }}>
                        <tbody>
                            {Object.entries(driver.metadata).map(([k, v], i) => (
                                <tr key={i}>
                                    <td style={{ ...tdMetaStyle, color: '#569cd6' }}>{k}</td>
                                    <td style={tdMetaStyle}>{v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const sectionStyle: React.CSSProperties = {
    marginBottom: '15px'
};

const headerStyle: React.CSSProperties = {
    display: 'block',
    borderBottom: '1px solid #333',
    paddingBottom: '2px',
    marginBottom: '5px',
    color: '#ccc'
};

const rowStyle: React.CSSProperties = {
    marginBottom: '3px'
};

const labelStyle: React.CSSProperties = {
    color: '#9cdcfe',
    display: 'inline-block',
    width: '120px'
};

const tdMetaStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: '1px solid #333',
    fontFamily: 'monospace',
    verticalAlign: 'top'
};

export default MetadataView;
