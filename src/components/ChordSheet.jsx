import React, { memo, useMemo } from "react";
import { CHROMATIC_NOTES, CHROMATIC_NOTES_FLAT, NOTE_TO_INDEX } from "../utils/constants";

function getChordsForKey(keyLabel) {
  if (!keyLabel) return [];
  const [root, mode = "major"] = keyLabel.split(/\s+/);
  const idx = NOTE_TO_INDEX[root];
  if (idx == null) return [];
  const notes = root.includes("b") ? CHROMATIC_NOTES_FLAT : CHROMATIC_NOTES;
  const isMinor = mode.toLowerCase().includes("minor");
  const scale = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const qualities = isMinor
    ? ["m", "dim", "M", "m", "m", "M", "M"]
    : ["M", "m", "m", "M", "M", "m", "dim"];
  const roman = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  return scale.map((interval, i) => {
    const note = notes[(idx + interval) % 12];
    return `${roman[i]}: ${note}${qualities[i] === "M" ? "" : qualities[i]}`;
  });
}

function ChordSheet({ keyLabel }) {
  const chords = useMemo(() => getChordsForKey(keyLabel), [keyLabel]);
  if (!keyLabel) return null;

  return (
    <div style={{ margin: "16px 0", textAlign: "center" }}>
      <div style={{ fontWeight: 600, color: "#f6e05e", marginBottom: 8 }}>
        Chord Sheet for {keyLabel}
      </div>
      {chords.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          {chords.map((chord, i) => (
            <span
              key={i}
              style={{
                background: "#23272e",
                color: "#9ae6b4",
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 15,
              }}
            >
              {chord}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: "#a0aec0" }}>No chord info available.</div>
      )}
    </div>
  );
}

export default memo(ChordSheet);
