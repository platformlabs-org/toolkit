import React, { useEffect, useRef, useState } from 'react';

interface VendorFilterProps {
    vendors: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
}

const VendorFilter: React.FC<VendorFilterProps> = ({ vendors, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleVendor = (v: string) => {
        if (selected.includes(v)) {
            onChange(selected.filter(s => s !== v));
        } else {
            onChange([...selected, v]);
        }
    };

    return (
        <div style={{ position: 'relative' }} ref={containerRef}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    padding: '6px 12px',
                    backgroundColor: '#3e3e42',
                    color: '#ccc',
                    border: '1px solid #555',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                Filter Vendors {selected.length > 0 && `(${selected.length})`} &#9662;
            </button>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    backgroundColor: '#252526',
                    border: '1px solid #454545',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    padding: '8px',
                    minWidth: '150px',
                    marginTop: '4px'
                }}>
                    {vendors.map(v => (
                        <div
                            key={v}
                            onClick={() => toggleVendor(v)}
                            style={{
                                padding: '4px 8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: '#d4d4d4',
                                fontSize: '13px',
                                userSelect: 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(v)}
                                readOnly
                                style={{ pointerEvents: 'none' }}
                            />
                            {v}
                        </div>
                    ))}
                    {vendors.length === 0 && <div style={{ color: '#888', padding: '4px' }}>No vendors available</div>}
                </div>
            )}
        </div>
    );
};

export default VendorFilter;
