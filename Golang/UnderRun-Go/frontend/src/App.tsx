import React, { useEffect, useMemo, useRef, useState } from "react";
import { EventsOn } from "../wailsjs/runtime/runtime";
import {
  Start,
  Stop,
  GetCurrentStatus,
  ResetPipe,
  GetSettings,
  SetCloseToTray,
  SetAlwaysOnTop,
  GetMonitoredPaths,
} from "../wailsjs/go/main/App";

import { useRingtoneWavLoop } from "./hooks/useRingtoneWavLoop";
import { useViewport } from "./hooks/useViewport";
import { StatCard } from "./components/StatCard";
import { Modal } from "./components/Modal";
import { TitleBar } from "./components/TitleBar";
import { SettingsModal } from "./components/SettingsModal";
import { URSnapshot, URChange, ChangeRecord } from "./types";
import { cls, fmtTime } from "./utils";

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { isNarrow, isVeryNarrow, isShort, isVeryShort } = useViewport(rootRef);

  // Status State
  const [running, setRunning] = useState(true);
  const [snap, setSnap] = useState<URSnapshot>({
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    valid: false,
    ts: "",
  });
  const prevRef = useRef<URSnapshot | null>(null);
  const [prevForUI, setPrevForUI] = useState<URSnapshot | null>(null);
  const [changes, setChanges] = useState<ChangeRecord[]>([]);

  // Modals
  const [alertOpen, setAlertOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  // Settings State
  const [volume, setVolume] = useState(1.0);
  const [paths, setPaths] = useState<string[]>([]);
  const [closeToTray, setCloseToTray] = useState(true);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);

  // Audio
  const ringtone = useRingtoneWavLoop("/sounds/alert.wav");
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Load Settings & Initial State
  useEffect(() => {
    (async () => {
      try {
        const settings = await GetSettings();
        setCloseToTray(settings.closeToTray);
        setAlwaysOnTopState(settings.alwaysOnTop);

        const p = await GetMonitoredPaths();
        setPaths(p);

        const s = (await GetCurrentStatus()) as URSnapshot;
        prevRef.current = s;
        setPrevForUI(s);
        setSnap(s);
      } catch (e) {
        console.warn("Init failed:", e);
      }
    })();
  }, []);

  // Set up listeners
  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();
    const disableContextKeys = (e: KeyboardEvent) => {
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
      }
    };
    window.addEventListener("contextmenu", disableContextMenu, { capture: true });
    window.addEventListener("keydown", disableContextKeys, { capture: true });

    Start().catch(() => {});

    const unlockOnce = async () => {
      await ringtone.unlock();
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
    window.addEventListener("pointerdown", unlockOnce, { passive: true });
    window.addEventListener("keydown", unlockOnce);

    const offUpdate = EventsOn("underrun:update", (data: any) => {
      const s = data as URSnapshot;
      const prev = prevRef.current;
      if (
        prev &&
        s.valid === prev.valid &&
        s.a === prev.a &&
        s.b === prev.b &&
        s.c === prev.c &&
        s.d === prev.d
      ) {
        return;
      }
      if (prev) setPrevForUI(prev);
      prevRef.current = s;
      setSnap(s);
    });

    const offChange = EventsOn("underrun:change", async (data: any) => {
      const change = data as URChange;
      setAlertOpen(true);
      // Use current volume from ref
      await ringtone.startLoop(volumeRef.current);

      setChanges((prev) => {
        const rec: ChangeRecord = {
          id: `${change.changedAt}-${Math.random().toString(16).slice(2)}`,
          changedAt: change.changedAt,
          diffs: change.diffs,
          curr: change.curr,
        };
        const next = [rec, ...prev];
        return next.slice(0, 80);
      });
    });

    const offErr = EventsOn("underrun:error", (data: any) => {
      console.warn("underrun:error", data);
    });

    return () => {
      offUpdate();
      offChange();
      offErr();
      window.removeEventListener("contextmenu", disableContextMenu, { capture: true } as any);
      window.removeEventListener("keydown", disableContextKeys, { capture: true } as any);
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  const changedFlags = useMemo(() => {
    const p = prevForUI;
    if (!p) return { a: false, b: false, c: false, d: false };
    return { a: snap.a !== p.a, b: snap.b !== p.b, c: snap.c !== p.c, d: snap.d !== p.d };
  }, [snap, prevForUI]);

  const total = snap.a + snap.b + snap.c + snap.d;

  const startMonitor = async () => {
    await ringtone.unlock();
    try {
      await Start();
      setRunning(true);
    } catch {}
  };

  const stopMonitor = async () => {
    try {
      await Stop();
    } catch {}
    setRunning(false);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    ringtone.stop();
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    try {
      await Stop();
      await ResetPipe(resetTarget);
      await Start();
      setRunning(true);
    } catch (e) {
      console.error("Failed to reset pipe:", e);
      try {
        await Start();
        setRunning(true);
      } catch {}
    }
    setResetTarget(null);
  };

  const handleCloseToTrayChange = async (val: boolean) => {
    setCloseToTray(val);
    await SetCloseToTray(val);
  };

  const handleAlwaysOnTopChange = async (val: boolean) => {
    setAlwaysOnTopState(val);
    await SetAlwaysOnTop(val);
  };

  return (
    <div
      ref={rootRef}
      className={cls(
        "app",
        isNarrow && "bpNarrow",
        isVeryNarrow && "bpVeryNarrow",
        isShort && "bpShort",
        isVeryShort && "bpVeryShort"
      )}
    >
      <TitleBar
        running={running}
        valid={snap.valid}
        lastTS={snap.ts}
        total={total}
        onStart={startMonitor}
        onStop={stopMonitor}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mainArea fancyScroll">
        <div className="grid">
          <section className="panel panelGlass">
            <div className="panelHeadCompact">
              <div className="panelTitle">Pipes</div>
              <div className="miniInfo">
                <span className={cls("miniTag", snap.valid ? "tagOk" : "tagWarn")}>
                  {snap.valid ? "OK" : "NA"}
                </span>
              </div>
            </div>

            <div className="cards">
              <StatCard
                title="A"
                value={snap.a}
                accent="violet"
                changed={changedFlags.a}
                onDoubleClick={() => setResetTarget("A")}
              />
              <StatCard
                title="B"
                value={snap.b}
                accent="cyan"
                changed={changedFlags.b}
                onDoubleClick={() => setResetTarget("B")}
              />
              <StatCard
                title="C"
                value={snap.c}
                accent="amber"
                changed={changedFlags.c}
                onDoubleClick={() => setResetTarget("C")}
              />
              <StatCard
                title="D"
                value={snap.d}
                accent="rose"
                changed={changedFlags.d}
                onDoubleClick={() => setResetTarget("D")}
              />
            </div>
          </section>

          <section className="panel panelGlass">
            <div className="panelHeadCompact">
              <div className="panelTitle">Changes</div>
              <div className="miniInfo">
                <span className="tinyMeta">{changes.length}</span>
              </div>
            </div>

            <div className="log fancyScroll">
              {changes.length === 0 ? (
                <div className="empty">
                  <div className="emptyTitle">No changes</div>
                  <div className="emptyHint">Waiting…</div>
                </div>
              ) : (
                changes.map((r) => (
                  <div className="logItem" key={r.id}>
                    <div className="logTop">
                      <div className="logTime">{fmtTime(r.changedAt)}</div>
                      <div className="logNow mono">
                        A={r.curr.a} B={r.curr.b} C={r.curr.c} D={r.curr.d}
                      </div>
                    </div>
                    <div className="logDiffs">
                      {r.diffs.map((d, i) => (
                        <span className="diffChip" key={`${r.id}-${i}`}>
                          <b>{d.pipe}</b>&nbsp;{d.prev} → {d.curr}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        paths={paths}
        volume={volume}
        onVolumeChange={setVolume}
        closeToTray={closeToTray}
        onCloseToTrayChange={handleCloseToTrayChange}
        alwaysOnTop={alwaysOnTop}
        onAlwaysOnTopChange={handleAlwaysOnTopChange}
      />

      <Modal open={alertOpen} title="⚠️ UnderRun Occured" onClose={closeAlert}>
        <div className="alertBox">
          <div className="alertRow">
            <div className="alertLabel">Time</div>
            <div className="alertValue">{changes[0] ? fmtTime(changes[0].changedAt) : "-"}</div>
          </div>

          <div className="alertRow">
            <div className="alertLabel">Now</div>
            <div className="alertValue mono">
              A={snap.a} &nbsp; B={snap.b} &nbsp; C={snap.c} &nbsp; D={snap.d}
            </div>
          </div>

          <div className="divider" />

          <div className="diffList">
            {(changes[0]?.diffs ?? []).map((d, idx) => (
              <div className="diffRow" key={idx}>
                <div className="diffPipe">{d.pipe}</div>
                <div className="diffArrow">
                  <span className="mono">{d.prev}</span>
                  <span className="arrow">→</span>
                  <span className="mono">{d.curr}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="divider" />
          <div className="modalTips">Close to stop ringtone.</div>
        </div>
      </Modal>

      <Modal
        open={!!resetTarget}
        title="Confirm Reset"
        onClose={() => setResetTarget(null)}
      >
        <div style={{ padding: "16px", color: "var(--fg)" }}>
          <p style={{ margin: "0 0 20px 0" }}>
            Are you sure you want to reset registry value for <b>Pipe {resetTarget}</b> to 0?
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button className="btn" onClick={() => setResetTarget(null)}>
              Cancel
            </button>
            <button className="btn btnDanger" onClick={handleReset}>
              Confirm Reset
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
