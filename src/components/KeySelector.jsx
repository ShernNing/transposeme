import React from "react";

// processedItems: array of processed history items (from App)
export default function KeySelector({
  youtubeKey,
  appliedSemitones,
  processing,
  isProcessingYouTube,
  handleTranspose,
  CHROMATIC_NOTES,
  CHROMATIC_NOTES_FLAT,
  NOTE_TO_INDEX,
  processedItems = [], // new prop, optional for backward compatibility
  youtubeUrl = "", // new prop, optional for backward compatibility
}) {
  if (!youtubeKey) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: "#9ae6b4", fontWeight: 600, marginBottom: 4 }}>
        Select a key to transpose:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {["major", "minor"].map((mode) => (
          <div key={mode} style={{ margin: "0 8px" }}>
            <div style={{
              color: "#a0aec0",
              fontSize: 12,
              marginBottom: 12, // increased space below label
              marginTop: -8,    // move label higher
              textAlign: "center"
            }}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</div>
            {CHROMATIC_NOTES.map((note, i) => {
              const prefersFlat = youtubeKey.includes("b");
              const noteName = prefersFlat ? CHROMATIC_NOTES_FLAT[i] : note;
              const label = `${noteName} ${mode}`;
              const [origRoot, ...origRest] = youtubeKey.trim().split(/\s+/);
              const origMode = (origRest.join(" ").toLowerCase().includes("minor")) ? "minor" : "major";
              const origIdx = NOTE_TO_INDEX[origRoot];
              const targetIdx = NOTE_TO_INDEX[note];
              let shift = null;
              if (origIdx != null && targetIdx != null) {
                if (origMode === mode) {
                  shift = (targetIdx - origIdx + 12) % 12;
                  if (shift > 6) shift -= 12;
                }
              }
              const isCurrent = shift !== null && shift === appliedSemitones && origMode === mode;
              const isOriginal = shift === 0 && origMode === mode;
              // Check if this key has been processed before (for this YouTube URL)
              let hasBeenProcessed = false;
              if (processedItems && youtubeUrl && shift !== null && shift !== 0) {
                hasBeenProcessed = processedItems.some(item =>
                  item.isYouTube && item.youtubeUrl === youtubeUrl && Number(item.semitones) === shift
                );
              }
              // Do not show 'Done' if playing (isCurrent) or original (isOriginal)
              const showDone = hasBeenProcessed && !isCurrent && !isOriginal;
              return (
                <button
                  key={label}
                  disabled={shift === null || processing || isProcessingYouTube}
                  style={{
                    margin: 2,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: isCurrent ? "2px solid #38a169" : isOriginal ? "2px solid #3182ce" : showDone ? "2px solid orange" : "1px solid #4a5568",
                    background: isCurrent ? "#22543d" : isOriginal ? "#2b4360" : showDone ? "#ff9800" : "#2d3748",
                    color: isCurrent ? "#9ae6b4" : isOriginal ? "#90cdf4" : showDone ? "#fff" : "#e2e8f0",
                    fontWeight: isCurrent || isOriginal || showDone ? 700 : 400,
                    opacity: shift === null ? 0.4 : 1,
                    cursor: shift === null ? "not-allowed" : "pointer",
                    minWidth: 38,
                    position: "relative",
                  }}
                  onClick={() => {
                    if (shift !== null) handleTranspose(shift);
                  }}
                  title={
                    isOriginal
                      ? "Original key"
                      : isCurrent
                      ? "Currently playing key"
                      : showDone
                      ? "Already processed key"
                      : "Transpose to this key"
                  }
                >
                  {label}
                  {isOriginal && (
                    <span style={{
                      position: "absolute",
                      top: -15,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      color: "#63b3ed",
                      fontWeight: 700,
                    }}>
                      Ori Key
                    </span>
                  )}
                  {isCurrent && !isOriginal && (
                    <span style={{
                      position: "absolute",
                      top: -15,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      color: "#68d391",
                      fontWeight: 700,
                    }}>
                      Playing
                    </span>
                  )}
                  {showDone && (
                    <span style={{
                      position: "absolute",
                      top: -15,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      color: "orange",
                      fontWeight: 700,
                    }}>
                      Processed
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
          <div style={{ color: "#a0aec0", fontSize: 11, marginTop: 4 }}>
            <span style={{ color: "#63b3ed", fontWeight: 700 }}>Orig</span> = Original key.{' '}
            <span style={{ color: "#68d391", fontWeight: 700 }}>Playing</span> = Currently playing key.{' '}
            <span style={{ color: "orange", fontWeight: 700 }}>Processed</span> = Already processed key.
            Only keys matching the original mode are enabled.<br/>
          </div>
    </div>
  );
}
