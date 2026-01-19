import { useState, useEffect } from "react";

/** ResizeObserver：窗口变化时更顺滑自适应 */
export function useViewport(rootRef: React.RefObject<HTMLElement>) {
  const [vp, setVp] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setVp({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootRef]);

  const isNarrow = vp.w > 0 && vp.w < 920;
  const isVeryNarrow = vp.w > 0 && vp.w < 560;
  const isShort = vp.h > 0 && vp.h < 520;
  const isVeryShort = vp.h > 0 && vp.h < 420;

  return { ...vp, isNarrow, isVeryNarrow, isShort, isVeryShort };
}
