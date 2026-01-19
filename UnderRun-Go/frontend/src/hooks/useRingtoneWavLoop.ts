import { useRef } from "react";

/**
 * 循环播放 WAV（HTMLAudioElement）
 * - unlock(): 用户手势下调用一次，最大限度避免后续 play 被拦截
 * - startLoop(): 开始循环播放
 * - stop(): 停止并回到开头
 */
export function useRingtoneWavLoop(src = "/sounds/alert.wav") {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isLoopingRef = useRef(false);

  const ensure = () => {
    if (!audioRef.current) {
      const a = new Audio(src);
      a.preload = "auto";
      a.loop = true;
      a.volume = 1.0;
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const unlock = async () => {
    // 如果已经在循环（或打算循环），不要打断
    if (isLoopingRef.current) return;

    const a = ensure();
    // 如果已经在播放，也不要打断
    if (!a.paused) return;

    try {
      a.muted = true;
      await a.play();

      // ✅ 关键修复：如果在 play() 过程中（await 期间）触发了 startLoop，
      // isLoopingRef 会变 true。此时不应该 pause，而应该保持播放。
      if (isLoopingRef.current) {
        a.muted = false;
        return;
      }

      a.pause();
      a.currentTime = 0;
      a.muted = false;
    } catch {
      a.muted = false;
    }
  };

  const startLoop = async (volume = 0.9) => {
    isLoopingRef.current = true;
    const a = ensure();
    a.loop = true;
    a.volume = volume;

    if (!a.paused) return;

    try {
      await a.play();
    } catch (e) {
      console.warn("audio play blocked:", e);
    }
  };

  const stop = () => {
    isLoopingRef.current = false;
    const a = ensure();
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  };

  return { unlock, startLoop, stop };
}
