import { CHROMATIC_NOTES, CHROMATIC_NOTES_FLAT, NOTE_TO_INDEX } from "./constants.js";

export function transposeDetectedKey(keyLabel, semitoneShift) {
  if (!keyLabel) return "";
  const [root, ...rest] = keyLabel.trim().split(/\s+/);
  const quality = rest.join(" ");
  const prefersFlat = root.includes("b");
  const idx = NOTE_TO_INDEX[root];
  if (idx == null) return keyLabel.trim();
  const nextIdx = (idx + semitoneShift + 120) % 12;
  const nextRoot = prefersFlat ? CHROMATIC_NOTES_FLAT[nextIdx] : CHROMATIC_NOTES[nextIdx];
  return quality ? `${nextRoot} ${quality}` : nextRoot;
}
