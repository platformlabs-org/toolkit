import React, { useState, useEffect } from "react";
import {
  WindowMinimise,
  WindowToggleMaximise,
  WindowIsMaximised,
  Quit,
} from "../../wailsjs/runtime/runtime";
import { cls, fmtTime } from "../utils";
import { Modal } from "./Modal";

/** 自绘标题栏：可拖拽 + 双击最大化/还原 + 窗口按钮 */
export function TitleBar(props: {
  running: boolean;
  valid: boolean;
  lastTS: string;
  total: number;
  onStart: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const [max, setMax] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setMax(await WindowIsMaximised());
      } catch {}
    })();
  }, []);

  const toggleMax = async () => {
    try {
      await WindowToggleMaximise();
      setMax(await WindowIsMaximised());
    } catch {}
  };

  const minimise = async () => {
    try {
      await WindowMinimise();
    } catch {}
  };

  const close = async () => {
    try {
      await Quit();
    } catch {}
  };

  const statusText = !props.running ? "Stopped" : props.valid ? "Running" : "Limited";
  const dotClass = !props.running ? "dotOff" : props.valid ? "dotOn" : "dotWarn";

  const dragStyle = { ["--wails-draggable" as any]: "drag" };
  const noDragStyle = { ["--wails-draggable" as any]: "no-drag" };

  return (
    <>
      <header className="titlebarGlass" style={dragStyle} onDoubleClick={toggleMax}>
        <div className="brand" onClick={() => setAboutOpen(true)} style={{ cursor: "pointer" }}>
          <img src="/appicon.png" alt="Logo" className="logo" style={noDragStyle} />

          <div className="brandText">
            <div className="titleRow">
              <div className="title">UnderRun Monitor</div>
              {/* <span className="tinyMeta">Last: {fmtTime(props.lastTS)}</span> */}
            </div>
            <div className="subRow">
              <span className={cls("dot", dotClass)} />
              <span className="subtitle">{statusText}</span>
              <span className="sep" />
              <span className="tinyMeta">Total {props.total}</span>
            </div>
          </div>
        </div>

        <div className="rightZone" style={noDragStyle}>
          <div className="actions">
            <button className="btn iconBtn" onClick={props.onOpenSettings} title="Settings" style={{ marginRight: 8 }}>
              ⚙️
            </button>
            {!props.running ? (
              <button className="btn btnPrimary" onClick={props.onStart}>
                Start
              </button>
            ) : (
              <button className="btn btnDanger" onClick={props.onStop}>
                Stop
              </button>
            )}
          </div>

          <div className="winBtns">
            <button className="winBtn" onClick={minimise} aria-label="Minimise" title="Minimise">
              <span className="icoMin" />
            </button>

            <button
              className="winBtn"
              onClick={toggleMax}
              aria-label="Maximise"
              title={max ? "Restore" : "Maximise"}
            >
              <span className={cls("icoMax", max && "icoRestore")} />
            </button>

            <button className="winBtn winBtnClose" onClick={close} aria-label="Close" title="Close">
              <span className="icoClose" />
            </button>
          </div>
        </div>
      </header>

      <Modal open={aboutOpen} title="About" onClose={() => setAboutOpen(false)}>
        <div style={{ padding: "8px 4px", lineHeight: "1.6", color: "var(--fg)", textAlign: "center" }}>
          <p style={{ margin: 0 }}>
            UnderRun Monitor tool by liuty24
            <br />
            Lenovo Platform Enablement Team
          </p>
        </div>
      </Modal>
    </>
  );
}
