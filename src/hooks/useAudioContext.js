import { useRef, useCallback } from "react";

export default function useAudioContext() {
  const audioCtxRef = useRef(null);

  const getAudioContext = useCallback(async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  return { audioCtxRef, getAudioContext };
}
