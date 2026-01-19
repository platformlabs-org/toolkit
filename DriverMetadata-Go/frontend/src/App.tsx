import { useState, useEffect, useMemo, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import DriverList from './components/DriverList';
import MetadataView from './components/MetadataView';
import VendorFilter from './components/VendorFilter';
import AboutModal from './components/AboutModal';
import { DriverInfo, SortConfig, SortKey } from './types';
// @ts-ignore
import { GetSystemDrivers, ScanFolder, ScanFile } from '../wailsjs/go/main/App';

const compareVersions = (v1: string, v2: string): number => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;

    const parts1 = v1.split('.').map(p => parseInt(p, 10));
    const parts2 = v2.split('.').map(p => parseInt(p, 10));

    const length = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < length; i++) {
        const num1 = isNaN(parts1[i]) ? 0 : parts1[i];
        const num2 = isNaN(parts2[i]) ? 0 : parts2[i];

        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }

    return 0;
};

function App() {
    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [selected, setSelected] = useState<DriverInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("Ready");

    // Sorting State
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'deviceName', direction: 'asc' });

    // Vendor Filter State
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [availableVendors, setAvailableVendors] = useState<string[]>([]);

    // Resizer State
    const [rightPanelWidth, setRightPanelWidth] = useState(450);
    const [isDragging, setIsDragging] = useState(false);

    // About Modal State
    const [showAbout, setShowAbout] = useState(false);

    // Disable Context Menu
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        window.addEventListener('contextmenu', handleContextMenu);
        return () => window.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    // Filter Logic
    const filteredDrivers = useMemo(() => {
        if (selectedVendors.length === 0) return drivers;
        return drivers.filter(d => {
            // Check manufacturer
            const mfg = (d.manufacturer || "").toLowerCase();
            return selectedVendors.some(v => mfg.includes(v.toLowerCase()));
        });
    }, [drivers, selectedVendors]);

    // Sorting Logic
    const sortedDrivers = useMemo(() => {
        const sorted = [...filteredDrivers];
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
    }, [filteredDrivers, sortConfig]);

    const handleSort = useCallback((key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    // Global Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (sortedDrivers.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const currentIndex = selected ? sortedDrivers.indexOf(selected) : -1;
                if (currentIndex === -1) {
                    setSelected(sortedDrivers[0]);
                } else if (currentIndex < sortedDrivers.length - 1) {
                    setSelected(sortedDrivers[currentIndex + 1]);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const currentIndex = selected ? sortedDrivers.indexOf(selected) : -1;
                if (currentIndex === -1) {
                    setSelected(sortedDrivers[0]);
                } else if (currentIndex > 0) {
                    setSelected(sortedDrivers[currentIndex - 1]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sortedDrivers, selected]);

    // Splitter Drag Logic
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const newWidth = window.innerWidth - e.clientX;
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.6; // 60%

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                setRightPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.body.style.cursor = 'default';
        };

        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        e.preventDefault();
    };

    // Update Available Vendors & Default Selection
    useEffect(() => {
        if (drivers.length > 0) {
            // Extract unique manufacturers or just use preset popular ones?
            // User requested: Lenovo, Intel, Nvidia, AMD, Microsoft
            const presets = ["Lenovo", "Intel", "Nvidia", "AMD", "Microsoft"];
            setAvailableVendors(presets);
        }
    }, [drivers]);

    // Auto-scan on startup
    useEffect(() => {
        handleSystemScan();
    }, []);

    // Helper to filter invalid drivers (empty DeviceName)
    const filterValidDrivers = (list: DriverInfo[]) => {
        if (!list) return [];
        return list.filter(d => d.deviceName && d.deviceName.trim() !== "");
    };

    const handleSystemScan = async () => {
        setLoading(true);
        setStatus("Scanning system drivers...");
        try {
            const res = await GetSystemDrivers();
            const valid = filterValidDrivers(res);
            setDrivers(valid);
            setSelected(null);
            setStatus(`Found ${valid.length} drivers.`);
        } catch (e) {
            setStatus("Error: " + String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleFolderScan = async () => {
        setLoading(true);
        setStatus("Selecting folder...");
        try {
            const res = await ScanFolder();
            if (res) {
                const valid = filterValidDrivers(res);
                setDrivers(valid);
                setSelected(null);
                setStatus(`Found ${valid.length} cat files.`);
            } else {
                setStatus("Cancelled.");
            }
        } catch (e) {
            setStatus("Error: " + String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleFileScan = async () => {
        setLoading(true);
        setStatus("Selecting file...");
        try {
            const res = await ScanFile();
            if (res) {
                const valid = filterValidDrivers(res);
                setDrivers(valid);
                setSelected(null);
                setStatus(`Parsed file.`);
            } else {
                setStatus("Cancelled.");
            }
        } catch (e) {
            setStatus("Error: " + String(e));
        } finally {
            setLoading(false);
        }
    };

    const btnStyle = {
        padding: '6px 12px',
        backgroundColor: '#007acc',
        color: 'white',
        border: 'none',
        borderRadius: '2px',
        cursor: loading ? 'wait' : 'pointer',
        fontSize: '13px',
        opacity: loading ? 0.7 : 1
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#1e1e1e' }}>
            <TitleBar onAboutClick={() => setShowAbout(true)} />

            <div style={{ padding: '8px', backgroundColor: '#2d2d2d', display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid #1e1e1e' }}>
                <button style={btnStyle} onClick={handleSystemScan} disabled={loading}>Scan System Drivers</button>
                <button style={{...btnStyle, backgroundColor: '#3e3e42'}} onClick={handleFolderScan} disabled={loading}>Scan Folder</button>
                <button style={{...btnStyle, backgroundColor: '#3e3e42'}} onClick={handleFileScan} disabled={loading}>Scan File</button>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#454545', margin: '0 5px' }}></div>

                <VendorFilter
                    vendors={availableVendors}
                    selected={selectedVendors}
                    onChange={setSelectedVendors}
                />

                <span style={{ marginLeft: 'auto', color: '#ccc', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                    {loading && <span style={{marginRight: '8px'}}>&#8987;</span>}
                    {status}
                </span>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <DriverList
                    drivers={sortedDrivers}
                    selected={selected}
                    onSelect={setSelected}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                />

                {/* Splitter */}
                <div
                    onMouseDown={handleMouseDown}
                    style={{
                        width: '4px',
                        cursor: 'col-resize',
                        backgroundColor: isDragging ? '#007acc' : '#333',
                        zIndex: 10,
                        transition: 'background-color 0.2s'
                    }}
                />

                {/* Right Panel for Details */}
                <div style={{ width: `${rightPanelWidth}px`, display: 'flex', flexDirection: 'column' }}>
                    <MetadataView driver={selected} />
                </div>
            </div>

            {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        </div>
    );
}

export default App;
