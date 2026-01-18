import React from 'react';
// @ts-ignore
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../wailsjs/runtime/runtime';

const TitleBar: React.FC = () => {
    const barStyle: React.CSSProperties = {
        height: '32px',
        backgroundColor: '#202020',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: '#e0e0e0',
        userSelect: 'none',
        // @ts-ignore
        '--wails-draggable': 'drag',
        borderBottom: '1px solid #333'
    };

    const titleStyle: React.CSSProperties = {
        paddingLeft: '12px',
        fontSize: '13px',
        fontWeight: 500,
        pointerEvents: 'none' // Allow drag through title
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
        color: '#e0e0e0',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s'
    };

    return (
        <div style={barStyle}>
            <div style={titleStyle}>Lenovo Driver Metadata Tool</div>
            <div style={controlsStyle}>
                <div
                    style={btnStyle}
                    onClick={WindowMinimise}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    &#9472;
                </div>
                <div
                    style={btnStyle}
                    onClick={WindowToggleMaximise}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    &#9633;
                </div>
                <div
                    style={{...btnStyle, fontSize: '16px'}}
                    onClick={Quit}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c42b1c'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    &#215;
                </div>
            </div>
        </div>
    );
};

export default TitleBar;
