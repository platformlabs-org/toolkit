import React from 'react';

interface AboutModalProps {
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: '#252526',
                border: '1px solid #454545',
                padding: '20px',
                width: '300px',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                color: '#d4d4d4'
            }} onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0, color: '#4ec9b0' }}>About</h3>
                <p style={{ lineHeight: '1.6', margin: '15px 0' }}>
                    Lenovo Driver Metadata Tool<br />
                    by liuty24<br />
                    Lenovo Platform Enablement Team
                </p>
                <button
                    onClick={onClose}
                    style={{
                        padding: '6px 16px',
                        backgroundColor: '#007acc',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        marginTop: '10px'
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default AboutModal;
