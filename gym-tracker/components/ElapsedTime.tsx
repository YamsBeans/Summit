import { useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

export function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The workout clock. It owns the once-a-second tick so only this label
 * re-renders, not the whole workout screen and every exercise card under it.
 */
export default function ElapsedTime({ startTs, running, style }: { startTs: number | null; running: boolean; style: StyleProp<TextStyle> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const secs = startTs != null ? Math.max(0, Math.floor((now - startTs) / 1000)) : 0;
  return <Text style={style}>{formatElapsed(secs)}</Text>;
}
