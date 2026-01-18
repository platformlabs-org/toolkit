import React from 'react';
// @ts-ignore
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../wailsjs/runtime/runtime';

interface TitleBarProps {
    onAboutClick?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ onAboutClick }) => {
    const barStyle: React.CSSProperties = {
        height: '32px',
        backgroundColor: '#202020',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#ccc',
        userSelect: 'none',
        // @ts-ignore
        '--wails-draggable': 'drag',
        borderBottom: '1px solid #333'
    };

    const titleStyle: React.CSSProperties = {
        paddingLeft: '12px',
        fontSize: '12px',
        fontWeight: 'normal',
        pointerEvents: 'none', // Allow drag through title
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    };

    const controlsStyle: React.CSSProperties = {
        display: 'flex',
        height: '100%',
        // @ts-ignore
        '--wails-draggable': 'no-drag'
    };

    const btnStyle: React.CSSProperties = {
        width: '46px',
        height: '100%',
        border: 'none',
        backgroundColor: 'transparent',
        color: '#ccc',
        cursor: 'default', // standard windows behavior
        fontSize: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Segoe MDL2 Assets, Segoe UI, sans-serif' // Better font for glyphs
    };

    const aboutBtnStyle: React.CSSProperties = {
        padding: '0 12px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize: '12px',
        color: '#aaa',
        transition: 'color 0.2s',
        // @ts-ignore
        '--wails-draggable': 'no-drag'
    };

    return (
        <div style={barStyle}>
            <div style={titleStyle}>
                <span>Lenovo Driver Metadata Tool</span>
            </div>

            <div style={controlsStyle}>
                {/* About Button */}
                <div
                    style={aboutBtnStyle}
                    onClick={onAboutClick}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#aaa'}
                >
                    About
                </div>

                {/* Minimize */}
                <div
                    style={btnStyle}
                    onClick={WindowMinimise}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Minimize"
                >
                    &#xE921; {/* Chrome Minimize Icon or similar */}
                </div>

                {/* Maximize/Restore */}
                <div
                    style={btnStyle}
                    onClick={WindowToggleMaximise}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Maximize"
                >
                    &#xE922; {/* Chrome Maximize Icon */}
                </div>

                {/* Close */}
                <div
                    style={{...btnStyle, fontSize: '12px'}}
                    onClick={Quit}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#c42b1c';
                        e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#ccc';
                    }}
                    title="Close"
                >
                    &#xE8BB; {/* Chrome Close Icon */}
                </div>
            </div>
        </div>
    );
};

export default TitleBar;
