import { useState, useEffect } from "react";

const FRAMES = [".", "..", "..."];

export default function useAnimatedDots(active) {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    if (!active) { setDots("."); return; }
    let i = 0;
    const timer = setInterval(() => { i = (i + 1) % FRAMES.length; setDots(FRAMES[i]); }, 350);
    return () => clearInterval(timer);
  }, [active]);
  return dots;
}
