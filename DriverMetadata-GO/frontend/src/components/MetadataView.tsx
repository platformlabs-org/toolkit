import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DriverInfo } from '../types';

// @ts-ignore
import { CopyToClipboard } from '../../wailsjs/go/main/App';

interface MetadataViewProps {
  driver: DriverInfo | null;
}

const DEBUG_COPY = false; // 需要排查时改成 true

function buildCopyText(driver: DriverInfo): string {
  const lines: string[] = [];

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
  const hardwareIds = driver.hardwareIds ?? [];
  if (hardwareIds.length > 0) {
    for (const hid of hardwareIds) {
      const isHit =
        hid === driver.rawMatchedHardwareId || hid === driver.displayMatchedHardwareId;
      lines.push(` │   ► ${hid}${isHit ? ' [HIT ID]' : ''}`);
    }
  } else {
    lines.push(` │   (None)`);
  }

  const meta = driver.metadata ?? {};
  const metaEntries = Object.entries(meta);

  if (metaEntries.length > 0) {
    lines.push(` └─ CAT Metadata:`);
    for (const [k, v] of metaEntries) {
      lines.push(`    > ${k.padEnd(22)} : ${v}`);
    }
  } else {
    lines.push(` └─ CAT Metadata: (None)`);
  }

  return lines.join('\n');
}

const MetadataView: React.FC<MetadataViewProps> = ({ driver }) => {
  const [copyFeedback, setCopyFeedback] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const feedbackTimerRef = useRef<number | null>(null);

  // 切换 driver 时清掉反馈与定时器，避免残留
  useEffect(() => {
    setCopyFeedback('');
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, [driver?.catalogPath, driver?.deviceName]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const copyText = useMemo(() => {
    return driver ? buildCopyText(driver) : '';
  }, [driver]);

  const flashFeedback = useCallback((msg: string, ms = 2000) => {
    setCopyFeedback(msg);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('');
      feedbackTimerRef.current = null;
    }, ms);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!driver || isCopying) return;

    try {
      setIsCopying(true);

      if (DEBUG_COPY) {
        console.groupCollapsed(`[COPY] len=${copyText.length}`);
        console.log(copyText);
        console.groupEnd();
        console.time('[COPY] backend');
      }

      await CopyToClipboard(copyText);

      if (DEBUG_COPY) {
        console.timeEnd('[COPY] backend');
        console.log('[COPY] backend done');
      }

      flashFeedback('Copied!');
    } catch (err) {
      if (DEBUG_COPY) {
        console.error('[COPY] backend failed', err);
      } else {
        console.error('Backend copy failed', err);
      }
      flashFeedback('Error');
    } finally {
      setIsCopying(false);
    }
  }, [driver, isCopying, copyText, flashFeedback]);

  if (!driver) {
    return <div style={{ padding: '20px', color: '#666' }}>Select a driver to view details</div>;
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '10px',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        fontSize: '13px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #333',
          paddingBottom: '5px',
          marginBottom: '10px',
        }}
      >
        <h3 style={{ margin: 0, color: '#4ec9b0', fontSize: '16px' }}>{driver.deviceName}</h3>

        <button
          onClick={handleCopy}
          disabled={isCopying}
          style={{
            padding: '4px 10px',
            backgroundColor: isCopying ? '#2a2a2a' : '#2d2d2d',
            border: '1px solid #454545',
            color: isCopying ? '#777' : '#ccc',
            cursor: isCopying ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
          onMouseEnter={(e) => {
            if (!isCopying) e.currentTarget.style.backgroundColor = '#3e3e42';
          }}
          onMouseLeave={(e) => {
            if (!isCopying) e.currentTarget.style.backgroundColor = '#2d2d2d';
          }}
          title={isCopying ? 'Copying...' : 'Copy all details'}
        >
          {isCopying ? 'Copying…' : 'Copy All'}
          {copyFeedback && (
            <span style={{ color: copyFeedback === 'Error' ? '#f48771' : '#6a9955', marginLeft: '4px' }}>
              &#10003; {copyFeedback}
            </span>
          )}
        </button>
      </div>

      <div style={sectionStyle}>
        <strong style={headerStyle}>General Info</strong>
        <div style={rowStyle}>
          <span style={labelStyle}>Manufacturer:</span> {driver.manufacturer}
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Version:</span> {driver.version}
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Inf Name:</span> {driver.infName}
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Catalog:</span> {driver.catalogPath || 'N/A'}
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>PnP Device ID:</span> {driver.pnpDeviceId}
        </div>
      </div>

      <div style={sectionStyle}>
        <strong style={headerStyle}>Hardware IDs</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px', fontFamily: 'monospace' }}>
          {(driver.hardwareIds ?? []).map((id, i) => {
            const isMatch = id === driver.rawMatchedHardwareId || id === driver.displayMatchedHardwareId;
            return (
              <li key={i} style={{ color: isMatch ? '#ce9178' : 'inherit' }}>
                {id}{' '}
                {isMatch && <span style={{ fontSize: '0.8em', color: '#6a9955' }}> (Match)</span>}
              </li>
            );
          })}
          {(!driver.hardwareIds || driver.hardwareIds.length === 0) && <li>(None)</li>}
        </ul>
      </div>

      <div style={sectionStyle}>
        <strong style={headerStyle}>CAT Metadata</strong>{' '}
        <span style={{ color: '#666' }}>(1.3.6.1.4.1.311.12.2.1)</span>
        {Object.keys(driver.metadata || {}).length === 0 ? (
          <div style={{ color: '#888', fontStyle: 'italic', padding: '5px' }}>No metadata found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '5px' }}>
            <tbody>
              {Object.entries(driver.metadata!).map(([k, v], i) => (
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
  marginBottom: '15px',
};

const headerStyle: React.CSSProperties = {
  display: 'block',
  borderBottom: '1px solid #333',
  paddingBottom: '2px',
  marginBottom: '5px',
  color: '#ccc',
};

const rowStyle: React.CSSProperties = {
  marginBottom: '3px',
};

const labelStyle: React.CSSProperties = {
  color: '#9cdcfe',
  display: 'inline-block',
  width: '120px',
};

const tdMetaStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #333',
  fontFamily: 'monospace',
  verticalAlign: 'top',
};

export default MetadataView;
