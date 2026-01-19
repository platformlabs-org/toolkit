import React from "react";

export function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="modalMask"
      role="dialog"
      aria-modal="true"
      style={{ ["--wails-draggable" as any]: "drag" }}
    >
      <div className="modal" style={{ ["--wails-draggable" as any]: "no-drag" }}>
        <div className="modalHeader">
          <div className="modalTitle">{props.title}</div>
          <button className="btn btnGhost" onClick={props.onClose}>
            关闭
          </button>
        </div>
        <div className="modalBody">{props.children}</div>
      </div>
    </div>
  );
}
