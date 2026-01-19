import React from "react";
import { Modal } from "./Modal";
import { cls } from "../utils";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  paths: string[];
  volume: number;
  onVolumeChange: (v: number) => void;
  alwaysOnTop: boolean;
  onAlwaysOnTopChange: (v: boolean) => void;
  closeToTray: boolean;
  onCloseToTrayChange: (v: boolean) => void;
}

export function SettingsModal(props: SettingsModalProps) {
  return (
    <Modal open={props.open} title="Settings" onClose={props.onClose}>
      <div className="settingsBox">
        {/* Registry Paths Section */}
        <div className="settingSection">
          <div className="settingTitle">Monitored Registry Paths</div>
          <div className="pathList fancyScroll">
            {props.paths.map((p, i) => (
              <div key={i} className="pathItem">
                {p}
              </div>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* Window Behavior Section */}
        <div className="settingSection">
          <div className="settingTitle">Window Behavior</div>

          <div className="settingRow">
            <label className="settingLabel">
              <input
                type="checkbox"
                checked={props.alwaysOnTop}
                onChange={(e) => props.onAlwaysOnTopChange(e.target.checked)}
              />
              <span>Always on Top</span>
            </label>
          </div>

          <div className="settingRow">
            <div className="settingLabelGroup">
              <span>Close Action:</span>
              <div className="radioGroup">
                <label>
                  <input
                    type="radio"
                    name="closeAction"
                    checked={props.closeToTray}
                    onChange={() => props.onCloseToTrayChange(true)}
                  />
                  Minimize to Tray
                </label>
                <label>
                  <input
                    type="radio"
                    name="closeAction"
                    checked={!props.closeToTray}
                    onChange={() => props.onCloseToTrayChange(false)}
                  />
                  Quit
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Alert Section */}
        <div className="settingSection">
          <div className="settingTitle">Alert Volume</div>
          <div className="settingRow">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={props.volume}
              onChange={(e) => props.onVolumeChange(parseFloat(e.target.value))}
              style={{ flex: 1, marginRight: "10px" }}
            />
            <span className="mono">{Math.round(props.volume * 100)}%</span>
          </div>
        </div>
      </div>

      <style>{`
        .settingsBox {
          padding: 16px;
          color: var(--fg);
        }
        .settingSection {
          margin-bottom: 16px;
        }
        .settingTitle {
          font-size: 0.85em;
          opacity: 0.7;
          text-transform: uppercase;
          margin-bottom: 8px;
          font-weight: 600;
        }
        .pathList {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 8px;
          max-height: 100px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 0.75em;
          word-break: break-all;
        }
        .pathItem {
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .pathItem:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        .settingRow {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .settingLabel {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .settingLabelGroup {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .radioGroup {
            display: flex;
            gap: 16px;
        }
        .radioGroup label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-size: 0.9em;
        }
      `}</style>
    </Modal>
  );
}
