import { useState, useEffect, useMemo } from 'react';
import TitleBar from './components/TitleBar';
import DriverList from './components/DriverList';
import MetadataView from './components/MetadataView';
import VendorFilter from './components/VendorFilter';
import AboutModal from './components/AboutModal';
import { DriverInfo } from './types';
// @ts-ignore
import { GetSystemDrivers, ScanFolder, ScanFile } from '../wailsjs/go/main/App';

function App() {
    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [selected, setSelected] = useState<DriverInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("Ready");

    // Vendor Filter State
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [availableVendors, setAvailableVendors] = useState<string[]>([]);

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

    // Update Available Vendors & Default Selection
    useEffect(() => {
        if (drivers.length > 0) {
            // Extract unique manufacturers or just use preset popular ones?
            // User requested: Lenovo, Intel, Nvidia, AMD, Microsoft
            const presets = ["Lenovo", "Intel", "Nvidia", "AMD", "Microsoft"];
            setAvailableVendors(presets);
        }
    }, [drivers]);

    const handleSystemScan = async () => {
        setLoading(true);
        setStatus("Scanning system drivers...");
        try {
            const res = await GetSystemDrivers();
            setDrivers(res || []);
            setSelected(null);
            setStatus(`Found ${(res||[]).length} drivers.`);
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
                setDrivers(res);
                setSelected(null);
                setStatus(`Found ${(res).length} cat files.`);
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
                setDrivers(res);
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
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#1e1e1e', fontFamily: 'Segoe UI, sans-serif' }}>
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
                <DriverList drivers={filteredDrivers} selected={selected} onSelect={setSelected} />

                {/* Right Panel for Details */}
                <div style={{ width: '450px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #333' }}>
                    <MetadataView driver={selected} />
                </div>
            </div>

            {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        </div>
    );
}

export default App;
